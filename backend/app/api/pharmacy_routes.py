"""
Pharmacy routes:
  GET  /pharmacy/list                → all pharmacies
  GET  /pharmacy/medicines           → all medicines from all pharmacies (grouped)
  POST /pharmacy/best                → best pharmacy for given medicine names
  POST /pharmacy/alternatives        → same ingredient+strength across all pharmacies
  POST /pharmacy/distances           → distance+time from user to selected pharmacies
  POST /pharmacy/gemini-recommend    → AI recommendation text
"""
import google.generativeai as genai
from fastapi import APIRouter, HTTPException, Depends
from app.api.auth import get_current_user
from app.core.config import settings
from app.services.pharmacy_service import (
    get_all_pharmacies,
    get_all_pharmacy_medicines,
    get_best_pharmacy_for_medicines,
    get_pharmacy_alternatives,
    calc_pharmacy_distances,
)

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

GEMINI_MODEL = "gemini-2.5-flash-lite"

router = APIRouter(prefix="/pharmacy", tags=["pharmacy"])


@router.get("/list")
async def list_pharmacies(current_user=Depends(get_current_user)):
    """List all pharmacies (no medicine details)."""
    return await get_all_pharmacies()


@router.get("/medicines")
async def list_pharmacy_medicines(current_user=Depends(get_current_user)):
    """All medicines from all pharmacies — for Add Medicine dropdown."""
    return await get_all_pharmacy_medicines()


@router.post("/best")
async def best_pharmacy(data: dict, current_user=Depends(get_current_user)):
    """
    Find best pharmacy for a list of medicine names.
    Body: {"medicine_names": ["Telma 40", "Metformin 500", ...]}
    """
    medicine_names = data.get("medicine_names", [])
    if not medicine_names:
        raise HTTPException(status_code=400, detail="Provide medicine_names list")
    return await get_best_pharmacy_for_medicines(medicine_names)


@router.post("/alternatives")
async def pharmacy_alternatives(data: dict, current_user=Depends(get_current_user)):
    """
    Get all alternatives (same ingredient+strength) across all pharmacies.
    Includes:
      - Same medicine at other pharmacies
      - Different same-ingredient medicines at ALL pharmacies (incl. current)
    Body: {
      "medicine_name": "Telma 40",
      "active_ingredient": "Telmisartan",
      "strength": "40mg",
      "current_pharmacy_id": "abc123"   ← optional, to exclude current selection
    }
    """
    medicine_name       = data.get("medicine_name", "")
    active_ingredient   = data.get("active_ingredient", "")
    strength            = data.get("strength", "")
    current_pharmacy_id = data.get("current_pharmacy_id", "")
    if not medicine_name:
        raise HTTPException(status_code=400, detail="Provide medicine_name")
    return await get_pharmacy_alternatives(
        medicine_name, active_ingredient, strength, current_pharmacy_id
    )


@router.post("/distances")
async def pharmacy_distances(data: dict, current_user=Depends(get_current_user)):
    """
    Calculate distance + travel time from user to selected pharmacies.
    Body: {"latitude": float, "longitude": float, "pharmacy_ids": ["id1", "id2"]}
    """
    lat          = data.get("latitude")
    lng          = data.get("longitude")
    pharmacy_ids = data.get("pharmacy_ids", [])
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Provide latitude and longitude")
    if not pharmacy_ids:
        raise HTTPException(status_code=400, detail="Provide pharmacy_ids list")
    return await calc_pharmacy_distances(lat, lng, pharmacy_ids)


@router.post("/gemini-recommend")
async def gemini_recommend(data: dict, current_user=Depends(get_current_user)):
    """
    AI recommendation + summary after pharmacy prices and alternatives are known.
    Body: {
      "pharmacy_scores": [...],
      "per_medicine": {...},
      "medicine_states": [   ← actual current state from MedicineTable
        {"name": "Telma 40", "current_price": 138, "selected_name": "Telmisartan 40mg",
         "selected_price": 55, "pharmacy": "Medline", "saving": 83, "status": "saving_found"},
        ...
      ]
    }
    """
    pharmacy_scores  = data.get("pharmacy_scores", [])
    medicine_states  = data.get("medicine_states", [])  # from MedicineTable after auto-select

    if not pharmacy_scores:
        return {"recommendation": "No pharmacy data provided."}

    best      = pharmacy_scores[0]
    n_meds    = len(medicine_states) if medicine_states else len(data.get("per_medicine", {}))
    n_found   = best.get("medicines_found", 0)
    missing   = best.get("medicines_missing", [])

    # Build pharmacy comparison lines
    pharm_lines = []
    for ps in pharmacy_scores[:5]:
        line = (
            f"- {ps['pharmacy_name']} ({ps['area']}): "
            f"Total Rs.{ps['total_cost']}, "
            f"{ps['medicines_found']}/{n_meds} medicines"
        )
        if ps.get("medicines_missing"):
            line += f", missing: {', '.join(ps['medicines_missing'])}"
        pharm_lines.append(line)

    # Build medicine savings lines from actual MedicineTable state
    med_lines = []
    n_saving    = 0
    n_best      = 0
    n_not_found = 0
    total_saving = 0
    for ms in medicine_states:
        status = ms.get("status", "")
        name   = ms.get("name", "")
        curr_p = ms.get("current_price", 0)
        sel_n  = ms.get("selected_name", name)
        sel_p  = ms.get("selected_price", curr_p)
        saving = ms.get("saving", 0)
        pharm  = ms.get("pharmacy", "")

        if status == "saving_found":
            n_saving    += 1
            total_saving += saving
            med_lines.append(
                f"- {name} @ {pharm} Rs.{curr_p} → {sel_n} Rs.{sel_p} (SAVE Rs.{saving})"
            )
        elif status == "already_best":
            n_best += 1
            med_lines.append(f"- {name} @ {pharm} Rs.{curr_p} → ALREADY BEST PRICE")
        elif status == "not_found":
            n_not_found += 1
            med_lines.append(f"- {name} → NOT FOUND in catalog")
        else:
            med_lines.append(f"- {name} @ {pharm} Rs.{curr_p}")

    prompt = f"""You are a pharmacy cost advisor. Write a warm, helpful 3-4 sentence summary.

STRICT RULES:
- Use ONLY the data below. Never invent prices.
- Do NOT say "generic" — all medicines are just medicines at different price points.
- Last sentence MUST be: "Please consult your doctor or pharmacist before changing any prescribed medication."

Recommended pharmacy: {best['pharmacy_name']} ({best['area']}) — Total Rs.{best['total_cost']}

Medicine analysis:
{chr(10).join(med_lines) if med_lines else chr(10).join(pharm_lines)}

Stats: {n_saving} with cheaper alternatives (total saving Rs.{total_saving}) | {n_best} already at best price | {n_not_found} not found

Start with: "I found the best pharmacy prices for your {n_meds} medicine(s)."
Mention: recommended pharmacy, how many have cheaper alternatives and total saving, how many already at best price.
If any not found: mention asking pharmacist.
End with the safety sentence.
Keep under 5 sentences. Be warm and factual."""

    try:
        if settings.GEMINI_API_KEY:
            model          = genai.GenerativeModel(GEMINI_MODEL)
            response       = model.generate_content(prompt)
            recommendation = response.text.strip()
        else:
            raise Exception("No key")
    except Exception:
        parts = [f"I found the best pharmacy prices for your {n_meds} medicine(s)."]
        parts.append(
            f"I recommend {best['pharmacy_name']} ({best['area']}) "
            f"with a total cost of Rs.{best['total_cost']}."
        )
        if n_saving > 0:
            parts.append(
                f"{n_saving} medicine(s) have more affordable alternatives "
                f"saving you Rs.{total_saving} in total."
            )
        if n_best > 0:
            parts.append(
                f"{n_best} medicine(s) are already at the best available price."
            )
        if missing:
            parts.append(
                f"{', '.join(missing)} not available here — "
                f"check an alternative pharmacy for those."
            )
        if n_not_found > 0:
            parts.append(
                f"{n_not_found} medicine(s) were not found in our catalog — "
                f"please ask your pharmacist."
            )
        parts.append(
            "Please consult your doctor or pharmacist before changing any prescribed medication."
        )
        recommendation = " ".join(parts)

    return {"recommendation": recommendation}
