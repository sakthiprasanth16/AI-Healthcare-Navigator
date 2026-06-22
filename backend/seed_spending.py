"""
Seed 3 months of healthcare spending history for demo users.
Anchored to TODAY'S real date — always seeds the 3 months immediately
BEFORE the current month, leaving the current month empty for the user
to fill in manually via UC1 (Lab Navigator) and UC2 (Medicine Optimizer).

Example: if run in June 2026 → seeds March, April, May 2026.
         June 2026 is left empty on purpose.

Creates realistic data for:
  - selected_labs           (3 months)
  - medicine_cost_reports   (3 months) — now includes "pharmacy" field per
                              medicine, matching the real pharmacy names and
                              prices from seed_pharmacies.py (Apollo Pharmacy,
                              MedPlus Pharmacy, Medline Pharmacy, etc.)
  - doctor_visits           (3 months + 1 subscription plan spanning all 3)

Run: python seed_spending.py
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/healthcare_navigator")


# ── Helpers ───────────────────────────────────────────────────────────────────
def dt(year, month, day, hour=10, minute=0):
    return datetime(year, month, day, hour, minute, 0)


def month_str(year, month):
    return f"{year}-{str(month).zfill(2)}"


def add_months(year, month, delta):
    total = (year * 12 + (month - 1)) + delta
    return total // 12, (total % 12) + 1


async def seed():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client.healthcare_navigator

    # ── Anchor to TODAY — always seed the 3 months before current month ────────
    today = datetime.utcnow()
    cur_year, cur_month = today.year, today.month

    # 3 months back, 2 months back, 1 month back (current month left empty)
    y3, m3 = add_months(cur_year, cur_month, -3)
    y2, m2 = add_months(cur_year, cur_month, -2)
    y1, m1 = add_months(cur_year, cur_month, -1)

    MONTH_3_AGO = (y3, m3)   # e.g. March 2026
    MONTH_2_AGO = (y2, m2)   # e.g. April 2026
    MONTH_1_AGO = (y1, m1)   # e.g. May 2026

    print(f"Today detected as: {cur_year}-{str(cur_month).zfill(2)}")
    print(f"Seeding 3 months: "
          f"{MONTH_3_AGO[0]}-{str(MONTH_3_AGO[1]).zfill(2)}, "
          f"{MONTH_2_AGO[0]}-{str(MONTH_2_AGO[1]).zfill(2)}, "
          f"{MONTH_1_AGO[0]}-{str(MONTH_1_AGO[1]).zfill(2)}")
    print(f"Current month {cur_year}-{str(cur_month).zfill(2)} is left EMPTY "
          f"— add it manually via Lab Navigator / Medicine Optimizer.\n")

    # ── Get user IDs ──────────────────────────────────────────────────────────
    demo_user = await db.users.find_one({"username": "demo"})
    ravi_user = await db.users.find_one({"username": "ravi"})

    user_ids = {}
    if demo_user:
        user_ids["demo"] = str(demo_user["_id"])
        print(f"Found demo user: {user_ids['demo']}")
    else:
        print("WARNING: demo user not found — login as demo first, then re-run this script.")

    if ravi_user:
        user_ids["ravi"] = str(ravi_user["_id"])
        print(f"Found ravi user: {user_ids['ravi']}")

    if not user_ids:
        print("ERROR: No users found. Please login as demo first, then re-run this script.")
        client.close()
        return

    # ── Clear ALL previous seeded spending data (any year) for these users ─────
    # We clear everything previously seeded by this script (identified by the
    # "seeded_by_script" marker) so re-running never duplicates or leaves stale
    # data from a previous run's different date anchor.
    for uid in user_ids.values():
        await db.selected_labs.delete_many({"user_id": uid, "seeded_by_script": True})
        await db.medicine_cost_reports.delete_many({"user_id": uid, "seeded_by_script": True})
        await db.doctor_visits.delete_many({"user_id": uid, "seeded_by_script": True})
        await db.spending_summary_cache.delete_many({"user_id": uid})

    print("Cleared old seeded spending data + cache\n")

    for username, uid in user_ids.items():
        print(f"Seeding for user: {username} ({uid})")

        y3_, m3_ = MONTH_3_AGO
        y2_, m2_ = MONTH_2_AGO
        y1_, m1_ = MONTH_1_AGO

        # ════════════════════════════════════════════════════════════════════
        # SELECTED LABS — 3 months
        # Recurring: HbA1c every month, Fasting Blood Sugar every month
        # Occasional: Lipid Profile (month 3 + month 1), Kidney Function (month 2)
        # ════════════════════════════════════════════════════════════════════
        selected_labs_data = [

            # ── MONTH 3 AGO ──────────────────────────────────────────────────
            {
                "user_id": uid, "lab_id": "apollo_anna_nagar", "lab_name": "Apollo Diagnostics",
                "selected_test": "HbA1c", "selected_tests": ["HbA1c"], "price": 450,
                "selected_at": dt(y3_, m3_, 5, 9, 30), "month": month_str(y3_, m3_),
                "seeded_by_script": True,
            },
            {
                "user_id": uid, "lab_id": "vijaya_tnagar", "lab_name": "Vijaya Diagnostic Centre",
                "selected_test": "Fasting Blood Sugar", "selected_tests": ["Fasting Blood Sugar"], "price": 100,
                "selected_at": dt(y3_, m3_, 5, 9, 35), "month": month_str(y3_, m3_),
                "seeded_by_script": True,
            },
            {
                "user_id": uid, "lab_id": "apollo_anna_nagar", "lab_name": "Apollo Diagnostics",
                "selected_test": "Lipid Profile", "selected_tests": ["Lipid Profile"], "price": 520,
                "selected_at": dt(y3_, m3_, 5, 9, 40), "month": month_str(y3_, m3_),
                "seeded_by_script": True,
            },

            # ── MONTH 2 AGO ──────────────────────────────────────────────────
            {
                "user_id": uid, "lab_id": "srl_adyar", "lab_name": "SRL Diagnostics",
                "selected_test": "HbA1c", "selected_tests": ["HbA1c"], "price": 480,
                "selected_at": dt(y2_, m2_, 7, 10, 15), "month": month_str(y2_, m2_),
                "seeded_by_script": True,
            },
            {
                "user_id": uid, "lab_id": "srl_adyar", "lab_name": "SRL Diagnostics",
                "selected_test": "Fasting Blood Sugar", "selected_tests": ["Fasting Blood Sugar"], "price": 120,
                "selected_at": dt(y2_, m2_, 7, 10, 20), "month": month_str(y2_, m2_),
                "seeded_by_script": True,
            },
            {
                "user_id": uid, "lab_id": "neuberg_perungudi", "lab_name": "Neuberg Diagnostics",
                "selected_test": "Kidney Function Test", "selected_tests": ["Kidney Function Test"], "price": 600,
                "selected_at": dt(y2_, m2_, 20, 14, 0), "month": month_str(y2_, m2_),
                "seeded_by_script": True,
            },

            # ── MONTH 1 AGO ──────────────────────────────────────────────────
            {
                "user_id": uid, "lab_id": "dr_lal_velachery", "lab_name": "Dr. Lal PathLabs",
                "selected_test": "HbA1c", "selected_tests": ["HbA1c"], "price": 420,
                "selected_at": dt(y1_, m1_, 4, 9, 0), "month": month_str(y1_, m1_),
                "seeded_by_script": True,
            },
            {
                "user_id": uid, "lab_id": "dr_lal_velachery", "lab_name": "Dr. Lal PathLabs",
                "selected_test": "Fasting Blood Sugar", "selected_tests": ["Fasting Blood Sugar"], "price": 110,
                "selected_at": dt(y1_, m1_, 4, 9, 5), "month": month_str(y1_, m1_),
                "seeded_by_script": True,
            },
            {
                "user_id": uid, "lab_id": "vijaya_tnagar", "lab_name": "Vijaya Diagnostic Centre",
                "selected_test": "Lipid Profile", "selected_tests": ["Lipid Profile"], "price": 490,
                "selected_at": dt(y1_, m1_, 4, 9, 10), "month": month_str(y1_, m1_),
                "seeded_by_script": True,
            },
        ]

        result = await db.selected_labs.insert_many(selected_labs_data)
        print(f"  Inserted {len(result.inserted_ids)} selected_labs records")

        # ════════════════════════════════════════════════════════════════════
        # MEDICINE COST REPORTS — 3 months, NOW PHARMACY-AWARE
        # Real pharmacy names + prices from seed_pharmacies.py:
        #   Telma 40 (brand)         : MedPlus ₹140, Apollo ₹142
        #   Telmisartan 40mg (generic): Medline ₹55 (cheapest), Apollo ₹58
        #   Glycomet GP2 (brand)      : MedPlus ₹180, Apollo ₹182
        #   Metformin 500 (generic)   : Wellness Forever ₹42 (cheapest), MedPlus ₹43
        #   Rozavel 10 (brand)        : Wellness Forever ₹150, Medline ₹150
        #
        # Story: patient progressively switches pharmacies to save money
        #   Month 3 ago → bought brand medicines at MedPlus (no optimization yet)
        #   Month 2 ago → switched Telma 40 to generic at Medline (partial saving)
        #   Month 1 ago → switched Glycomet GP2 to generic at Wellness Forever too
        # ════════════════════════════════════════════════════════════════════
        medicine_reports_data = [

            # ── MONTH 3 AGO — brand medicines, bought at MedPlus, no optimization ──
            {
                "user_id": uid,
                "source": "manual",
                "medicines": [
                    {"name": "Telma 40", "selected": "Telma 40", "price": 140, "qty": 1,
                     "saving": 0, "status": "saving_found", "pharmacy": "MedPlus Pharmacy"},
                    {"name": "Glycomet GP2", "selected": "Glycomet GP2", "price": 180, "qty": 1,
                     "saving": 0, "status": "saving_found", "pharmacy": "MedPlus Pharmacy"},
                    {"name": "Rozavel 10", "selected": "Rozavel 10", "price": 152, "qty": 1,
                     "saving": 0, "status": "marginal_saving", "pharmacy": "MedPlus Pharmacy"},
                ],
                "original_cost": 472, "optimized_cost": 472, "total_saving": 0,
                "created_at": dt(y3_, m3_, 3, 11, 0), "month": month_str(y3_, m3_),
                "seeded_by_script": True,
            },

            # ── MONTH 2 AGO — Telma switched to generic at Medline Pharmacy ───────
            {
                "user_id": uid,
                "source": "manual",
                "medicines": [
                    {"name": "Telma 40", "selected": "Telmisartan 40mg", "price": 55, "qty": 1,
                     "saving": 85, "status": "saving_found", "pharmacy": "Medline Pharmacy"},
                    {"name": "Glycomet GP2", "selected": "Glycomet GP2", "price": 180, "qty": 1,
                     "saving": 0, "status": "saving_found", "pharmacy": "MedPlus Pharmacy"},
                    {"name": "Rozavel 10", "selected": "Rozavel 10", "price": 150, "qty": 1,
                     "saving": 0, "status": "marginal_saving", "pharmacy": "Wellness Forever Pharmacy"},
                ],
                "original_cost": 472, "optimized_cost": 385, "total_saving": 85,
                "created_at": dt(y2_, m2_, 5, 10, 30), "month": month_str(y2_, m2_),
                "seeded_by_script": True,
            },

            # ── MONTH 1 AGO — Glycomet GP2 also switched to generic (fully optimized) ─
            {
                "user_id": uid,
                "source": "manual",
                "medicines": [
                    {"name": "Telma 40", "selected": "Telmisartan 40mg", "price": 55, "qty": 1,
                     "saving": 85, "status": "saving_found", "pharmacy": "Medline Pharmacy"},
                    {"name": "Glycomet GP2", "selected": "Metformin 500", "price": 42, "qty": 1,
                     "saving": 138, "status": "saving_found", "pharmacy": "Wellness Forever Pharmacy"},
                    {"name": "Rozavel 10", "selected": "Rozavel 10", "price": 150, "qty": 1,
                     "saving": 0, "status": "marginal_saving", "pharmacy": "Wellness Forever Pharmacy"},
                ],
                "original_cost": 472, "optimized_cost": 247, "total_saving": 223,
                "created_at": dt(y1_, m1_, 3, 9, 45), "month": month_str(y1_, m1_),
                "seeded_by_script": True,
            },
        ]

        result = await db.medicine_cost_reports.insert_many(medicine_reports_data)
        print(f"  Inserted {len(result.inserted_ids)} medicine_cost_reports records (pharmacy-aware)")

        # ════════════════════════════════════════════════════════════════════
        # DOCTOR VISITS — 3 months + 1 subscription spanning all 3
        # ════════════════════════════════════════════════════════════════════
        doctor_visits_data = [

            # ── SUBSCRIPTION: Diabetes Management Plan (3 months) ─────────────
            # ₹1500 total ÷ 3 months = ₹500/month
            {
                "user_id": uid,
                "doctor_name": "Dr. Meena Krishnamurthy",
                "visit_type": "subscription",
                "plan_name": "Diabetes Management Plan",
                "total_amount": 1500,
                "months": 3,
                "per_month": 500,
                "start_month": month_str(y3_, m3_),
                "end_month": month_str(y1_, m1_),
                "notes": "Quarterly diabetes + hypertension management package",
                "created_at": dt(y3_, m3_, 1, 9, 0),
                "seeded_by_script": True,
            },

            # ── MONTH 3 AGO: One-time emergency visit ──────────────────────────
            {
                "user_id": uid,
                "doctor_name": "Dr. Rajesh Venkataraman",
                "visit_type": "one_time",
                "plan_name": None,
                "amount": 800,
                "visit_date": dt(y3_, m3_, 18, 11, 0),
                "month": month_str(y3_, m3_),
                "notes": "BP spike — emergency consultation",
                "created_at": dt(y3_, m3_, 18, 11, 30),
                "seeded_by_script": True,
            },

            # ── MONTH 2 AGO: Routine follow-up ──────────────────────────────────
            {
                "user_id": uid,
                "doctor_name": "Dr. Meena Krishnamurthy",
                "visit_type": "one_time",
                "plan_name": None,
                "amount": 500,
                "visit_date": dt(y2_, m2_, 12, 10, 0),
                "month": month_str(y2_, m2_),
                "notes": "Monthly follow-up — outside subscription",
                "created_at": dt(y2_, m2_, 12, 10, 30),
                "seeded_by_script": True,
            },

            # ── MONTH 1 AGO: Specialist visit ───────────────────────────────────
            {
                "user_id": uid,
                "doctor_name": "Dr. Ananya Subramaniam",
                "visit_type": "one_time",
                "plan_name": None,
                "amount": 700,
                "visit_date": dt(y1_, m1_, 10, 14, 0),
                "month": month_str(y1_, m1_),
                "notes": "Endocrinologist — thyroid check",
                "created_at": dt(y1_, m1_, 10, 14, 30),
                "seeded_by_script": True,
            },
        ]

        result = await db.doctor_visits.insert_many(doctor_visits_data)
        print(f"  Inserted {len(result.inserted_ids)} doctor_visits records")

    # ── Create indexes for fast month queries ─────────────────────────────────
    await db.selected_labs.create_index([("user_id", 1), ("month", 1)])
    await db.selected_labs.create_index([("user_id", 1), ("selected_at", -1)])
    await db.medicine_cost_reports.create_index([("user_id", 1), ("month", 1)])
    await db.medicine_cost_reports.create_index([("user_id", 1), ("created_at", -1)])
    await db.doctor_visits.create_index([("user_id", 1), ("month", 1)])
    await db.doctor_visits.create_index([("user_id", 1), ("start_month", 1), ("end_month", 1)])
    await db.spending_summary_cache.create_index([("user_id", 1), ("month", 1)], unique=True)
    print("\nIndexes created")

    # ── Print summary ─────────────────────────────────────────────────────────
    m3_label = f"{MONTH_3_AGO[0]}-{str(MONTH_3_AGO[1]).zfill(2)}"
    m2_label = f"{MONTH_2_AGO[0]}-{str(MONTH_2_AGO[1]).zfill(2)}"
    m1_label = f"{MONTH_1_AGO[0]}-{str(MONTH_1_AGO[1]).zfill(2)}"
    cur_label = f"{cur_year}-{str(cur_month).zfill(2)}"

    print("\n" + "="*60)
    print("SEEDED SPENDING DATA SUMMARY")
    print("="*60)
    for username, uid in user_ids.items():
        labs_count = await db.selected_labs.count_documents({"user_id": uid, "seeded_by_script": True})
        meds_count = await db.medicine_cost_reports.count_documents({"user_id": uid, "seeded_by_script": True})
        docs_count = await db.doctor_visits.count_documents({"user_id": uid, "seeded_by_script": True})
        print(f"\nUser: {username}")
        print(f"  Lab selections:   {labs_count} records")
        print(f"  Medicine reports: {meds_count} records (pharmacy-aware)")
        print(f"  Doctor visits:    {docs_count} records (+ 1 subscription)")

    print(f"\nMonths seeded: {m3_label}, {m2_label}, {m1_label}")
    print(f"Month LEFT EMPTY (add manually): {cur_label}")

    print("\nExpected monthly totals (per user):")
    print(f"  {m3_label}:  Labs ₹1070 + Meds ₹472 + Doctor ₹1300 = ₹2,842")
    print(f"  {m2_label}:  Labs ₹1200 + Meds ₹385 + Doctor ₹1000 = ₹2,585")
    print(f"  {m1_label}:  Labs ₹1020 + Meds ₹247 + Doctor ₹1200 = ₹2,467")

    print("\nPattern detection should show:")
    print("  🔄 HbA1c              — all 3 months (recurring)")
    print("  🔄 Fasting Blood Sugar — all 3 months (recurring)")
    print("  🔄 Telma 40            — all 3 months (recurring)")
    print("  🔄 Glycomet GP2        — all 3 months (recurring)")
    print("  🔄 Rozavel 10          — all 3 months (recurring)")
    print("  🔄 Dr. Meena subscription — all 3 months (recurring)")
    print("  💡 Lipid Profile       — 2/3 months (occasional)")
    print("  💡 Kidney Function     — 1/3 months (one-time)")

    print("\nSaving suggestions should show:")
    print("  💊 Switch Rozavel 10 → cheaper pharmacy for same ingredient+strength")
    print("     (Rozavel 10 stayed at brand price all 3 months — good test case)")

    print(f"\nNow go to the app and manually add lab/medicine data for {cur_label}")
    print("(the current month) via Lab Navigator and Medicine Optimizer.")
    print("\nSeeding complete!")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
