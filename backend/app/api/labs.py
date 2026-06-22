from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from app.schemas.schemas import (
    LabSearchRequest, SearchResponse, LabResult, LabTestPrice,
    SelectLabRequest, LabTestPlanRequest, LabTestPlanResponse
)
from app.api.auth import get_current_user
from app.db.database import get_db
from app.workflows.lab_workflow import get_workflow

router = APIRouter(prefix="/labs", tags=["labs"])

# IST = UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))

def ist_now() -> datetime:
    return datetime.now(IST)

def ist_now_str() -> str:
    return datetime.now(IST).strftime("%d %b %Y, %H:%M")


@router.post("/search", response_model=SearchResponse)
async def search_labs(data: LabSearchRequest, current_user=Depends(get_current_user)):
    """Single or multi-test lab search via LangGraph workflow."""
    workflow = get_workflow()

    test_types = []
    test_type = None
    is_multi = False

    if data.test_types and len(data.test_types) > 0:
        test_types = data.test_types
        is_multi = len(test_types) > 1
        test_type = test_types[0] if not is_multi else None
    elif data.test_type:
        test_type = data.test_type.value if hasattr(data.test_type, 'value') else data.test_type
        test_types = [test_type]
        is_multi = False

    if not test_types:
        raise HTTPException(status_code=400, detail="Provide test_type or test_types")

    initial_state = {
        "user_lat": data.latitude,
        "user_lng": data.longitude,
        "test_type": test_type,
        "test_types": test_types,
        "is_multi": is_multi,
        "raw_labs": [],
        "labs_with_distance": [],
        "top_labs": [],
        "recommended_lab": None,
        "recommendation_reason": "",
        "error": None
    }

    result = await workflow.ainvoke(initial_state)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    if not result["top_labs"]:
        raise HTTPException(status_code=404, detail="No labs found offering all selected tests in your area")

    # Save search with IST timestamp
    db = get_db()
    await db.searches.insert_one({
        "user_id": str(current_user["_id"]),
        "test_types": test_types,
        "is_multi": is_multi,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "labs_found": len(result["top_labs"]),
        "recommended_lab": result["recommended_lab"]["name"] if result["recommended_lab"] else None,
        "searched_at": ist_now()
    })

    def to_lab_result(lab: dict) -> LabResult:
        tp = [LabTestPrice(test_name=t["test_name"], price=t["price"])
              for t in (lab.get("test_prices") or [])]
        return LabResult(
            lab_id=lab["lab_id"], name=lab["name"],
            area=lab["area"], address=lab["address"],
            price=lab["price"], total_cost=lab.get("total_cost"),
            test_prices=tp if tp else None,
            rating=lab["rating"],
            distance_km=lab.get("distance_km"),
            travel_time_min=lab.get("travel_time_min"),
            rank=lab.get("rank"), score=lab.get("score"),
            distance_source=lab.get("distance_source"),
        )

    top_labs = [to_lab_result(l) for l in result["top_labs"]]
    recommended = to_lab_result(result["recommended_lab"])

    return SearchResponse(
        recommended_lab=recommended,
        recommendation_reason=result["recommendation_reason"],
        top_labs=top_labs,
        test_type=test_type,
        test_types=test_types,
        is_multi_test=is_multi
    )


@router.post("/select")
async def select_lab(data: SelectLabRequest, current_user=Depends(get_current_user)):
    db = get_db()
    await db.selected_labs.insert_one({
        "user_id": str(current_user["_id"]),
        "lab_id": data.lab_id,
        "lab_name": data.lab_name,
        "selected_test": data.test_type,
        "selected_tests": data.test_types,
        "price": data.price,
        "selected_at": ist_now()
    })
    return {"message": "Lab selection saved successfully"}


@router.get("/my-selections")
async def get_my_selections(current_user=Depends(get_current_user)):
    db = get_db()
    cursor = db.selected_labs.find(
        {"user_id": str(current_user["_id"])}
    ).sort("selected_at", -1).limit(20)
    selections = []
    async for sel in cursor:
        sel["_id"] = str(sel["_id"])
        sel["selected_at"] = sel["selected_at"].isoformat()
        selections.append(sel)
    return selections


@router.post("/test-plan", response_model=LabTestPlanResponse)
async def generate_lab_test_plan(data: LabTestPlanRequest, current_user=Depends(get_current_user)):
    """Generate a downloadable Lab Test Plan for selected lab + tests."""
    return LabTestPlanResponse(
        patient_name=current_user["name"],
        patient_type=current_user["patient_type"],
        lab_name=data.lab_name,
        lab_area=data.lab_area,
        lab_address=data.lab_address,
        test_rows=data.test_prices,
        total_cost=data.total_cost,
        generated_on=ist_now_str(),
        note="This plan is for cost awareness only. Please confirm prices and preparation instructions with the diagnostic lab."
    )
