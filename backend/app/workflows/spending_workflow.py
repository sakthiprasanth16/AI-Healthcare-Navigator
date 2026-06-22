"""
LangGraph workflow for Spending Tracker (Use Case 3):
START → DataAggregation → PatternDetection → SavingsSuggestions → Summary → END

Data sources:
  selected_labs          → lab test expenses
  medicine_cost_reports  → medicine expenses
  doctor_visits          → doctor consultation expenses (one-time + subscription)

NOTE: No AI/LLM calls anywhere in this workflow. All 4 nodes (aggregation,
pattern detection, savings suggestions, and the final summary sentence) are
fully deterministic — built from MongoDB queries and plain arithmetic/string
templates. There is nothing in this flow that benefits from an LLM call, so
none is made; this keeps the spending tracker fast, free, and 100% predictable.
"""
import re
from datetime import datetime, timezone, timedelta
from calendar import monthrange
from typing import TypedDict, List, Optional, Any
from langgraph.graph import StateGraph, END
from app.db.database import get_db

IST = timezone(timedelta(hours=5, minutes=30))


# ── State ─────────────────────────────────────────────────────────────────────
class SpendingState(TypedDict):
    user_id:          str
    month:            str            # "YYYY-MM"
    is_current_month: bool

    # Aggregated items
    lab_items:        List[dict]
    medicine_items:   List[dict]
    doctor_items:     List[dict]

    # Totals
    total_lab:        float
    total_medicine:   float
    total_doctor:     float
    grand_total:      float

    # Month comparison
    prev_month_total: Optional[float]
    change_amount:    Optional[float]
    change_pct:       Optional[float]

    # Analysis
    patterns:         List[dict]
    suggestions:      List[dict]
    ai_summary:       str

    error:            Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────
def _month_range(month_str: str):
    """Return (start_dt, end_dt) for a YYYY-MM string."""
    year, mon = int(month_str[:4]), int(month_str[5:7])
    last_day  = monthrange(year, mon)[1]
    return (datetime(year, mon, 1, 0, 0, 0),
            datetime(year, mon, last_day, 23, 59, 59))


def _prev_month_str(month_str: str) -> str:
    year, mon = int(month_str[:4]), int(month_str[5:7])
    mon -= 1
    if mon == 0:
        mon  = 12
        year -= 1
    return f"{year}-{str(mon).zfill(2)}"


def _fmt_date(dt) -> str:
    if isinstance(dt, datetime):
        return dt.strftime("%d %b %Y")
    if isinstance(dt, str):
        try:
            return datetime.strptime(dt, "%Y-%m-%d").strftime("%d %b %Y")
        except Exception:
            return dt
    return ""


# ── Node 1: Data Aggregation ──────────────────────────────────────────────────
async def data_aggregation_node(state: SpendingState) -> SpendingState:
    """
    Fetch all 3 data sources for the given month and build item lists.
    Also fetches previous month total for comparison.
    """
    try:
        db       = get_db()
        uid      = state["user_id"]
        month    = state["month"]
        start, end = _month_range(month)

        # ── 1. Lab items from selected_labs ───────────────────────────────────
        lab_items = []
        cursor = db.selected_labs.find({
            "user_id":     uid,
            "selected_at": {"$gte": start, "$lte": end},
        })
        async for doc in cursor:
            tests = doc.get("selected_tests") or []
            if not tests and doc.get("selected_test"):
                tests = [doc["selected_test"]]
            for tname in tests:
                lab_items.append({
                    "test_name": tname,
                    "lab_name":  doc.get("lab_name", "Unknown Lab"),
                    "price":     doc.get("price", 0),
                    "date":      _fmt_date(doc.get("selected_at")),
                })

        # Also check by month field (seeded data)
        cursor2 = db.selected_labs.find({
            "user_id": uid,
            "month":   month,
        })
        seen_ids = set()
        async for doc in cursor:
            pass  # already iterated above
        cursor2 = db.selected_labs.find({"user_id": uid, "month": month})
        async for doc in cursor2:
            doc_id = str(doc.get("_id", ""))
            if doc_id in seen_ids:
                continue
            seen_ids.add(doc_id)
            # Check not already added via date range
            sa = doc.get("selected_at")
            if sa and start <= sa <= end:
                continue
            tests = doc.get("selected_tests") or []
            if not tests and doc.get("selected_test"):
                tests = [doc["selected_test"]]
            for tname in tests:
                lab_items.append({
                    "test_name": tname,
                    "lab_name":  doc.get("lab_name", "Unknown Lab"),
                    "price":     doc.get("price", 0),
                    "date":      _fmt_date(doc.get("selected_at")),
                })

        total_lab = sum(i["price"] for i in lab_items)

        # ── 2. Medicine items from medicine_cost_reports ───────────────────────
        medicine_items = []
        cursor = db.medicine_cost_reports.find({
            "user_id":    uid,
            "created_at": {"$gte": start, "$lte": end},
        })
        async for doc in cursor:
            for med in doc.get("medicines", []):
                medicine_items.append({
                    "medicine_name":    med.get("name", ""),
                    "selected_medicine": med.get("selected", med.get("name", "")),
                    "price":             med.get("price", 0),
                    "qty":               med.get("qty", 1),
                    "saving":            med.get("saving", 0),
                    "pharmacy_name":     med.get("pharmacy", ""),
                    "date":              _fmt_date(doc.get("created_at")),
                })

        # Also check by month field (seeded data)
        cursor2 = db.medicine_cost_reports.find({"user_id": uid, "month": month})
        seen_ids2 = set()
        async for doc in cursor2:
            doc_id = str(doc.get("_id", ""))
            if doc_id in seen_ids2:
                continue
            seen_ids2.add(doc_id)
            ca = doc.get("created_at")
            if ca and start <= ca <= end:
                continue
            for med in doc.get("medicines", []):
                medicine_items.append({
                    "medicine_name":     med.get("name", ""),
                    "selected_medicine": med.get("selected", med.get("name", "")),
                    "price":             med.get("price", 0),
                    "qty":               med.get("qty", 1),
                    "saving":            med.get("saving", 0),
                    "pharmacy_name":     med.get("pharmacy", ""),
                    "date":              _fmt_date(doc.get("created_at")),
                })

        total_medicine = sum(i["price"] * i.get("qty", 1) for i in medicine_items)

        # ── 3. Doctor items from doctor_visits ────────────────────────────────
        doctor_items = []

        # One-time visits for this month
        cursor = db.doctor_visits.find({
            "user_id":    uid,
            "visit_type": {"$ne": "subscription"},
            "month":      month,
        })
        async for doc in cursor:
            doctor_items.append({
                "doctor_name":   doc.get("doctor_name", ""),
                "visit_type":    doc.get("visit_sub_type", "Visit"),
                "plan_name":     None,
                "amount":        doc.get("amount", 0),
                "date":          _fmt_date(doc.get("visit_date")),
                "is_subscription": False,
                "notes":         doc.get("notes", ""),
            })

        # Subscription plans active during this month
        cursor = db.doctor_visits.find({
            "user_id":     uid,
            "visit_type":  "subscription",
            "start_month": {"$lte": month},
            "end_month":   {"$gte": month},
        })
        async for doc in cursor:
            doctor_items.append({
                "doctor_name":   doc.get("doctor_name", ""),
                "visit_type":    "Subscription",
                "plan_name":     doc.get("plan_name", ""),
                "amount":        doc.get("per_month", 0),
                "date":          f"{month} (subscription)",
                "is_subscription": True,
                "notes":         doc.get("notes", ""),
            })

        total_doctor = sum(i["amount"] for i in doctor_items)

        grand_total  = round(total_lab + total_medicine + total_doctor, 2)

        # ── 4. Previous month total for comparison ────────────────────────────
        prev_month   = _prev_month_str(month)
        ps, pe       = _month_range(prev_month)
        prev_total   = 0.0
        has_prev     = False

        # prev labs
        cursor = db.selected_labs.find({"user_id": uid, "month": prev_month})
        async for doc in cursor:
            prev_total += doc.get("price", 0)
            has_prev    = True
        cursor = db.selected_labs.find({"user_id": uid, "selected_at": {"$gte": ps, "$lte": pe}})
        async for doc in cursor:
            prev_total += doc.get("price", 0)
            has_prev    = True

        # prev medicines
        cursor = db.medicine_cost_reports.find({"user_id": uid, "month": prev_month})
        async for doc in cursor:
            for m in doc.get("medicines", []):
                prev_total += m.get("price", 0) * m.get("qty", 1)
            has_prev = True
        cursor = db.medicine_cost_reports.find({"user_id": uid, "created_at": {"$gte": ps, "$lte": pe}})
        async for doc in cursor:
            for m in doc.get("medicines", []):
                prev_total += m.get("price", 0) * m.get("qty", 1)
            has_prev = True

        # prev doctors
        cursor = db.doctor_visits.find({"user_id": uid, "visit_type": {"$ne": "subscription"}, "month": prev_month})
        async for doc in cursor:
            prev_total += doc.get("amount", 0)
            has_prev    = True
        cursor = db.doctor_visits.find({"user_id": uid, "visit_type": "subscription", "start_month": {"$lte": prev_month}, "end_month": {"$gte": prev_month}})
        async for doc in cursor:
            prev_total += doc.get("per_month", 0)
            has_prev    = True

        prev_month_total = round(prev_total, 2) if has_prev else None
        change_amount    = round(grand_total - prev_total, 2) if has_prev and prev_total > 0 else None
        change_pct       = round((change_amount / prev_total) * 100, 1) if change_amount is not None and prev_total > 0 else None

        return {
            **state,
            "lab_items":        lab_items,
            "medicine_items":   medicine_items,
            "doctor_items":     doctor_items,
            "total_lab":        round(total_lab, 2),
            "total_medicine":   round(total_medicine, 2),
            "total_doctor":     round(total_doctor, 2),
            "grand_total":      grand_total,
            "prev_month_total": prev_month_total,
            "change_amount":    change_amount,
            "change_pct":       change_pct,
        }

    except Exception as e:
        return {**state, "error": f"Data aggregation failed: {str(e)}"}


# ── Node 2: Pattern Detection ─────────────────────────────────────────────────
async def pattern_detection_node(state: SpendingState) -> SpendingState:
    """
    Compare last 3 months to find recurring vs occasional expenses.
    Pattern = item appearing in 2+ of the last 3 months.
    """
    if state.get("error"):
        return state

    try:
        db    = get_db()
        uid   = state["user_id"]
        month = state["month"]

        # Build 3-month window
        months_to_check = [month]
        m = month
        for _ in range(2):
            m = _prev_month_str(m)
            months_to_check.append(m)

        # Gather items per month
        item_months: dict[str, dict] = {}  # item_key → {months: set, amounts: list, category}

        for mo in months_to_check:
            ps, pe = _month_range(mo)

            # Labs
            cursor = db.selected_labs.find({
                "$or": [
                    {"user_id": uid, "month": mo},
                    {"user_id": uid, "selected_at": {"$gte": ps, "$lte": pe}},
                ]
            })
            async for doc in cursor:
                tests = doc.get("selected_tests") or ([doc["selected_test"]] if doc.get("selected_test") else [])
                for t in tests:
                    key = f"lab::{t}"
                    if key not in item_months:
                        item_months[key] = {"name": t, "category": "lab", "months": set(), "amounts": []}
                    item_months[key]["months"].add(mo)
                    item_months[key]["amounts"].append(doc.get("price", 0))

            # Medicines
            cursor = db.medicine_cost_reports.find({
                "$or": [
                    {"user_id": uid, "month": mo},
                    {"user_id": uid, "created_at": {"$gte": ps, "$lte": pe}},
                ]
            })
            async for doc in cursor:
                for med in doc.get("medicines", []):
                    name = med.get("name", "")
                    if not name:
                        continue
                    key = f"med::{name}"
                    if key not in item_months:
                        item_months[key] = {"name": name, "category": "medicine", "months": set(), "amounts": []}
                    item_months[key]["months"].add(mo)
                    item_months[key]["amounts"].append(
                        med.get("price", 0) * med.get("qty", 1)
                    )

            # Doctor visits (one-time)
            cursor = db.doctor_visits.find({
                "user_id":    uid,
                "visit_type": {"$ne": "subscription"},
                "month":      mo,
            })
            async for doc in cursor:
                name = doc.get("doctor_name", "Doctor")
                key  = f"doc::{name}"
                if key not in item_months:
                    item_months[key] = {"name": name, "category": "doctor", "months": set(), "amounts": []}
                item_months[key]["months"].add(mo)
                item_months[key]["amounts"].append(doc.get("amount", 0))

            # Doctor subscriptions
            cursor = db.doctor_visits.find({
                "user_id":     uid,
                "visit_type":  "subscription",
                "start_month": {"$lte": mo},
                "end_month":   {"$gte": mo},
            })
            async for doc in cursor:
                name = doc.get("doctor_name", "Subscription")
                pname = doc.get("plan_name", "")
                key  = f"sub::{name}::{pname}"
                if key not in item_months:
                    item_months[key] = {"name": f"{name} ({pname})" if pname else name, "category": "doctor", "months": set(), "amounts": []}
                item_months[key]["months"].add(mo)
                item_months[key]["amounts"].append(doc.get("per_month", 0))

        total_months = len(months_to_check)
        patterns     = []
        for key, info in item_months.items():
            months_present = len(info["months"])
            amounts        = info["amounts"]
            avg_amount     = round(sum(amounts) / len(amounts), 2) if amounts else 0
            patterns.append({
                "name":           info["name"],
                "category":       info["category"],
                "months_present": months_present,
                "total_months":   total_months,
                "avg_amount":     avg_amount,
                "is_recurring":   months_present >= 2,
            })

        # Sort: recurring first, then by avg_amount desc
        patterns.sort(key=lambda x: (-x["is_recurring"], -x["avg_amount"]))

        return {**state, "patterns": patterns}

    except Exception as e:
        return {**state, "patterns": [], "error": f"Pattern detection failed: {str(e)}"}


# ── Node 3: Savings Suggestions ───────────────────────────────────────────────
async def _find_medicine_in_pharmacies(db, med_name: str) -> dict | None:
    """
    Find a medicine's ingredient/strength by scanning the pharmacies collection.
    Replaces the old medicine_catalog lookup (collection no longer exists after
    the UC2 pharmacy migration). Returns the first matching entry found across
    any pharmacy — ingredient/strength are consistent across pharmacies for the
    same medicine name.
    """
    pharmacies = await db.pharmacies.find({}).to_list(length=20)
    name_lower = med_name.lower()
    for p in pharmacies:
        for m in p.get("medicines", []):
            if m["name"].lower() == name_lower:
                return {
                    "active_ingredient": m.get("active_ingredient", ""),
                    "strength":          m.get("strength", ""),
                }
    return None


async def _find_cheapest_pharmacy_for(db, ingredient: str, strength: str, current_price: float) -> dict | None:
    """
    Scan all pharmacies for the cheapest medicine matching the same
    active_ingredient + strength, priced lower than current_price.
    Returns {name, price, pharmacy_name, area} or None.
    """
    pharmacies = await db.pharmacies.find({}).to_list(length=20)
    best = None
    for p in pharmacies:
        for m in p.get("medicines", []):
            if (m.get("active_ingredient", "") == ingredient
                    and m.get("strength", "") == strength
                    and m["price"] < current_price):
                if best is None or m["price"] < best["price"]:
                    best = {
                        "name":          m["name"],
                        "price":         m["price"],
                        "pharmacy_name": p["name"],
                        "area":          p.get("area", ""),
                    }
    return best


async def savings_suggestions_node(state: SpendingState) -> SpendingState:
    """
    Cross-reference spending data with the pharmacies collection (UC2) and
    labs collection (UC1) to suggest savings.

    Medicine suggestions now query `pharmacies[].medicines[]` instead of the
    retired `medicine_catalog` collection, since UC2 moved to a per-pharmacy
    price model. Same ingredient+strength matching rule as pharmacy_service.py.
    """
    if state.get("error"):
        return state

    try:
        db          = get_db()
        suggestions = []

        # ── Medicine suggestions (pharmacy-aware) ───────────────────────────────
        for item in state.get("medicine_items", []):
            med_name      = item.get("medicine_name", "")
            current_price = item.get("price", 0)
            if not med_name or current_price == 0:
                continue

            info = await _find_medicine_in_pharmacies(db, med_name)
            if not info:
                continue

            ingredient = info["active_ingredient"]
            strength   = info["strength"]
            if not ingredient or not strength:
                continue

            cheapest = await _find_cheapest_pharmacy_for(db, ingredient, strength, current_price)
            if cheapest:
                saving = round(current_price - cheapest["price"], 2)
                if saving >= 10:
                    suggestions.append({
                        "category":         "medicine",
                        "title":            f"Switch {med_name} to {cheapest['pharmacy_name']}",
                        "current_spend":    current_price,
                        "potential_saving": saving,
                        "action":           f"Switch to {cheapest['pharmacy_name']} ({cheapest['area']}) for ₹{saving} less — {cheapest['name']} costs ₹{cheapest['price']} there vs ₹{current_price} you paid",
                        "link_to":          "/medicines",
                    })

        # ── Lab suggestions ───────────────────────────────────────────────────
        for item in state.get("lab_items", []):
            test_name    = item.get("test_name", "")
            current_price = item.get("price", 0)
            lab_name     = item.get("lab_name", "")
            if not test_name or current_price == 0:
                continue

            # Find cheaper lab for same test
            cheaper_lab = await db.labs.find_one(
                {
                    "tests":      {"$elemMatch": {"name": test_name, "price": {"$lt": current_price}}},
                    "name":       {"$ne": lab_name},
                },
                sort=[("tests.price", 1)]
            )
            if cheaper_lab:
                # Get the test price from that lab
                test_info = next(
                    (t for t in cheaper_lab.get("tests", []) if t["name"] == test_name),
                    None
                )
                if test_info:
                    saving = current_price - test_info["price"]
                    if saving >= 20:
                        suggestions.append({
                            "category":        "lab",
                            "title":           f"Cheaper lab for {test_name}",
                            "current_spend":   current_price,
                            "potential_saving": saving,
                            "action":          f"You paid ₹{current_price} at {lab_name}. {cheaper_lab['name']} ({cheaper_lab['area']}) charges ₹{test_info['price']}",
                            "link_to":         "/dashboard",
                        })

        # Deduplicate — keep highest saving per medicine/test name
        seen   = {}
        unique = []
        for s in suggestions:
            key = s["title"]
            if key not in seen or s["potential_saving"] > seen[key]:
                seen[key] = s["potential_saving"]
                unique.append(s)

        # Sort by saving desc
        unique.sort(key=lambda x: -x["potential_saving"])

        return {**state, "suggestions": unique[:5]}

    except Exception as e:
        return {**state, "suggestions": [], "error": f"Suggestions failed: {str(e)}"}


# ── Node 4: Gemini Summary ────────────────────────────────────────────────────
async def summary_node(state: SpendingState) -> SpendingState:
    """
    Build a friendly monthly spending summary from already-computed numbers.

    NOTE: This is fully rule-based — no Gemini/AI call is made here.
    Every number used (totals, change vs last month, top category, savings)
    was already computed by the earlier nodes (data_aggregation_node,
    pattern_detection_node, savings_suggestions_node). Since this node only
    stitches already-correct facts into a sentence, an LLM call would add
    cost and latency without adding any real value — a template covers it
    completely and never invents or misstates a number.
    """
    if state.get("error"):
        return {**state, "ai_summary": ""}

    grand   = state["grand_total"]
    prev    = state.get("prev_month_total")
    change  = state.get("change_amount")
    suggestions = state.get("suggestions", [])
    month_label = ""
    try:
        y, m    = int(state["month"][:4]), int(state["month"][5:7])
        months  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        month_label = f"{months[m-1]} {y}"
    except Exception:
        month_label = state["month"]

    change_text = ""
    if change is not None and prev and prev > 0:
        if change < 0:
            change_text = f"Spending decreased by ₹{abs(change)} vs last month."
        elif change > 0:
            change_text = f"Spending increased by ₹{change} vs last month."
        else:
            change_text = "Spending is the same as last month."

    parts = [f"Your {month_label} healthcare spending was ₹{grand}."]

    cats = [
        ("medicines",     state["total_medicine"]),
        ("lab tests",     state["total_lab"]),
        ("doctor visits", state["total_doctor"]),
    ]
    top = max(cats, key=lambda x: x[1])
    if top[1] > 0:
        parts.append(f"Your largest expense was {top[0]} at ₹{top[1]}.")

    if change_text:
        parts.append(change_text)

    if suggestions:
        total_saving = sum(s["potential_saving"] for s in suggestions)
        parts.append(f"You could potentially save ₹{total_saving}/month by switching to cheaper alternatives.")

    parts.append("Keep tracking your expenses to better manage your long-term healthcare costs.")
    summary = " ".join(parts)

    return {**state, "ai_summary": summary}


# ── Build workflow ─────────────────────────────────────────────────────────────
def build_spending_workflow():
    wf = StateGraph(SpendingState)
    wf.add_node("data_aggregation",    data_aggregation_node)
    wf.add_node("pattern_detection",   pattern_detection_node)
    wf.add_node("savings_suggestions", savings_suggestions_node)
    wf.add_node("summary",             summary_node)
    wf.set_entry_point("data_aggregation")
    wf.add_edge("data_aggregation",    "pattern_detection")
    wf.add_edge("pattern_detection",   "savings_suggestions")
    wf.add_edge("savings_suggestions", "summary")
    wf.add_edge("summary",             END)
    return wf.compile()


_spending_wf = None

def get_spending_workflow():
    global _spending_wf
    if _spending_wf is None:
        _spending_wf = build_spending_workflow()
    return _spending_wf
