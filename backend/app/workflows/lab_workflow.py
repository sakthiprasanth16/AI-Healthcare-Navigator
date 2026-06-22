"""
LangGraph workflow: START → Lab Search → Distance → Ranking → Gemini → END
Supports single-test (legacy) and multi-test (new) searches.
"""
import math
import httpx
import google.generativeai as genai
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from app.core.config import settings
from app.db.database import get_db

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)


class LabInfo(TypedDict):
    lab_id: str
    name: str
    area: str
    address: str
    price: float            # single-test price or total cost
    total_cost: Optional[float]
    test_prices: Optional[List[dict]]  # [{"test_name": x, "price": y}]
    rating: float
    coordinates: List[float]
    distance_km: Optional[float]
    travel_time_min: Optional[int]
    score: Optional[float]
    distance_source: Optional[str]   # "ors" | "fallback"


class WorkflowState(TypedDict):
    user_lat: float
    user_lng: float
    test_type: Optional[str]       # single test (legacy)
    test_types: Optional[List[str]]  # multi-test (new)
    is_multi: bool
    raw_labs: List[LabInfo]
    labs_with_distance: List[LabInfo]
    top_labs: List[LabInfo]
    recommended_lab: Optional[LabInfo]
    recommendation_reason: str
    error: Optional[str]


# ── Node 1: Lab Search ────────────────────────────────────────────────────────
async def lab_search_node(state: WorkflowState) -> WorkflowState:
    try:
        db = get_db()
        is_multi = state.get("is_multi", False)
        test_types = state.get("test_types") or []
        test_type = state.get("test_type")

        if is_multi and test_types:
            # Find labs offering ALL selected tests
            cursor = db.labs.find({
                "location": {
                    "$near": {
                        "$geometry": {"type": "Point", "coordinates": [state["user_lng"], state["user_lat"]]},
                        "$maxDistance": 25000
                    }
                },
                "tests": {"$all": [{"$elemMatch": {"name": t}} for t in test_types]}
            }).limit(10)

            labs = []
            async for lab in cursor:
                test_prices = []
                total_cost = 0.0
                all_found = True
                for tname in test_types:
                    found = next((t for t in lab.get("tests", []) if t["name"] == tname), None)
                    if found:
                        test_prices.append({"test_name": tname, "price": found["price"]})
                        total_cost += found["price"]
                    else:
                        all_found = False
                        break
                if all_found:
                    labs.append(LabInfo(
                        lab_id=str(lab["_id"]),
                        name=lab["name"], area=lab["area"], address=lab["address"],
                        price=total_cost, total_cost=total_cost,
                        test_prices=test_prices,
                        rating=lab.get("rating", 4.0),
                        coordinates=lab["location"]["coordinates"],
                        distance_km=None, travel_time_min=None, score=None,
                        distance_source=None,
                    ))

        else:
            # Single-test (legacy)
            cursor = db.labs.find({
                "location": {
                    "$near": {
                        "$geometry": {"type": "Point", "coordinates": [state["user_lng"], state["user_lat"]]},
                        "$maxDistance": 25000
                    }
                },
                "tests": {"$elemMatch": {"name": test_type}}
            }).limit(10)

            labs = []
            async for lab in cursor:
                test_price = next((t["price"] for t in lab.get("tests", []) if t["name"] == test_type), None)
                if test_price is not None:
                    labs.append(LabInfo(
                        lab_id=str(lab["_id"]),
                        name=lab["name"], area=lab["area"], address=lab["address"],
                        price=test_price, total_cost=test_price,
                        test_prices=[{"test_name": test_type, "price": test_price}],
                        rating=lab.get("rating", 4.0),
                        coordinates=lab["location"]["coordinates"],
                        distance_km=None, travel_time_min=None, score=None,
                        distance_source=None,
                    ))

        return {**state, "raw_labs": labs}
    except Exception as e:
        return {**state, "raw_labs": [], "error": str(e)}


# ── Node 2: Distance Calculation ──────────────────────────────────────────────
async def distance_node(state: WorkflowState) -> WorkflowState:
    labs = state["raw_labs"]
    if not labs:
        return {**state, "labs_with_distance": []}

    if settings.ORS_API_KEY:
        try:
            destinations = [[lab["coordinates"][0], lab["coordinates"][1]] for lab in labs]
            source = [state["user_lng"], state["user_lat"]]
            payload = {
                "locations": [source] + destinations,
                "sources": [0],
                "destinations": list(range(1, len(destinations) + 1)),
                "metrics": ["distance", "duration"],
                "units": "km"
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.openrouteservice.org/v2/matrix/driving-car",
                    json=payload,
                    headers={"Authorization": settings.ORS_API_KEY}
                )
            if resp.status_code == 200:
                data = resp.json()
                distances = data["distances"][0]
                durations = data["durations"][0]
                result = []
                for i, lab in enumerate(labs):
                    lc = dict(lab)
                    lc["distance_km"] = round(distances[i], 2) if distances[i] else None
                    lc["travel_time_min"] = round(durations[i] / 60) if durations[i] else None
                    lc["distance_source"] = "ors"   # ← ORS success
                    result.append(lc)
                return {**state, "labs_with_distance": result}
        except Exception:
            pass

    # ORS unavailable or failed — use fallback haversine calculation
    return {**state, "labs_with_distance": _fallback_distance(labs, state["user_lat"], state["user_lng"])}


def _fallback_distance(labs, user_lat, user_lng):
    result = []
    for lab in labs:
        lng, lat = lab["coordinates"]
        R = 6371
        dlat = math.radians(lat - user_lat)
        dlng = math.radians(lng - user_lng)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(user_lat)) * math.cos(math.radians(lat)) * math.sin(dlng/2)**2
        dist = R * 2 * math.asin(math.sqrt(a)) * 1.3
        lc = dict(lab)
        lc["distance_km"] = round(dist, 2)
        lc["travel_time_min"] = max(1, round(dist / 0.4))
        lc["distance_source"] = "fallback"   # ← haversine fallback
        result.append(lc)
    return result


# ── Node 3: Ranking ───────────────────────────────────────────────────────────
def ranking_node(state: WorkflowState) -> WorkflowState:
    labs = state["labs_with_distance"]
    if not labs:
        return {**state, "top_labs": []}

    valid = [l for l in labs if l.get("distance_km") is not None]
    if not valid:
        valid = labs

    prices = [l["price"] for l in valid]
    distances = [l["distance_km"] or 0 for l in valid]
    min_p, max_p = min(prices), max(prices)
    min_d, max_d = min(distances), max(distances)
    pr = max_p - min_p or 1
    dr = max_d - min_d or 1

    scored = []
    for lab in valid:
        norm_p = (lab["price"] - min_p) / pr
        norm_d = ((lab["distance_km"] or 0) - min_d) / dr
        lc = dict(lab)
        lc["score"] = round(0.5 * norm_p + 0.5 * norm_d, 4)
        scored.append(lc)

    scored.sort(key=lambda x: x["score"])
    top5 = scored[:5]
    for i, lab in enumerate(top5):
        lab["rank"] = i + 1
    return {**state, "top_labs": top5}


# ── Node 4: Gemini Recommendation ─────────────────────────────────────────────
async def gemini_recommendation_node(state: WorkflowState) -> WorkflowState:
    top_labs = state["top_labs"]
    if not top_labs:
        return {**state, "recommended_lab": None, "recommendation_reason": "No labs found in your area."}

    best = top_labs[0]
    is_multi = state.get("is_multi", False)
    test_types = state.get("test_types") or [state.get("test_type", "")]
    tests_label = ", ".join(test_types)
    n_tests = len(test_types)

    labs_text = "\n".join([
        f"{i+1}. {lab['name']} ({lab['area']}): "
        f"{'Total' if is_multi else 'Cost'} ₹{lab['price']}, "
        f"{lab['distance_km']} km, {lab['travel_time_min']} min, Rating {lab['rating']}/5"
        for i, lab in enumerate(top_labs)
    ])

    if is_multi:
        prompt = f"""You are a healthcare cost advisor. Based ONLY on the data below, recommend the best lab for {n_tests} tests: {tests_label}.
Use ONLY the provided data. Do NOT invent information. Never prescribe or give medical advice.

Available Labs (total cost for all {n_tests} tests):
{labs_text}

Write 2-3 sentences. Start with: "I found {len(top_labs)} labs that can perform all {n_tests} selected tests ({tests_label})."
Then recommend the best one with total cost, distance, and travel time. Keep it factual and brief."""
    else:
        prompt = f"""You are a healthcare cost advisor. Based ONLY on the data below, recommend the best lab for a {test_types[0]} test.
Use ONLY the provided data. Do NOT invent information.

Available Labs:
{labs_text}

Write 2-3 sentences. Start with: "I found {len(top_labs)} nearby labs."
State your recommendation with cost, distance, and travel time. Keep it factual and brief."""

    try:
        if settings.GEMINI_API_KEY:
            model = genai.GenerativeModel("gemini-2.0-flash-lite")
            response = model.generate_content(prompt)
            reason = response.text.strip()
        else:
            raise Exception("No key")
    except Exception:
        if is_multi:
            reason = (f"I found {len(top_labs)} labs that can perform all {n_tests} selected tests ({tests_label}). "
                      f"Recommended: {best['name']} — Total Cost: ₹{best['price']}, "
                      f"Distance: {best['distance_km']} km, Travel Time: {best['travel_time_min']} minutes. "
                      f"Best balance of cost and proximity.")
        else:
            reason = (f"I found {len(top_labs)} nearby labs. "
                      f"Recommended: {best['name']} — Cost: ₹{best['price']}, "
                      f"Distance: {best['distance_km']} km, Travel Time: {best['travel_time_min']} minutes. "
                      f"Best balance of cost and proximity.")

    return {**state, "recommended_lab": best, "recommendation_reason": reason}


# ── Build workflow ─────────────────────────────────────────────────────────────
def build_workflow():
    wf = StateGraph(WorkflowState)
    wf.add_node("lab_search", lab_search_node)
    wf.add_node("distance_calculation", distance_node)
    wf.add_node("ranking", ranking_node)
    wf.add_node("gemini_recommendation", gemini_recommendation_node)
    wf.set_entry_point("lab_search")
    wf.add_edge("lab_search", "distance_calculation")
    wf.add_edge("distance_calculation", "ranking")
    wf.add_edge("ranking", "gemini_recommendation")
    wf.add_edge("gemini_recommendation", END)
    return wf.compile()


_compiled_workflow = None

def get_workflow():
    global _compiled_workflow
    if _compiled_workflow is None:
        _compiled_workflow = build_workflow()
    return _compiled_workflow
