import base64
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from app.schemas.schemas import (
    ManualMedicineRequest, MedicineCostResult, MedicineRow,
    AlternativeMedicine, SaveReportRequest, PrescriptionPlanResponse, PrescriptionPlanRow
)
from app.api.auth import get_current_user
from app.workflows.medicine_workflow import get_manual_workflow, get_prescription_workflow
from app.services.report_service import save_report, get_reports

router = APIRouter(prefix="/medicine", tags=["medicine"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}

# IST = UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))

def ist_now_str() -> str:
    return datetime.now(IST).strftime("%d %b %Y, %I:%M %p")


def _build_result(state: dict) -> MedicineCostResult:
    medicines = []
    for r in state.get("results", []):
        alts = [AlternativeMedicine(name=a["name"], price=a["price"])
                for a in r.get("alternatives", [])]
        medicines.append(MedicineRow(
            id=r["id"],
            name=r["name"],
            active_ingredient=r.get("active_ingredient", "Unknown"),
            strength=r.get("strength", ""),
            current_price=r["current_price"],
            alternatives=alts,
            selected_medicine_name=r["selected_medicine_name"],
            selected_price=r["selected_price"],
            quantity=r.get("quantity", 1),
            row_total=r["row_total"],
            saving=r["saving"],
            # Frequency / duration — present for prescription uploads, None for manual
            frequency=r.get("frequency"),
            frequency_per_day=r.get("frequency_per_day"),
            duration_days=r.get("duration_days"),
        ))
    return MedicineCostResult(
        medicines=medicines,
        original_cost=state.get("original_cost", 0),
        optimized_cost=state.get("optimized_cost", 0),
        total_saving=state.get("total_saving", 0),
        summary=state.get("summary", ""),
    )


@router.post("/optimize/manual", response_model=MedicineCostResult)
async def optimize_manual(data: ManualMedicineRequest, current_user=Depends(get_current_user)):
    """Run medicine workflow for manually selected medicines."""
    if not data.medicines:
        raise HTTPException(status_code=400, detail="Provide at least one medicine")

    raw_names = [m.get("name", "") for m in data.medicines if m.get("name")]
    if not raw_names:
        raise HTTPException(status_code=400, detail="Medicine names are required")

    wf = get_manual_workflow()
    initial_state = {
        "source": "manual",
        "raw_medicines": raw_names,
        "raw_medicines_with_freq": [],
        "mapped_medicines": [],
        "results": [],
        "original_cost": 0.0,
        "optimized_cost": 0.0,
        "total_saving": 0.0,
        "summary": "",
        "error": None,
    }
    result = await wf.ainvoke(initial_state)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    if not result.get("results"):
        raise HTTPException(status_code=404, detail="No medicines found in catalog. Check medicine names.")

    return _build_result(result)


@router.post("/optimize/prescription", response_model=MedicineCostResult)
async def optimize_prescription(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    """Run medicine workflow from uploaded prescription image/PDF."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}. Use JPG, PNG, or PDF.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File too large. Maximum 10MB.")

    file_b64 = base64.b64encode(content).decode()
    if file.content_type == "application/pdf":
        mime = "application/pdf"
    else:
        mime = file.content_type  # image/jpeg, image/png, etc.

    wf = get_prescription_workflow()
    initial_state = {
        "source": "prescription_upload",
        "file_content_b64": file_b64,
        "file_mime": mime,
        "raw_medicines": [],
        "raw_medicines_with_freq": [],
        "mapped_medicines": [],
        "results": [],
        "original_cost": 0.0,
        "optimized_cost": 0.0,
        "total_saving": 0.0,
        "summary": "",
        "error": None,
    }
    result = await wf.ainvoke(initial_state)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    if not result.get("results"):
        raise HTTPException(status_code=404, detail="Could not extract medicines from prescription or no matches found in catalog.")

    return _build_result(result)


@router.post("/report")
async def save_medicine_report(data: SaveReportRequest, current_user=Depends(get_current_user)):
    """Save a medicine cost report."""
    report_id = await save_report(
        user_id=str(current_user["_id"]),
        source=data.source,
        medicines=data.medicines,
        original_cost=data.original_cost,
        optimized_cost=data.optimized_cost,
        total_saving=data.total_saving,
    )
    return {"message": "Report saved", "report_id": report_id}


@router.get("/reports")
async def get_my_reports(current_user=Depends(get_current_user)):
    return await get_reports(str(current_user["_id"]))



@router.get("/catalog")
async def get_medicine_catalog(current_user=Depends(get_current_user)):
    """
    Return all unique medicines from pharmacies collection grouped by condition.
    DB-driven from pharmacies collection — no medicine_catalog needed.
    """
    from app.services.pharmacy_service import get_unique_medicine_list
    return await get_unique_medicine_list()

@router.post("/prescription-plan", response_model=PrescriptionPlanResponse)
async def generate_prescription_plan(
    data: dict,
    current_user=Depends(get_current_user)
):
    """Generate a downloadable Prescription Plan from current UI state."""
    rows_raw = data.get("rows", [])
    rows = [PrescriptionPlanRow(
        medicine=r["medicine"],
        price=r["price"],
        qty=r.get("qty", 1),
        total=r["price"] * r.get("qty", 1)
    ) for r in rows_raw]

    grand_total = sum(r.total for r in rows)

    return PrescriptionPlanResponse(
        patient_name=current_user["name"],
        patient_type=current_user["patient_type"],
        generated_on=ist_now_str(),
        rows=rows,
        grand_total=round(grand_total, 2),
        note="This plan is for cost awareness only. Do not change medicines without consulting your doctor or pharmacist."
    )
