from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class PatientType(str, Enum):
    diabetes = "Type 2 Diabetes"
    hypertension = "Hypertension"
    asthma = "Asthma"
    hypothyroidism = "Hypothyroidism"
    high_cholesterol = "High Cholesterol"
    general = "General Health Checkup"


class TestType(str, Enum):
    hba1c = "HbA1c"
    cbc = "CBC"
    thyroid = "Thyroid Profile"
    lipid = "Lipid Profile"
    vitamin_d = "Vitamin D"
    fbs = "Fasting Blood Sugar"
    creatinine = "Creatinine"
    lft = "Liver Function Test"
    kft = "Kidney Function Test"


# ── Auth ──────────────────────────────────────────────────────────────────────
class UserSignup(BaseModel):
    name: str
    age: int
    username: str
    password: str
    patient_type: PatientType


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


# ── Location ──────────────────────────────────────────────────────────────────
class LocationCoords(BaseModel):
    latitude: float
    longitude: float
    label: Optional[str] = None


class GoogleMapsLink(BaseModel):
    url: str


# ── Lab search ────────────────────────────────────────────────────────────────
class LabSearchRequest(BaseModel):
    latitude: float
    longitude: float
    # Single test (legacy)
    test_type: Optional[TestType] = None
    # Multi-test (new)
    test_types: Optional[List[str]] = None


class LabTestPrice(BaseModel):
    test_name: str
    price: float


class LabResult(BaseModel):
    lab_id: str
    name: str
    area: str
    address: str
    price: float                          # single-test price OR total cost
    total_cost: Optional[float] = None    # multi-test total
    test_prices: Optional[List[LabTestPrice]] = None  # per-test breakdown
    rating: float
    distance_km: Optional[float] = None
    travel_time_min: Optional[int] = None
    rank: Optional[int] = None
    score: Optional[float] = None


class SearchResponse(BaseModel):
    recommended_lab: LabResult
    recommendation_reason: str
    top_labs: List[LabResult]
    test_type: Optional[str] = None
    test_types: Optional[List[str]] = None
    is_multi_test: bool = False


class SelectLabRequest(BaseModel):
    lab_id: str
    lab_name: str
    test_type: Optional[str] = None
    test_types: Optional[List[str]] = None
    price: float


# ── Lab Test Plan ─────────────────────────────────────────────────────────────
class LabTestPlanRequest(BaseModel):
    lab_id: str
    lab_name: str
    lab_area: str
    lab_address: str
    test_types: List[str]
    test_prices: List[LabTestPrice]
    total_cost: float


class LabTestPlanResponse(BaseModel):
    patient_name: str
    patient_type: str
    lab_name: str
    lab_area: str
    lab_address: str
    test_rows: List[LabTestPrice]
    total_cost: float
    generated_on: str
    note: str


# ── Medicine ──────────────────────────────────────────────────────────────────
class AlternativeMedicine(BaseModel):
    name: str
    price: float
    # Pharmacy info — present when alternatives come from pharmacy collection
    pharmacy_id:   Optional[str] = None
    pharmacy_name: Optional[str] = None
    pharmacy_area: Optional[str] = None


class MedicineRow(BaseModel):
    id: str
    name: str
    active_ingredient: str
    strength: str
    current_price: float
    alternatives: List[AlternativeMedicine]
    selected_medicine_name: str
    selected_price: float
    quantity: int = 1
    row_total: float
    saving: float
    # Frequency/duration fields — extracted from prescription by Gemini
    frequency: Optional[str] = None
    frequency_per_day: Optional[float] = None
    duration_days: Optional[int] = None
    # Pharmacy fields — populated after pharmacy recommendation
    pharmacy_id:   Optional[str] = None
    pharmacy_name: Optional[str] = None
    pharmacy_area: Optional[str] = None
    pharmacy_address: Optional[str] = None


class MedicineCostResult(BaseModel):
    medicines: List[MedicineRow]
    original_cost: float
    optimized_cost: float
    total_saving: float
    summary: str


class ManualMedicineRequest(BaseModel):
    patient_type: str
    medicines: List[dict]   # [{"name": "Telma 40"}, ...]


class PrescriptionPlanRow(BaseModel):
    medicine: str
    price: float
    qty: int
    total: float


class PrescriptionPlanResponse(BaseModel):
    patient_name: str
    patient_type: str
    generated_on: str
    rows: List[PrescriptionPlanRow]
    grand_total: float
    note: str


class SaveReportRequest(BaseModel):
    source: str
    medicines: List[dict]
    original_cost: float
    optimized_cost: float
    total_saving: float
