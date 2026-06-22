from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import re
import httpx
from app.schemas.schemas import LocationCoords, GoogleMapsLink
from app.api.auth import get_current_user
from app.db.database import get_db

router = APIRouter(prefix="/location", tags=["location"])


@router.post("/save")
async def save_location(data: LocationCoords, current_user=Depends(get_current_user)):
    db = get_db()
    location_doc = {
        "user_id": str(current_user["_id"]),
        "location": {
            "type": "Point",
            "coordinates": [data.longitude, data.latitude]
        },
        "label": data.label or "Saved Location",
        "saved_at": datetime.utcnow()
    }
    await db.user_locations.update_one(
        {"user_id": str(current_user["_id"])},
        {"$set": location_doc},
        upsert=True
    )
    return {"message": "Location saved"}


@router.get("/saved")
async def get_saved_location(current_user=Depends(get_current_user)):
    db = get_db()
    loc = await db.user_locations.find_one({"user_id": str(current_user["_id"])})
    if not loc:
        return None
    return {
        "latitude": loc["location"]["coordinates"][1],
        "longitude": loc["location"]["coordinates"][0],
        "label": loc.get("label", "Saved Location"),
        "saved_at": loc["saved_at"].isoformat()
    }


def extract_coords_from_url(url: str):
    """Try all known Google Maps coordinate patterns on a URL string."""

    # Pattern 1: @lat,lng  (standard maps URL)
    m = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))

    # Pattern 2: !3d<lat>!4d<lng>  (embedded/place URLs)
    m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))

    # Pattern 3: q=lat,lng
    m = re.search(r'[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))

    # Pattern 4: ll=lat,lng
    m = re.search(r'[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))

    # Pattern 5: /place/Name/@lat,lng
    m = re.search(r'/place/[^/]+/@(-?\d+\.\d+),(-?\d+\.\d+)', url)
    if m:
        return float(m.group(1)), float(m.group(2))

    return None


@router.post("/parse-google-maps")
async def parse_google_maps(data: GoogleMapsLink, current_user=Depends(get_current_user)):
    """Parse coordinates from any Google Maps link, including short links (maps.app.goo.gl)."""
    url = data.url.strip()

    # Step 1: Try extracting directly from the URL as-is
    result = extract_coords_from_url(url)
    if result:
        lat, lng = result
        return {"latitude": lat, "longitude": lng, "label": "Google Maps Location"}

    # Step 2: If it's a short link or redirect, follow it to get the full URL
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=10.0,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        ) as client:
            resp = await client.get(url)
            final_url = str(resp.url)

        # Try extracting from the expanded URL
        result = extract_coords_from_url(final_url)
        if result:
            lat, lng = result
            return {"latitude": lat, "longitude": lng, "label": "Google Maps Location"}

        # Also try extracting from the response body (sometimes coords are in the page)
        body = resp.text
        result = extract_coords_from_url(body)
        if result:
            lat, lng = result
            return {"latitude": lat, "longitude": lng, "label": "Google Maps Location"}

    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Request timed out while expanding the link. Try again.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not expand the link: {str(e)}")

    raise HTTPException(
        status_code=400,
        detail="Could not extract coordinates from this link. Try: open Google Maps → long-press your location → copy the coordinates shown at the top."
    )
