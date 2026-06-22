"""
Map prescription medicine name → pharmacy entry + alternatives.

Now calls pharmacy_service directly — no medicine_catalog collection needed.
medicine_service.py is no longer used.

Flow:
  raw name "Tab. Telma 40"
      ↓
  resolve_medicine_name() → fuzzy match in pharmacies collection
      ↓
  returns: name="Telma 40", active_ingredient="Telmisartan", strength="40mg"
      ↓
  best price + alternatives come from pharmacies collection via pharmacy_service
"""
from app.services.pharmacy_service import resolve_medicine_name

import re

_PREFIX_RE = re.compile(
    r'^(tab\.?|cap\.?|inj\.?|syr\.?|oint\.?|drop\.?|gel\.?|sol\.?'
    r'|susp\.?|liq\.?|sachet\.?|patch\.?|cream\.?|lotion\.?)\s+',
    re.IGNORECASE
)

def _clean_name(raw: str) -> str:
    return _PREFIX_RE.sub('', raw).strip()


async def map_medicine(name: str, extracted_strength: str = "") -> dict:
    """
    Resolve prescription medicine name → pharmacy entry.

    name               : raw name from prescription e.g. "Tab. Telma 40"
    extracted_strength : strength from separate dose column e.g. "500mg"

    Resolution: pharmacy_service.resolve_medicine_name() — 6-step fuzzy match
    against pharmacies collection (not medicine_catalog).

    Returns:
      found            : bool
      name             : resolved catalog name e.g. "Telma 40"
      original_name    : raw prescription name e.g. "Tab. Telma 40"
      active_ingredient: e.g. "Telmisartan"
      strength         : e.g. "40mg"
      price            : 0 (actual price fetched per-pharmacy in pharmacy/best)
      alternatives     : [] (fetched separately by pharmacy/alternatives)

    Note: price and alternatives are NOT returned here because:
      - price varies per pharmacy — fetched in get_best_pharmacy_for_medicines()
      - alternatives fetched per row in MedicineTable via /pharmacy/alternatives
    """
    resolved = await resolve_medicine_name(name, extracted_strength)

    if resolved:
        return {
            "found":             True,
            "name":              resolved["name"],
            "original_name":     name,
            "active_ingredient": resolved.get("active_ingredient", "Unknown"),
            "strength":          resolved.get("strength", ""),
            "price":             0,   # will be set by findBestPharmacy in frontend
            "alternatives":      [],  # will be fetched by /pharmacy/alternatives
        }
    else:
        cleaned = _clean_name(name)
        return {
            "found":             False,
            "name":              cleaned if cleaned else name,
            "original_name":     name,
            "active_ingredient": "Unknown",
            "strength":          "",
            "price":             0,
            "alternatives":      [],
        }
