"""Save and retrieve medicine cost reports."""
from datetime import datetime, timezone, timedelta
from app.db.database import get_db

# IST = UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))

def ist_now() -> datetime:
    return datetime.now(IST)


async def save_report(user_id: str, source: str, medicines: list,
                      original_cost: float, optimized_cost: float, total_saving: float) -> str:
    db = get_db()
    doc = {
        "user_id": user_id,
        "source": source,
        "medicines": medicines,
        "original_cost": original_cost,
        "optimized_cost": optimized_cost,
        "total_saving": total_saving,
        "created_at": ist_now()
    }
    result = await db.medicine_cost_reports.insert_one(doc)
    return str(result.inserted_id)


async def get_reports(user_id: str) -> list:
    db = get_db()
    cursor = db.medicine_cost_reports.find({"user_id": user_id}).sort("created_at", -1).limit(10)
    reports = []
    async for r in cursor:
        r["_id"] = str(r["_id"])
        r["created_at"] = r["created_at"].isoformat()
        reports.append(r)
    return reports
