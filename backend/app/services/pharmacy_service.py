"""
Pharmacy service — single source of truth for all medicine operations.

Replaces medicine_service.py entirely.
All operations query the pharmacies collection directly.

Key functions:
  resolve_medicine_name()           → fuzzy match raw name → catalog entry from pharmacies
  get_unique_medicine_list()        → unique medicines across all pharmacies (for dropdown)
  get_best_pharmacy_for_medicines() → best pharmacy by total cost coverage
  get_pharmacy_alternatives()       → same ingredient+strength, cheaper options
  calc_pharmacy_distances()         → ORS → haversine fallback
"""
import math
import re
import httpx
from app.db.database import get_db
from app.core.config import settings


# ── Prefix regex (strip Tab., Cap., Inj. etc.) ───────────────────────────────
_PREFIX_RE = re.compile(
    r'^(tab\.?|cap\.?|inj\.?|syr\.?|oint\.?|drop\.?|gel\.?|sol\.?'
    r'|susp\.?|liq\.?|sachet\.?|patch\.?|cream\.?|lotion\.?)\s+',
    re.IGNORECASE
)
_STOP_WORDS = {
    'tab','cap','inj','syr','mg','mcg','ml','g','the',
    'and','with','for','once','twice','daily','night','morning',
}

def _clean_name(raw: str) -> str:
    return _PREFIX_RE.sub('', raw).strip()

def _extract_numbers(text: str) -> set:
    return set(re.findall(r'\d+', text))

def _strengths_conflict(input_name: str, db_name: str) -> bool:
    """True if both have numbers but share none — clearly different strength."""
    i = _extract_numbers(input_name)
    d = _extract_numbers(db_name)
    if not i or not d: return False
    return len(i & d) == 0

def _normalize_strength(s: str) -> str:
    if not s: return ""
    s = re.sub(r'\s+', '', s).lower()
    return '/'.join(sorted(s.split('/')))

def _normalize_ingredient(s: str) -> str:
    return s.strip().lower() if s else ""

def _ingredients_match(a: str, b: str) -> bool:
    return _normalize_ingredient(a) == _normalize_ingredient(b)

def _strengths_match(a: str, b: str) -> bool:
    na, nb = _normalize_strength(a), _normalize_strength(b)
    if not na or not nb: return True
    return na == nb


# ── Build flat medicine index from all pharmacies ─────────────────────────────
async def _get_all_pharmacy_meds(db) -> list[dict]:
    """
    Returns flat list of all medicines across all pharmacies.
    Each entry: {name, active_ingredient, strength, price, pharmacy_id, pharmacy_name, area, address}
    """
    pharmacies = await db.pharmacies.find({}).to_list(length=20)
    all_meds = []
    for p in pharmacies:
        pid   = str(p["_id"])
        pname = p["name"]
        area  = p["area"]
        addr  = p["address"]
        for m in p.get("medicines", []):
            all_meds.append({
                "name":             m["name"],
                "active_ingredient": m.get("active_ingredient", ""),
                "strength":         m.get("strength", ""),
                "price":            m["price"],
                "pharmacy_id":      pid,
                "pharmacy_name":    pname,
                "area":             area,
                "address":          addr,
            })
    return all_meds


# ── Name resolution (replaces medicine_service.get_medicine_by_name) ──────────
async def resolve_medicine_name(name: str, extracted_strength: str = "") -> dict | None:
    """
    Fuzzy match a raw prescription medicine name against the pharmacies collection.
    Returns the best match entry with name, active_ingredient, strength.
    Uses same 6-step strategy as old medicine_service but queries pharmacies collection.

    Returns dict: {name, active_ingredient, strength} or None if not found.
    We return the first matching medicine entry — the name/ingredient/strength
    are consistent across all pharmacies for the same medicine name.
    """
    db = get_db()
    all_meds = await _get_all_pharmacy_meds(db)

    # Deduplicate by medicine name for resolution (price doesn't matter here)
    seen_names: dict[str, dict] = {}
    for m in all_meds:
        key = m["name"].lower()
        if key not in seen_names:
            seen_names[key] = m

    catalog = list(seen_names.values())

    # ── Step 1: Exact match on raw name ──────────────────────────────────────
    for m in catalog:
        if m["name"].lower() == name.lower():
            return m

    # ── Step 2: Clean prefix → exact match ───────────────────────────────────
    cleaned = _clean_name(name)
    if cleaned.lower() != name.lower():
        for m in catalog:
            if m["name"].lower() == cleaned.lower():
                return m

    # Step 2b: Combine cleaned + extracted strength numbers
    if extracted_strength:
        strength_nums = re.findall(r'\d+', extracted_strength)
        for snum in strength_nums:
            combined = f"{cleaned} {snum}".lower()
            for m in catalog:
                if m["name"].lower() == combined:
                    return m

    search_str   = cleaned
    search_lower = search_str.lower()

    # ── Step 3: Starts-with (both directions) ────────────────────────────────
    for m in catalog:
        db_lower = m["name"].lower()
        if db_lower.startswith(search_lower) or search_lower.startswith(db_lower):
            return m

    # ── Step 4: Contains (both directions) ───────────────────────────────────
    for m in catalog:
        db_lower = m["name"].lower()
        if db_lower in search_lower or search_lower in db_lower:
            return m

    # ── Step 5: Word-by-word + strength-conflict check ───────────────────────
    words = [
        w for w in re.split(r'[\s/\-]+', search_str)
        if w.lower() not in _STOP_WORDS and len(w) > 2 and not w.isdigit()
    ]
    for word in words:
        for m in catalog:
            if re.search(re.escape(word), m["name"], re.IGNORECASE):
                if not _strengths_conflict(search_str, m["name"]):
                    return m

    # ── Step 6: Active ingredient field search ────────────────────────────────
    for word in words:
        for m in catalog:
            if re.search(re.escape(word), m.get("active_ingredient", ""), re.IGNORECASE):
                if not _strengths_conflict(search_str, m["name"]):
                    return m

    return None


# ── Unique medicine list for dropdown ─────────────────────────────────────────
async def get_unique_medicine_list() -> list:
    """
    Returns unique medicines from pharmacies collection grouped by condition
    (based on active_ingredient patterns).
    Used for ManualMedicineSelector dropdown and /medicine/catalog route.
    """
    db  = get_db()
    all_meds = await _get_all_pharmacy_meds(db)

    # Deduplicate by medicine name
    seen: set = set()
    unique: list = []
    for m in all_meds:
        if m["name"] not in seen:
            seen.add(m["name"])
            unique.append({"name": m["name"], "active_ingredient": m["active_ingredient"], "strength": m["strength"]})

    # Group by condition based on active ingredient
    condition_map = {
        "Metformin": "Type 2 Diabetes",
        "Glipizide": "Type 2 Diabetes",
        "Glimepiride": "Type 2 Diabetes",
        "Sitagliptin": "Type 2 Diabetes",
        "Telmisartan": "Hypertension",
        "Amlodipine": "Hypertension",
        "Losartan": "Hypertension",
        "Rosuvastatin": "High Cholesterol",
        "Atorvastatin": "High Cholesterol",
        "Levothyroxine": "Hypothyroidism",
        "Salbutamol": "Asthma",
        "Budesonide": "Asthma",
        "Formoterol": "Asthma",
        "Ipratropium": "Asthma",
    }

    groups: dict = {}
    for med in unique:
        group = "General"
        ing = med.get("active_ingredient", "")
        for key, condition in condition_map.items():
            if key.lower() in ing.lower():
                group = condition
                break
        if group not in groups:
            groups[group] = []
        groups[group].append(med["name"])

    return [{"group": k, "medicines": v} for k, v in groups.items()]


# ── List all pharmacies ───────────────────────────────────────────────────────
async def get_all_pharmacies() -> list:
    db = get_db()
    cursor = db.pharmacies.find({}, {"medicines": 0})
    result = []
    async for p in cursor:
        result.append({
            "id":          str(p["_id"]),
            "name":        p["name"],
            "area":        p["area"],
            "address":     p["address"],
            "coordinates": p.get("location", {}).get("coordinates", []),
        })
    return result


# ── Get all medicines grouped by pharmacy (for Add Medicine dropdown) ─────────
async def get_all_pharmacy_medicines() -> list:
    db = get_db()
    cursor = db.pharmacies.find({})
    result = []
    async for p in cursor:
        result.append({
            "pharmacy_id":   str(p["_id"]),
            "pharmacy_name": p["name"],
            "area":          p["area"],
            "address":       p["address"],
            "medicines":     p.get("medicines", []),
        })
    return result


# ── Find best pharmacy for a list of medicine names ───────────────────────────
async def get_best_pharmacy_for_medicines(medicine_names: list) -> dict:
    db = get_db()
    pharmacies = await db.pharmacies.find({}).to_list(length=20)

    per_medicine: dict = {}
    for med_name in medicine_names:
        options = []
        for pharmacy in pharmacies:
            med = next(
                (m for m in pharmacy.get("medicines", [])
                 if m["name"].lower() == med_name.lower()),
                None
            )
            if med:
                options.append({
                    "pharmacy_id":   str(pharmacy["_id"]),
                    "pharmacy_name": pharmacy["name"],
                    "area":          pharmacy["area"],
                    "address":       pharmacy["address"],
                    "price":         med["price"],
                })
        options.sort(key=lambda x: x["price"])
        per_medicine[med_name] = {
            "best_pharmacy_id":   options[0]["pharmacy_id"]   if options else None,
            "best_pharmacy_name": options[0]["pharmacy_name"] if options else None,
            "best_price":         options[0]["price"]         if options else 0,
            "all_options":        options,
        }

    pharmacy_scores = []
    for pharmacy in pharmacies:
        total_cost  = 0.0
        found_count = 0
        missing     = []
        pharm_meds  = {m["name"].lower(): m["price"] for m in pharmacy.get("medicines", [])}
        for med_name in medicine_names:
            price = pharm_meds.get(med_name.lower())
            if price is not None:
                total_cost  += price
                found_count += 1
            else:
                missing.append(med_name)
                total_cost  += per_medicine.get(med_name, {}).get("best_price", 0)
        pharmacy_scores.append({
            "pharmacy_id":       str(pharmacy["_id"]),
            "pharmacy_name":     pharmacy["name"],
            "area":              pharmacy["area"],
            "address":           pharmacy["address"],
            "coordinates":       pharmacy.get("location", {}).get("coordinates", []),
            "total_cost":        round(total_cost, 2),
            "medicines_found":   found_count,
            "medicines_missing": missing,
        })

    pharmacy_scores.sort(key=lambda x: (-x["medicines_found"], x["total_cost"]))
    best = pharmacy_scores[0] if pharmacy_scores else None
    return {
        "recommended_pharmacy_id":   best["pharmacy_id"]   if best else None,
        "recommended_pharmacy_name": best["pharmacy_name"] if best else None,
        "pharmacy_scores":           pharmacy_scores,
        "per_medicine":              per_medicine,
    }


# ── Get pharmacy alternatives ─────────────────────────────────────────────────
async def get_pharmacy_alternatives(
    medicine_name: str,
    active_ingredient: str,
    strength: str,
    current_pharmacy_id: str = "",
) -> list:
    """
    All same ingredient+strength medicines across all pharmacies.
    Excludes only exact current selection (same name + same pharmacy).
    Sorted by price ascending — cheapest first.

    Logic:
    - If current medicine is already cheapest → alternatives list still shows
      all other options but none will be cheaper → frontend shows "Best price"
    - If cheaper exists → frontend auto-selects cheapest → "Save ₹X"
    """
    db = get_db()
    pharmacies = await db.pharmacies.find({}).to_list(length=20)

    options = []
    seen    = set()

    for pharmacy in pharmacies:
        pharm_id   = str(pharmacy["_id"])
        pharm_name = pharmacy["name"]
        pharm_area = pharmacy["area"]

        for med in pharmacy.get("medicines", []):
            # Skip exact current selection
            if med["name"].lower() == medicine_name.lower() and pharm_id == current_pharmacy_id:
                continue

            # Must match active ingredient
            if not _ingredients_match(med.get("active_ingredient", ""), active_ingredient):
                continue

            # Must match strength
            if not _strengths_match(med.get("strength", ""), strength):
                continue

            key = f"{med['name'].lower()}|{pharm_id}"
            if key in seen:
                continue
            seen.add(key)

            options.append({
                "name":          med["name"],
                "pharmacy_id":   pharm_id,
                "pharmacy_name": pharm_name,
                "area":          pharm_area,
                "price":         med["price"],
            })

    options.sort(key=lambda x: x["price"])
    return options


# ── Distance calculation ──────────────────────────────────────────────────────
def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R    = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a    = (math.sin(dlat/2)**2 +
            math.cos(math.radians(lat1)) *
            math.cos(math.radians(lat2)) *
            math.sin(dlng/2)**2)
    return round(R * 2 * math.asin(math.sqrt(a)) * 1.3, 2)


async def calc_pharmacy_distances(user_lat: float, user_lng: float, pharmacy_ids: list) -> list:
    db = get_db()
    from bson import ObjectId

    object_ids = []
    for pid in pharmacy_ids:
        try: object_ids.append(ObjectId(pid))
        except: pass
    if not object_ids: return []

    pharmacies = await db.pharmacies.find({"_id": {"$in": object_ids}}).to_list(length=20)
    if not pharmacies: return []

    if settings.ORS_API_KEY:
        try:
            destinations = [
                [p["location"]["coordinates"][0], p["location"]["coordinates"][1]]
                for p in pharmacies if p.get("location", {}).get("coordinates")
            ]
            if destinations:
                payload = {
                    "locations":    [[user_lng, user_lat]] + destinations,
                    "sources":      [0],
                    "destinations": list(range(1, len(destinations) + 1)),
                    "metrics":      ["distance", "duration"],
                    "units":        "km",
                }
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        "https://api.openrouteservice.org/v2/matrix/driving-car",
                        json=payload, headers={"Authorization": settings.ORS_API_KEY},
                    )
                if resp.status_code == 200:
                    data      = resp.json()
                    distances = data["distances"][0]
                    durations = data["durations"][0]
                    return [{
                        "pharmacy_id":     str(pharmacy["_id"]),
                        "distance_km":     round(distances[i], 2) if distances[i] else None,
                        "travel_time_min": round(durations[i] / 60) if durations[i] else None,
                        "source":          "ors",
                    } for i, pharmacy in enumerate(pharmacies) if i < len(distances)]
        except: pass

    result = []
    for pharmacy in pharmacies:
        coords = pharmacy.get("location", {}).get("coordinates", [])
        if len(coords) == 2:
            lng, lat = coords
            dist = _haversine_distance(user_lat, user_lng, lat, lng)
            result.append({
                "pharmacy_id":     str(pharmacy["_id"]),
                "distance_km":     dist,
                "travel_time_min": max(1, round(dist / 0.4)),
                "source":          "fallback",
            })
        else:
            result.append({
                "pharmacy_id":     str(pharmacy["_id"]),
                "distance_km":     None,
                "travel_time_min": None,
                "source":          "unavailable",
            })
    return result
