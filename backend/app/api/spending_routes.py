"""
Use Case 3 — Spending Tracker API routes.

GET  /spending/months          → fixed 4-month trailing window (3 back + current)
GET  /spending/summary         → full report for a month (cached for closed months)
POST /spending/doctor-visit    → add a one-time or subscription doctor visit
GET  /spending/doctor-visits   → list doctor visits for a month
DELETE /spending/doctor-visit/{id} → delete a doctor visit
POST /spending/report          → generate downloadable report data (for jsPDF)

Caching strategy (spending_summary_cache collection):
  - Current month  → ALWAYS recomputed (data can still change), cache overwritten after
  - Past months    → checked in cache first; computed+cached ONCE, never recomputed again
  - Adding a doctor visit or deleting one invalidates that month's cache entry
    immediately, so the next view recomputes fresh data instead of showing
    stale numbers.

Error handling notes (added after audit):
  - _safe_get_db() wraps every DB handle fetch so a dropped MongoDB connection
    returns a clean 503 instead of an unhandled exception with a raw traceback.
  - _validate_month() checks BOTH shape (YYYY-MM) AND that the month digits
    are actually 01-12, so "2026-13" returns a clean 400 instead of crashing
    deep inside calendar.monthrange().
  - _parse_positive_float() / _parse_positive_int() replace bare float()/int()
    calls on user input — a non-numeric string now returns 400 with a clear
    message instead of an unhandled ValueError. Zero/negative amounts are
    rejected with 400 since a spending entry can't logically be free or negative.
  - doctor_name is now required (non-empty after stripping whitespace) on both
    visit types — an empty name would otherwise silently save and show as a
    blank row in the UI.
"""
import re
from datetime import datetime, timezone, timedelta
from calendar import monthrange
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, Query
from app.api.auth import get_current_user
from app.db.database import get_db
from app.workflows.spending_workflow import get_spending_workflow, SpendingState

router = APIRouter(prefix="/spending", tags=["spending"])

IST = timezone(timedelta(hours=5, minutes=30))

def ist_now() -> datetime:
    return datetime.now(IST)

def ist_now_str() -> str:
    return datetime.now(IST).strftime("%d %b %Y, %H:%M")

def current_month_str() -> str:
    n = datetime.now(IST)
    return f"{n.year}-{str(n.month).zfill(2)}"


# ── Safe DB accessor ────────────────────────────────────────────────────────────
def _safe_get_db():
    """
    Wraps get_db() so a dropped/unavailable MongoDB connection returns a
    clean 503 the frontend can show as a toast, instead of an unhandled
    exception leaking a raw stack trace to the client.
    """
    try:
        return get_db()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Unable to connect to the database right now. Please try again in a moment."
        )


# ── Month validation ─────────────────────────────────────────────────────────────
def _validate_month(month: str) -> None:
    """
    Validates BOTH the shape (YYYY-MM) and that the month digits are a real
    month (01-12). A regex-only check would let "2026-13" or "2026-99" through,
    which would then crash deep inside calendar.monthrange() with an unhandled
    IllegalMonthError. This catches it upfront with a clean 400.
    """
    if not re.match(r'^\d{4}-\d{2}$', month):
        raise HTTPException(status_code=400, detail="Month must be in YYYY-MM format")
    mon = int(month[5:7])
    if mon < 1 or mon > 12:
        raise HTTPException(status_code=400, detail=f"'{month}' is not a valid month — month must be between 01 and 12")


def _month_range(month_str: str):
    year, mon = int(month_str[:4]), int(month_str[5:7])
    last_day = monthrange(year, mon)[1]
    return datetime(year, mon, 1, 0, 0, 0), datetime(year, mon, last_day, 23, 59, 59)

def _add_months(month_str: str, delta: int) -> str:
    """Shift a YYYY-MM string by `delta` months (negative = go back)."""
    year, mon = int(month_str[:4]), int(month_str[5:7])
    total = (year * 12 + (mon - 1)) + delta
    new_year = total // 12
    new_mon  = total % 12 + 1
    return f"{new_year}-{str(new_mon).zfill(2)}"

def _month_label(month_str: str) -> str:
    months = ["Jan","Feb","Mar","Apr","May","Jun",
              "Jul","Aug","Sep","Oct","Nov","Dec"]
    year, mon = int(month_str[:4]), int(month_str[5:7])
    return f"{months[mon-1]} {year}"


# ── Safe numeric parsing for user input ──────────────────────────────────────────
def _parse_positive_float(value, field_name: str) -> float:
    """
    Safely converts user-supplied input to a positive float.
    Raises a clean 400 instead of letting an unhandled ValueError surface
    when the frontend (or a manual API call) sends a non-numeric string.
    """
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a valid number")
    if result <= 0:
        raise HTTPException(status_code=400, detail=f"{field_name} must be greater than 0")
    return result


def _parse_positive_int(value, field_name: str, default: int = 1) -> int:
    """Safely converts user-supplied input to a positive int with a clean 400 on failure."""
    try:
        result = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a whole number")
    if result < 1:
        raise HTTPException(status_code=400, detail=f"{field_name} must be at least 1")
    return result


def _require_doctor_name(data: dict) -> str:
    """Doctor name must be present and non-blank — an empty name silently
    saves and shows as a blank row in the UI, which is confusing."""
    name = str(data.get("doctor_name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Doctor name is required")
    return name


# ── GET /spending/months ──────────────────────────────────────────────────────
@router.get("/months")
async def get_available_months(current_user=Depends(get_current_user)):
    """
    Return a FIXED 4-month trailing window: current month + 3 months back.
    Always anchored to today's real date — never depends on what data exists
    in the DB, so stale or out-of-range seed data can never leak into the list.

    Example: if today is June 2026 → returns [Mar 2026, Apr 2026, May 2026, Jun 2026]
    """
    cur = current_month_str()
    window = [_add_months(cur, -i) for i in range(3, -1, -1)]  # oldest → newest

    return [
        {
            "month":            m,
            "is_current_month": m == cur,
            "label":            _month_label(m),
        }
        for m in window
    ]


# ── Cache helpers ──────────────────────────────────────────────────────────────
async def _get_cached_summary(db, uid: str, month: str) -> Optional[dict]:
    doc = await db.spending_summary_cache.find_one({"user_id": uid, "month": month})
    if doc:
        doc.pop("_id", None)
        doc.pop("user_id", None)
        return doc
    return None


async def _set_cached_summary(db, uid: str, month: str, data: dict):
    await db.spending_summary_cache.update_one(
        {"user_id": uid, "month": month},
        {"$set": {**data, "user_id": uid, "month": month, "cached_at": ist_now()}},
        upsert=True,
    )


async def invalidate_month_cache(uid: str, month: str):
    """
    Call this whenever new data is added for a month (doctor visit, etc.)
    so the next view recomputes fresh instead of showing stale numbers.
    """
    db = _safe_get_db()
    await db.spending_summary_cache.delete_one({"user_id": uid, "month": month})


# ── GET /spending/summary ─────────────────────────────────────────────────────
@router.get("/summary")
async def get_spending_summary(
    month: Optional[str] = Query(default=None, description="YYYY-MM format"),
    force_refresh: bool = Query(default=False, description="Bypass cache and recompute"),
    current_user=Depends(get_current_user)
):
    """
    Returns spending summary for a month.

    Caching:
      - Current month        → always recomputed (cache overwritten after)
      - Past (closed) months → served from cache if present; computed once
        and cached on first view; never recomputed again unless force_refresh=true
    """
    if not month:
        month = current_month_str()

    _validate_month(month)

    db  = _safe_get_db()
    uid = str(current_user["_id"])
    cur = current_month_str()
    is_current = (month == cur)

    # ── Serve from cache for past months (unless force_refresh) ────────────────
    if not is_current and not force_refresh:
        cached = await _get_cached_summary(db, uid, month)
        if cached:
            return cached

    # ── Compute fresh (current month always, or cache miss, or forced) ─────────
    wf = get_spending_workflow()
    initial_state = SpendingState(
        user_id          = uid,
        month            = month,
        is_current_month = is_current,
        lab_items        = [],
        medicine_items   = [],
        doctor_items     = [],
        total_lab        = 0.0,
        total_medicine   = 0.0,
        total_doctor     = 0.0,
        grand_total      = 0.0,
        prev_month_total = None,
        change_amount    = None,
        change_pct       = None,
        patterns         = [],
        suggestions      = [],
        ai_summary       = "",
        error            = None,
    )

    result = await wf.ainvoke(initial_state)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    response = {
        "month":            month,
        "month_label":      _month_label(month),
        "is_current_month": result["is_current_month"],
        "lab_items":        result["lab_items"],
        "medicine_items":   result["medicine_items"],
        "doctor_items":     result["doctor_items"],
        "total_lab":        result["total_lab"],
        "total_medicine":   result["total_medicine"],
        "total_doctor":     result["total_doctor"],
        "grand_total":      result["grand_total"],
        "prev_month_total": result.get("prev_month_total"),
        "change_amount":    result.get("change_amount"),
        "change_pct":       result.get("change_pct"),
        "patterns":         result["patterns"],
        "suggestions":      result["suggestions"],
        "ai_summary":       result["ai_summary"],
    }

    # ── Cache it ─────────────────────────────────────────────────────────────────
    # Current month: cached too so this exact call's result is stored, but the
    # `not is_current` check above guarantees the NEXT call still recomputes
    # fresh for the current month (it never reads from cache for it).
    await _set_cached_summary(db, uid, month, response)

    return response


# ── POST /spending/doctor-visit ───────────────────────────────────────────────
@router.post("/doctor-visit")
async def add_doctor_visit(data: dict, current_user=Depends(get_current_user)):
    """
    Add a doctor visit — either one-time or subscription.
    Invalidates the cache for affected month(s) so the next summary view
    reflects this new data instead of stale cached numbers.
    """
    db  = _safe_get_db()
    uid = str(current_user["_id"])
    vt  = data.get("visit_type", "one_time")

    doctor_name = _require_doctor_name(data)

    if vt == "subscription":
        total   = _parse_positive_float(data.get("total_amount", 0), "Total amount")
        months  = _parse_positive_int(data.get("months", 1), "Months")
        per_month   = round(total / months, 2)

        start_month = data.get("start_month", current_month_str())
        _validate_month(start_month)

        sy, sm = int(start_month[:4]), int(start_month[5:7])
        em = sm + months - 1
        ey = sy + (em - 1) // 12
        em = ((em - 1) % 12) + 1
        end_month = f"{ey}-{str(em).zfill(2)}"

        doc = {
            "user_id":      uid,
            "doctor_name":  doctor_name,
            "visit_type":   "subscription",
            "plan_name":    data.get("plan_name", ""),
            "total_amount": total,
            "months":       months,
            "per_month":    per_month,
            "start_month":  start_month,
            "end_month":    end_month,
            "notes":        data.get("notes", ""),
            "created_at":   ist_now(),
        }

        # Invalidate cache for every month this subscription touches
        y, m = sy, sm
        for _ in range(months):
            await invalidate_month_cache(uid, f"{y}-{str(m).zfill(2)}")
            m += 1
            if m > 12:
                m = 1
                y += 1
    else:
        amount = _parse_positive_float(data.get("amount", 0), "Amount")

        visit_date_str = data.get("visit_date", "")
        try:
            visit_date = datetime.strptime(visit_date_str, "%Y-%m-%d")
        except Exception:
            visit_date = ist_now()

        # Reject visit dates in the future — a doctor visit can't have
        # happened yet, and a future date would silently land in a month
        # bucket the user hasn't reached, corrupting that month's totals.
        if visit_date.date() > ist_now().date():
            raise HTTPException(status_code=400, detail="Visit date cannot be in the future")

        month = f"{visit_date.year}-{str(visit_date.month).zfill(2)}"

        doc = {
            "user_id":         uid,
            "doctor_name":     doctor_name,
            "visit_type":      "one_time",
            "visit_sub_type":  data.get("visit_sub_type", "Follow-up"),
            "plan_name":       None,
            "amount":          amount,
            "visit_date":      visit_date,
            "month":           month,
            "notes":           data.get("notes", ""),
            "created_at":      ist_now(),
        }
        await invalidate_month_cache(uid, month)

    try:
        result = await db.doctor_visits.insert_one(doc)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not save the visit right now. Please try again."
        )

    return {"message": "Doctor visit saved", "id": str(result.inserted_id)}


# ── GET /spending/doctor-visits ───────────────────────────────────────────────
@router.get("/doctor-visits")
async def get_doctor_visits(
    month: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user)
):
    """Get all doctor visits for a given month."""
    if not month:
        month = current_month_str()
    _validate_month(month)

    db  = _safe_get_db()
    uid = str(current_user["_id"])
    visits = []

    cursor = db.doctor_visits.find({
        "user_id":    uid,
        "visit_type": {"$ne": "subscription"},
        "month":      month,
    })
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("visit_date"), datetime):
            doc["visit_date"] = doc["visit_date"].strftime("%Y-%m-%d")
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        visits.append(doc)

    cursor = db.doctor_visits.find({
        "user_id":     uid,
        "visit_type":  "subscription",
        "start_month": {"$lte": month},
        "end_month":   {"$gte": month},
    })
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        visits.append(doc)

    return visits


# ── DELETE /spending/doctor-visit/{id} ───────────────────────────────────────
@router.delete("/doctor-visit/{visit_id}")
async def delete_doctor_visit(visit_id: str, current_user=Depends(get_current_user)):
    db  = _safe_get_db()
    uid = str(current_user["_id"])
    try:
        oid = ObjectId(visit_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid visit ID")

    visit = await db.doctor_visits.find_one({"_id": oid, "user_id": uid})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    result = await db.doctor_visits.delete_one({"_id": oid, "user_id": uid})

    # Invalidate affected month(s)
    if visit.get("visit_type") == "subscription":
        sm, em = visit.get("start_month", ""), visit.get("end_month", "")
        if sm and em:
            y, m   = int(sm[:4]), int(sm[5:7])
            ey, em_n = int(em[:4]), int(em[5:7])
            while (y, m) <= (ey, em_n):
                await invalidate_month_cache(uid, f"{y}-{str(m).zfill(2)}")
                m += 1
                if m > 12:
                    m = 1
                    y += 1
    elif visit.get("month"):
        await invalidate_month_cache(uid, visit["month"])

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Visit not found")
    return {"message": "Visit deleted"}


# ── POST /spending/report ─────────────────────────────────────────────────────
@router.post("/report")
async def generate_spending_report(data: dict, current_user=Depends(get_current_user)):
    """
    Enriches frontend's already-fetched summary data with patient info,
    ready for the frontend to render into a jsPDF document (matches the
    pattern used by UC1's Lab Test Plan and UC2's Prescription Plan).
    """
    return {
        "patient_name":     current_user["name"],
        "patient_type":     current_user["patient_type"],
        "generated_on":     ist_now_str(),
        "month":            data.get("month", current_month_str()),
        "month_label":      _month_label(data.get("month", current_month_str())),
        "is_current_month": data.get("is_current_month", False),
        "lab_items":        data.get("lab_items", []),
        "medicine_items":   data.get("medicine_items", []),
        "doctor_items":     data.get("doctor_items", []),
        "total_lab":        data.get("total_lab", 0),
        "total_medicine":   data.get("total_medicine", 0),
        "total_doctor":     data.get("total_doctor", 0),
        "grand_total":      data.get("grand_total", 0),
        "prev_month_total": data.get("prev_month_total"),
        "change_amount":    data.get("change_amount"),
        "change_pct":       data.get("change_pct"),
        "patterns":         data.get("patterns", []),
        "suggestions":      data.get("suggestions", []),
        "ai_summary":       data.get("ai_summary", ""),
        "note":             "This report is for personal financial planning only. Consult your doctor for medical decisions.",
    }
