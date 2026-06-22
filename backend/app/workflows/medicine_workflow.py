"""
LangGraph workflow for Medicine Cost Optimizer
START → extraction → mapping → alternatives → savings → gemini_summary → END

Extraction strategy (split by file type):
  PDF  → PyMuPDF extracts text offline → Gemini TEXT model reads text
  IMG  → Gemini VISION model reads image directly

This saves ~50x tokens vs sending PDF as image bytes.

Frequency extraction: Gemini also extracts frequency (e.g. "twice daily", "BD")
and duration (e.g. "30 days") per medicine from prescriptions.
These are stored per medicine and returned in results for qty auto-calculation.
"""
import uuid
import base64
import json
import re
import google.generativeai as genai
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from app.core.config import settings
from app.services.generic_mapping_service import map_medicine
# Note: medicine_service.py removed — pharmacy_service handles all medicine operations

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

GEMINI_MODEL = "gemini-2.5-flash-lite"

# Threshold: only recommend switching if saving is >= Rs.10 per unit
MARGINAL_THRESHOLD = 10.0


# ── State ─────────────────────────────────────────────────────────────────────
class MedicineState(TypedDict):
    source: str
    # File fields — MUST be declared here so LangGraph does not strip them
    file_content_b64: Optional[str]
    file_mime: Optional[str]
    # Workflow data
    raw_medicines: List[str]
    # Raw extraction with frequency info: [{"name": str, "frequency": str, "duration": str}]
    raw_medicines_with_freq: Optional[List[dict]]
    mapped_medicines: List[dict]
    results: List[dict]
    original_cost: float
    optimized_cost: float
    total_saving: float
    summary: str
    error: Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Use PyMuPDF (fitz) to extract plain text from all pages of a PDF.
    Runs completely offline — no API call needed.
    """
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_text = []
        for page in doc:
            text = page.get_text("text")
            if text.strip():
                pages_text.append(text.strip())
        doc.close()
        return "\n".join(pages_text)
    except Exception as e:
        raise RuntimeError(f"PyMuPDF extraction failed: {str(e)}")


def _parse_medicine_json(raw_text: str) -> List[dict]:
    """
    Parse Gemini response into a list of medicine dicts with freq/duration.
    Handles JSON arrays with or without markdown code fences.
    Expected format: [{"name": "Telma 40", "frequency": "once daily", "duration": "30 days"}, ...]
    Falls back to plain string array for backward compat.
    """
    text = raw_text.strip()
    text = re.sub(r"```json|```", "", text).strip()
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                result = []
                for item in parsed:
                    if isinstance(item, dict):
                        result.append({
                            "name": str(item.get("name", "")).strip(),
                            "frequency": str(item.get("frequency", "")).strip(),
                            "duration": str(item.get("duration", "")).strip(),
                        })
                    elif isinstance(item, str):
                        result.append({"name": item.strip(), "frequency": "", "duration": ""})
                return [r for r in result if r["name"]]
        except json.JSONDecodeError:
            pass
    return []


def _parse_frequency_to_per_day(frequency: str) -> Optional[float]:
    """
    Convert a frequency string to doses per day.
    Gemini will provide strings like "twice daily", "BD", "OD", "TDS", "QID", etc.
    Returns None if unknown.
    """
    if not frequency:
        return None
    f = frequency.lower().strip()
    # Once daily
    if any(x in f for x in ["once daily", "od", "once a day", "1 time", "once"]):
        return 1.0
    # Twice daily
    if any(x in f for x in ["twice daily", "bd", "twice a day", "2 times", "twice", "bid"]):
        return 2.0
    # Three times
    if any(x in f for x in ["three times", "tds", "tid", "thrice", "3 times"]):
        return 3.0
    # Four times
    if any(x in f for x in ["four times", "qid", "qds", "4 times"]):
        return 4.0
    # Every 8 hours
    if "8 hour" in f or "8h" in f:
        return 3.0
    # Every 12 hours
    if "12 hour" in f or "12h" in f:
        return 2.0
    # Every 6 hours
    if "6 hour" in f or "6h" in f:
        return 4.0
    # Morning and night / morning and evening
    if ("morning" in f and "night" in f) or ("morning" in f and "evening" in f):
        return 2.0
    # Morning only
    if "morning" in f:
        return 1.0
    # Alternate day
    if "alternate" in f or "every other" in f:
        return 0.5
    return None


def _parse_duration_to_days(duration: str) -> Optional[int]:
    """
    Convert duration string to number of days.
    e.g. "30 days" → 30, "2 weeks" → 14, "1 month" → 30
    """
    if not duration:
        return None
    d = duration.lower().strip()
    # Days
    m = re.search(r'(\d+)\s*day', d)
    if m:
        return int(m.group(1))
    # Weeks
    m = re.search(r'(\d+)\s*week', d)
    if m:
        return int(m.group(1)) * 7
    # Months
    m = re.search(r'(\d+)\s*month', d)
    if m:
        return int(m.group(1)) * 30
    return None


async def _gemini_extract_from_text(prescription_text: str) -> List[dict]:
    """
    Send extracted PDF text to Gemini TEXT model.
    Extracts medicine name, frequency, and duration.
    """
    model = genai.GenerativeModel(GEMINI_MODEL)

    # Count numbered Rx lines to give Gemini an exact expected count
    import re as _re
    rx_matches = _re.findall(r'(?m)^\s*\d+[\.\)]\s+\S', prescription_text)
    rx_count   = len(rx_matches)
    count_hint = f"\nCRITICAL: I counted exactly {rx_count} numbered line(s) in the Rx section. Your JSON array MUST have exactly {rx_count} entries — no more, no less." if rx_count > 0 else ""

    prompt = f"""You are a medical prescription reader. Extract ONLY the medicines from the numbered Rx list.
{count_hint}

RULES — follow strictly:

1. ONLY numbered Rx lines (1., 2., 3. etc.) — one entry per line.
2. STOP at "Advice" / "Instructions" / "Notes" section — do NOT read medicine names from there.
   IGNORE lines like: "Telma 40 has a cheaper alternative - Telmisartan 40mg" (advice, not Rx)
   IGNORE lines like: "Rozavel 10 vs Rosuvas 10" (comparison, not Rx)
   IGNORE lines like: "Metformin 500 is already cheapest" (advice, not Rx)
   Only the numbered Rx table entries are valid.
3. strength: if separate Dose column exists use it (e.g. "500 mg" → "500mg"); if already in name set "".
4. frequency: plain English ("once daily", "twice daily", "as needed"). If missing: "".
5. duration: "30 days", "7 days" etc. If missing: "".
6. Skip: doctor names, patient names, dates, test names, allergy notes.

Prescription text:
\"\"\"
{prescription_text}
\"\"\"

Return ONLY a JSON array with exactly {rx_count if rx_count > 0 else 'N'} entries. No markdown, no explanation.
Example for 4 Rx items: [{{"name": "Telma 40", "strength": "", "frequency": "once daily", "duration": "30 days"}}, {{"name": "Glycomet GP2", "strength": "2mg/500mg", "frequency": "twice daily", "duration": "30 days"}}, {{"name": "Metformin 500", "strength": "500mg", "frequency": "once daily (night)", "duration": "30 days"}}, {{"name": "Rozavel 10", "strength": "10mg", "frequency": "once daily (night)", "duration": "30 days"}}]"""

    response = model.generate_content(prompt)
    return _parse_medicine_json(response.text)


async def _gemini_extract_from_image(image_bytes: bytes, mime_type: str) -> List[dict]:
    """
    Send image bytes directly to Gemini VISION model.
    Extracts medicine name, frequency, and duration.
    """
    model = genai.GenerativeModel(GEMINI_MODEL)

    prompt = """You are a medical prescription reader. Extract ONLY the medicines from the numbered Rx list.

RULES — follow strictly:

1. ONLY numbered Rx lines (1., 2., 3. etc.) — one entry per numbered line, no more.
2. STOP at "Advice" / "Instructions" / "Notes" section — do NOT read medicine names from there.
   IGNORE: "Telma 40 has a cheaper alternative - Telmisartan 40mg" (advice, not Rx)
   IGNORE: "Rozavel 10 vs Rosuvas 10" (comparison, not Rx)
   IGNORE: "Metformin 500 is already cheapest" (advice, not Rx)
3. strength: if separate Dose column exists use it (e.g. "500 mg" → "500mg"); if already in name set "".
4. frequency: plain English ("once daily", "twice daily", "as needed"). If missing: "".
5. duration: "30 days", "7 days" etc. If missing: "".
6. Skip: doctor names, patient names, dates, test names, allergy notes.

Return ONLY a JSON array. Number of entries MUST equal number of numbered Rx lines. No markdown, no explanation.
Example for 4 Rx items: [{"name": "Telma 40", "strength": "", "frequency": "once daily", "duration": "30 days"}, {"name": "Glycomet GP2", "strength": "2mg/500mg", "frequency": "twice daily", "duration": "30 days"}, {"name": "Metformin 500", "strength": "500mg", "frequency": "once daily (night)", "duration": "30 days"}, {"name": "Rozavel 10", "strength": "10mg", "frequency": "once daily (night)", "duration": "30 days"}]"""

    response = model.generate_content([
        {"mime_type": mime_type, "data": image_bytes},
        prompt
    ])
    return _parse_medicine_json(response.text)


# ── Node 1: Prescription Extraction ──────────────────────────────────────────
async def prescription_extraction_node(state: MedicineState) -> MedicineState:
    """
    Routes extraction based on file type:
      PDF  → PyMuPDF (offline text extraction) → Gemini text model
      IMG  → Gemini vision model directly
    Extracts medicine names + frequency + duration.
    """
    try:
        file_b64  = state.get("file_content_b64") or ""
        file_mime = state.get("file_mime") or "image/jpeg"

        if not file_b64:
            return {**state, "error": "No file content provided"}

        if not settings.GEMINI_API_KEY:
            return {**state, "error": (
                "Gemini API key not configured. "
                "Please add GEMINI_API_KEY to your .env file."
            )}

        file_bytes = base64.b64decode(file_b64)
        medicines_with_freq: List[dict] = []

        # ── PDF path: PyMuPDF → Gemini text ──────────────────────────────────
        if file_mime == "application/pdf":
            try:
                extracted_text = _extract_text_from_pdf_bytes(file_bytes)
            except RuntimeError as e:
                return {**state, "error": str(e)}

            if not extracted_text.strip():
                return {**state, "error": (
                    "Could not extract text from PDF. "
                    "The PDF may be scanned/image-based. "
                    "Please try uploading a JPG or PNG photo instead."
                )}

            medicines_with_freq = await _gemini_extract_from_text(extracted_text)

        # ── Image path: Gemini Vision directly ───────────────────────────────
        elif file_mime in ("image/jpeg", "image/jpg", "image/png"):
            medicines_with_freq = await _gemini_extract_from_image(file_bytes, file_mime)

        else:
            return {**state, "error": (
                f"Unsupported file type: {file_mime}. "
                "Please upload a PDF, JPG, or PNG."
            )}

        # ── Fix 2: Within-PDF deduplication ──────────────────────────────────
        # Deduplicate by resolved name WITHIN this single extraction.
        # Prevents advice-section mentions creating duplicate rows.
        # (Does NOT deduplicate across multiple PDFs — that is intentional.)
        seen_names: set = set()
        unique_medicines = []
        for med in medicines_with_freq:
            key = med["name"].lower().strip()
            if key not in seen_names:
                seen_names.add(key)
                unique_medicines.append(med)
        medicines_with_freq = unique_medicines

        if not medicines_with_freq:
            return {**state, "error": (
                "No medicines detected in the prescription. "
                "Please ensure the file is clear and readable, "
                "or try the Manual Selection tab."
            )}

        # Extract plain names list for mapping node
        raw_names = [m["name"] for m in medicines_with_freq]

        return {
            **state,
            "raw_medicines": raw_names,
            "raw_medicines_with_freq": medicines_with_freq,
            "error": None,
        }

    except json.JSONDecodeError:
        return {**state, "error": "Could not parse the response from AI. Please try again."}
    except Exception as e:
        return {**state, "error": f"Extraction error: {str(e)}"}


# ── Node 2: Medicine Mapping ──────────────────────────────────────────────────
async def medicine_mapping_node(state: MedicineState) -> MedicineState:
    """Map each raw medicine name to catalog entry, passing extracted strength."""
    if state.get("error"):
        return state

    # Build strength lookup keyed by raw name (lowercase)
    strength_lookup: dict = {}
    for item in (state.get("raw_medicines_with_freq") or []):
        strength_lookup[item["name"].lower()] = item.get("strength", "")

    mapped = []
    for name in state.get("raw_medicines", []):
        extracted_strength = strength_lookup.get(name.lower(), "")
        info = await map_medicine(name, extracted_strength)
        mapped.append(info)
    return {**state, "mapped_medicines": mapped}


# ── Node 3: Alternative Finder ────────────────────────────────────────────────
async def alternative_finder_node(state: MedicineState) -> MedicineState:
    """Alternatives already embedded by map_medicine. Pass through."""
    if state.get("error"):
        return state
    return state


# ── Node 4: Savings Calculator ────────────────────────────────────────────────
def savings_calculator_node(state: MedicineState) -> MedicineState:
    """
    4 status types per medicine:
      saving_found    — a better-priced alternative exists (saving >= Rs.10)
      already_best    — current medicine IS the cheapest available
      marginal_saving — cheaper exists but saving < Rs.10 (not worth switching)
      not_found       — not in catalog

    Selection logic (NOT always the cheapest):
    - If current medicine IS already the cheapest → already_best, keep it
    - If saving < Rs.10 → marginal_saving, keep original
    - If a better alternative saves >= Rs.10 → saving_found, auto-select cheapest
    - User can always override via dropdown in the UI

    Frequency/duration from prescription are attached per-result for
    qty auto-calculation in the frontend.
    """
    if state.get("error"):
        return state

    results         = []
    original_total  = 0.0
    optimized_total = 0.0

    # Build freq lookup — keyed by both raw name AND resolved catalog name
    freq_lookup: dict = {}
    raw_with_freq = state.get("raw_medicines_with_freq") or []
    for item in raw_with_freq:
        freq_lookup[item["name"].lower()] = item

    for med in state.get("mapped_medicines", []):
        current_price = med.get("price", 0)
        alternatives  = med.get("alternatives", [])
        not_in_db     = not med.get("found", True)

        # Look up frequency/duration:
        # Try resolved catalog name first, then original prescription name
        freq_info = (
            freq_lookup.get(med["name"].lower()) or
            freq_lookup.get((med.get("original_name") or "").lower()) or
            {}
        )
        frequency_str     = freq_info.get("frequency", "") or ""
        duration_str      = freq_info.get("duration", "") or ""
        frequency_per_day = _parse_frequency_to_per_day(frequency_str)
        duration_days     = _parse_duration_to_days(duration_str)

        # Compute initial qty from frequency × duration if both available
        initial_qty = 1
        if frequency_per_day and duration_days:
            initial_qty = max(1, round(frequency_per_day * duration_days))

        # ── Not found ─────────────────────────────────────────────────────────
        # price=0 means not resolved from pharmacies collection
        if not_in_db:
            results.append({
                "id":                     str(uuid.uuid4()),
                "name":                   med["name"],
                "active_ingredient":      med.get("active_ingredient", "Unknown"),
                "strength":               med.get("strength", ""),
                "current_price":          0,
                "alternatives":           [],
                "selected_medicine_name": med["name"],
                "selected_price":         0,
                "quantity":               initial_qty,
                "row_total":              0,
                "saving":                 0,
                "status":                 "not_found",
                "frequency":              frequency_str or None,
                "frequency_per_day":      frequency_per_day,
                "duration_days":          duration_days,
            })
            continue

        # ── Price = 0 means resolved but price comes from pharmacy (not catalog) ──
        # Set status as pending — MedicineTable will update after pharmacy/best runs
        if current_price == 0:
            results.append({
                "id":                     str(uuid.uuid4()),
                "name":                   med["name"],
                "active_ingredient":      med.get("active_ingredient", "Unknown"),
                "strength":               med.get("strength", ""),
                "current_price":          0,
                "alternatives":           [],
                "selected_medicine_name": med["name"],
                "selected_price":         0,
                "quantity":               initial_qty,
                "row_total":              0,
                "saving":                 0,
                "status":                 "pending_pharmacy",
                "frequency":              frequency_str or None,
                "frequency_per_day":      frequency_per_day,
                "duration_days":          duration_days,
            })
            continue

        # ── Build all options (current + alternatives) ────────────────────────
        all_options = [
            {"name": med["name"], "price": current_price}
        ] + [{"name": a["name"], "price": a["price"]} for a in alternatives]

        cheapest = min(all_options, key=lambda x: x["price"])
        saving   = round(current_price - cheapest["price"], 2)

        # ── Determine status ──────────────────────────────────────────────────
        if cheapest["price"] >= current_price:
            # Current IS already the cheapest
            status         = "already_best"
            selected_name  = med["name"]
            selected_price = current_price
            counted_saving = 0.0

        elif saving < MARGINAL_THRESHOLD:
            # Saving exists but too small to bother switching
            status         = "marginal_saving"
            selected_name  = med["name"]
            selected_price = current_price
            counted_saving = 0.0

        else:
            # Good saving found — auto-select cheapest, user can override
            status         = "saving_found"
            selected_name  = cheapest["name"]
            selected_price = cheapest["price"]
            counted_saving = saving

        original_total  += current_price
        optimized_total += selected_price

        results.append({
            "id":                     str(uuid.uuid4()),
            "name":                   med["name"],
            "active_ingredient":      med.get("active_ingredient", "Unknown"),
            "strength":               med.get("strength", ""),
            "current_price":          current_price,
            "alternatives":           alternatives,
            "selected_medicine_name": selected_name,
            "selected_price":         selected_price,
            "quantity":               initial_qty,
            "row_total":              round(selected_price * initial_qty, 2),
            "saving":                 round(counted_saving * initial_qty, 2),
            "status":                 status,
            "frequency":              frequency_str or None,
            "frequency_per_day":      frequency_per_day,
            "duration_days":          duration_days,
        })

    total_saving = max(0.0, round(original_total - optimized_total, 2))

    return {
        **state,
        "results":         results,
        "original_cost":   round(original_total, 2),
        "optimized_cost":  round(optimized_total, 2),
        "total_saving":    total_saving,
    }


# ── Node 5: Gemini Summary ────────────────────────────────────────────────────
async def gemini_summary_node(state: MedicineState) -> MedicineState:
    """Friendly cost summary via Gemini text model with rule-based fallback."""
    if state.get("error"):
        return state

    results   = state.get("results", [])
    n_pending = sum(1 for r in results if r.get("status") == "pending_pharmacy")

    # All medicines pending_pharmacy = pharmacy flow → return placeholder
    # Frontend will call /pharmacy/gemini-recommend for the real summary
    # after pharmacy prices + alternatives are known
    if n_pending == len(results) and len(results) > 0:
        n = len(results)
        n_not_found = sum(1 for r in results if r.get("status") == "not_found")
        if n_not_found > 0:
            placeholder = (
                f"I found {n} medicine(s) in your prescription. "
                f"{n_not_found} medicine(s) were not found in our pharmacy catalog — "
                f"please ask your pharmacist about those. "
                f"Finding best pharmacy prices for the remaining medicines… "
                f"Please consult your doctor or pharmacist before changing any prescribed medication."
            )
        else:
            placeholder = (
                f"I found {n} medicine(s) in your prescription. "
                f"Finding the best pharmacy prices and alternatives — this will update shortly. "
                f"Please consult your doctor or pharmacist before changing any prescribed medication."
            )
        return {**state, "summary": placeholder}

    # Mixed: some pending, some not_found — build summary from what we know
    active = [r for r in results if r.get("status") not in ("pending_pharmacy",)]
    n            = len(results)
    n_saving     = sum(1 for r in active if r.get("status") == "saving_found")
    n_best       = sum(1 for r in active if r.get("status") == "already_best")
    n_marginal   = sum(1 for r in active if r.get("status") == "marginal_saving")
    n_not_found  = sum(1 for r in results if r.get("status") == "not_found")
    total_saving = state.get("total_saving", 0)

    lines = []
    for r in active:
        s = r.get("status", "")
        if s == "saving_found":
            lines.append(
                f"- {r['name']} (Rs.{r['current_price']}) -> "
                f"{r['selected_medicine_name']} (Rs.{r['selected_price']}) "
                f"SAVE Rs.{r['saving']}"
            )
        elif s == "already_best":
            lines.append(
                f"- {r['name']} (Rs.{r['current_price']}) -> ALREADY BEST PRICE"
            )
        elif s == "marginal_saving":
            lines.append(
                f"- {r['name']} (Rs.{r['current_price']}) -> marginal difference only"
            )
        elif s == "not_found":
            lines.append(f"- {r['name']} -> NOT FOUND in catalog")

    prompt = f"""You are a healthcare cost advisor. Write a clear 3-4 sentence summary.

STRICT RULES:
- Use ONLY the data below. Never invent prices or medicine names.
- NEVER prescribe or recommend changing medicines on your own.
- Do NOT use the word "generic" — all medicines are just medicines at different price points.
- Always end with the safety advisory sentence.

Medicine analysis:
{chr(10).join(lines)}

Stats: {n} total | {n_saving} with good savings | {n_best} already best price
       {n_marginal} marginal saving | {n_not_found} not found
Total saving: Rs.{total_saving}

Start with: "I analyzed {n} medicine(s)."
Mention savings if any. Mention already-best positively if any.
Mention not-found and suggest pharmacist if any.
Last sentence MUST be: "Please consult your doctor or pharmacist before changing any prescribed medication."
Keep under 5 sentences. Be warm and factual."""

    try:
        if settings.GEMINI_API_KEY:
            model    = genai.GenerativeModel(GEMINI_MODEL)
            response = model.generate_content(prompt)
            summary  = response.text.strip()
        else:
            raise Exception("No key")
    except Exception:
        parts = [f"I analyzed {n} medicine(s)."]
        if n_saving > 0:
            parts.append(
                f"{n_saving} medicine(s) have more affordable alternatives "
                f"with an estimated saving of Rs.{total_saving}."
            )
        if n_best > 0:
            parts.append(
                f"{n_best} medicine(s) are already at the best "
                f"available price — no change needed."
            )
        if n_marginal > 0:
            parts.append(
                f"{n_marginal} medicine(s) have only a marginal "
                f"price difference and may not be worth switching."
            )
        if n_not_found > 0:
            parts.append(
                f"{n_not_found} medicine(s) were not found in our "
                f"catalog — please ask your pharmacist about alternatives."
            )
        parts.append(
            "Please consult your doctor or pharmacist before "
            "changing any prescribed medication."
        )
        summary = " ".join(parts)

    return {**state, "summary": summary}


# ── Build workflows ───────────────────────────────────────────────────────────
def build_manual_workflow():
    """Manual selection: skips extraction node entirely."""
    wf = StateGraph(MedicineState)
    wf.add_node("medicine_mapping",   medicine_mapping_node)
    wf.add_node("alternative_finder", alternative_finder_node)
    wf.add_node("savings_calculator", savings_calculator_node)
    wf.add_node("gemini_summary",     gemini_summary_node)
    wf.set_entry_point("medicine_mapping")
    wf.add_edge("medicine_mapping",   "alternative_finder")
    wf.add_edge("alternative_finder", "savings_calculator")
    wf.add_edge("savings_calculator", "gemini_summary")
    wf.add_edge("gemini_summary",     END)
    return wf.compile()


def build_prescription_workflow():
    """
    Prescription upload:
      PDF  → PyMuPDF text → Gemini text model
      IMG  → Gemini vision model
    Then mapping → alternatives → savings → summary.
    """
    wf = StateGraph(MedicineState)
    wf.add_node("prescription_extraction", prescription_extraction_node)
    wf.add_node("medicine_mapping",        medicine_mapping_node)
    wf.add_node("alternative_finder",      alternative_finder_node)
    wf.add_node("savings_calculator",      savings_calculator_node)
    wf.add_node("gemini_summary",          gemini_summary_node)
    wf.set_entry_point("prescription_extraction")
    wf.add_edge("prescription_extraction", "medicine_mapping")
    wf.add_edge("medicine_mapping",        "alternative_finder")
    wf.add_edge("alternative_finder",      "savings_calculator")
    wf.add_edge("savings_calculator",      "gemini_summary")
    wf.add_edge("gemini_summary",          END)
    return wf.compile()


_manual_wf       = None
_prescription_wf = None


def get_manual_workflow():
    global _manual_wf
    if _manual_wf is None:
        _manual_wf = build_manual_workflow()
    return _manual_wf


def get_prescription_workflow():
    global _prescription_wf
    if _prescription_wf is None:
        _prescription_wf = build_prescription_workflow()
    return _prescription_wf
