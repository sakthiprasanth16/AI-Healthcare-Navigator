"""
Seed pharmacies collection with 5 real Chennai pharmacies.
Each pharmacy has:
  - name, area, address, coordinates
  - medicines list with prices (realistic variation from catalog)
  - Not all pharmacies stock all medicines

Run: python seed_pharmacies.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/healthcare_navigator")

PHARMACIES = [
    {
        "name": "Apollo Pharmacy",
        "area": "Anna Nagar",
        "address": "2nd Avenue, Anna Nagar, Chennai - 600040",
        "location": {"type": "Point", "coordinates": [80.2100, 13.0843]},
        "medicines": [
            # Diabetes
            {"name": "Glycomet GP2",        "active_ingredient": "Glipizide + Metformin",    "strength": "2mg/500mg",   "price": 182},
            {"name": "Glycomet SR 500",      "active_ingredient": "Metformin",                "strength": "500mg",       "price": 93},
            {"name": "Janumet 50/500",       "active_ingredient": "Sitagliptin + Metformin",  "strength": "50mg/500mg",  "price": 415},
            {"name": "Amaryl 2",             "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 128},
            {"name": "Metformin 500",        "active_ingredient": "Metformin",                "strength": "500mg",       "price": 44},
            {"name": "Glimepiride 2mg",      "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 58},
            # Hypertension
            {"name": "Telma 40",             "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 142},
            {"name": "Telsar 40",            "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 118},
            {"name": "Amlokind 5",           "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 108},
            {"name": "Repace 50",            "active_ingredient": "Losartan",                 "strength": "50mg",        "price": 132},
            {"name": "Telmikind 40",         "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 83},
            {"name": "Amlodipine 5mg",       "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 53},
            {"name": "Telmisartan 40mg",     "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 58},
            # Cholesterol
            {"name": "Rosuvas 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 172},
            {"name": "Rozavel 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 152},
            {"name": "Atorlip 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 118},
            {"name": "Storvas 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 108},
            {"name": "Rosuvastatin 10mg",    "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 73},
            {"name": "Atorvastatin 10mg",    "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 53},
            # Hypothyroidism
            {"name": "Thyronorm 50",         "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 83},
            {"name": "Eltroxin 50",          "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 73},
            {"name": "Levothyroxine 50mcg",  "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 38},
            # Asthma
            {"name": "Asthalin",             "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 92},
            {"name": "Budecort",             "active_ingredient": "Budesonide",               "strength": "200mcg",      "price": 182},
            {"name": "Foracort",             "active_ingredient": "Formoterol + Budesonide",  "strength": "6/200mcg",    "price": 315},
            {"name": "Duolin",               "active_ingredient": "Ipratropium + Salbutamol", "strength": "0.5mg/2.5mg", "price": 142},
            {"name": "Salbutamol 100mcg",    "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 53},
        ]
    },
    {
        "name": "MedPlus Pharmacy",
        "area": "T Nagar",
        "address": "Pondy Bazaar, T Nagar, Chennai - 600017",
        "location": {"type": "Point", "coordinates": [80.2280, 13.0450]},
        "medicines": [
            # Diabetes
            {"name": "Glycomet GP2",        "active_ingredient": "Glipizide + Metformin",    "strength": "2mg/500mg",   "price": 180},
            {"name": "Glycomet SR 500",      "active_ingredient": "Metformin",                "strength": "500mg",       "price": 92},
            {"name": "Amaryl 2",             "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 125},
            {"name": "Metformin 500",        "active_ingredient": "Metformin",                "strength": "500mg",       "price": 43},
            {"name": "Glimepiride 2mg",      "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 57},
            # Hypertension
            {"name": "Telma 40",             "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 140},
            {"name": "Telsar 40",            "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 115},
            {"name": "Amlokind 5",           "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 105},
            {"name": "Telmikind 40",         "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 80},
            {"name": "Amlodipine 5mg",       "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 52},
            {"name": "Telmisartan 40mg",     "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 57},
            # Cholesterol
            {"name": "Rosuvas 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 170},
            {"name": "Atorlip 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 115},
            {"name": "Storvas 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 105},
            {"name": "Rosuvastatin 10mg",    "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 72},
            {"name": "Atorvastatin 10mg",    "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 52},
            # Hypothyroidism
            {"name": "Thyronorm 50",         "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 82},
            {"name": "Levothyroxine 50mcg",  "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 37},
            # Asthma
            {"name": "Asthalin",             "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 90},
            {"name": "Budecort",             "active_ingredient": "Budesonide",               "strength": "200mcg",      "price": 180},
            {"name": "Salbutamol 100mcg",    "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 52},
            {"name": "Duolin",               "active_ingredient": "Ipratropium + Salbutamol", "strength": "0.5mg/2.5mg", "price": 140},
        ]
    },
    {
        "name": "Medline Pharmacy",
        "area": "Velachery",
        "address": "100 Feet Road, Velachery, Chennai - 600042",
        "location": {"type": "Point", "coordinates": [80.2210, 12.9750]},
        "medicines": [
            # Diabetes
            {"name": "Glycomet GP2",        "active_ingredient": "Glipizide + Metformin",    "strength": "2mg/500mg",   "price": 178},
            {"name": "Janumet 50/500",       "active_ingredient": "Sitagliptin + Metformin",  "strength": "50mg/500mg",  "price": 410},
            {"name": "Metformin 500",        "active_ingredient": "Metformin",                "strength": "500mg",       "price": 42},
            {"name": "Glimepiride 2mg",      "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 56},
            {"name": "Amaryl 2",             "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 122},
            # Hypertension
            {"name": "Telma 40",             "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 138},
            {"name": "Telmikind 40",         "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 78},
            {"name": "Amlodipine 5mg",       "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 50},
            {"name": "Telmisartan 40mg",     "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 55},
            {"name": "Repace 50",            "active_ingredient": "Losartan",                 "strength": "50mg",        "price": 130},
            # Cholesterol
            {"name": "Rozavel 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 150},
            {"name": "Storvas 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 103},
            {"name": "Rosuvastatin 10mg",    "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 70},
            {"name": "Atorvastatin 10mg",    "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 50},
            # Hypothyroidism
            {"name": "Thyronorm 50",         "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 80},
            {"name": "Eltroxin 50",          "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 70},
            {"name": "Levothyroxine 50mcg",  "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 36},
            # Asthma
            {"name": "Asthalin",             "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 88},
            {"name": "Foracort",             "active_ingredient": "Formoterol + Budesonide",  "strength": "6/200mcg",    "price": 310},
            {"name": "Salbutamol 100mcg",    "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 50},
        ]
    },
    {
        "name": "Vijaya Medical & General Stores",
        "area": "Adyar",
        "address": "LB Road, Adyar, Chennai - 600020",
        "location": {"type": "Point", "coordinates": [80.2567, 13.0067]},
        "medicines": [
            # Diabetes
            {"name": "Glycomet GP2",        "active_ingredient": "Glipizide + Metformin",    "strength": "2mg/500mg",   "price": 183},
            {"name": "Glycomet SR 500",      "active_ingredient": "Metformin",                "strength": "500mg",       "price": 94},
            {"name": "Metformin 500",        "active_ingredient": "Metformin",                "strength": "500mg",       "price": 43},
            {"name": "Amaryl 2",             "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 127},
            {"name": "Glimepiride 2mg",      "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 57},
            # Hypertension
            {"name": "Telma 40",             "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 143},
            {"name": "Amlokind 5",           "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 107},
            {"name": "Repace 50",            "active_ingredient": "Losartan",                 "strength": "50mg",        "price": 133},
            {"name": "Telmikind 40",         "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 82},
            {"name": "Amlodipine 5mg",       "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 52},
            {"name": "Telmisartan 40mg",     "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 58},
            {"name": "Telsar 40",            "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 117},
            # Cholesterol
            {"name": "Rosuvas 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 173},
            {"name": "Atorlip 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 117},
            {"name": "Rosuvastatin 10mg",    "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 72},
            {"name": "Atorvastatin 10mg",    "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 52},
            # Hypothyroidism
            {"name": "Thyronorm 50",         "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 83},
            {"name": "Eltroxin 50",          "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 72},
            {"name": "Levothyroxine 50mcg",  "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 37},
            # Asthma
            {"name": "Budecort",             "active_ingredient": "Budesonide",               "strength": "200mcg",      "price": 183},
            {"name": "Foracort",             "active_ingredient": "Formoterol + Budesonide",  "strength": "6/200mcg",    "price": 318},
            {"name": "Duolin",               "active_ingredient": "Ipratropium + Salbutamol", "strength": "0.5mg/2.5mg", "price": 142},
            {"name": "Salbutamol 100mcg",    "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 52},
        ]
    },
    {
        "name": "Wellness Forever Pharmacy",
        "area": "OMR",
        "address": "Sholinganallur, OMR, Chennai - 600119",
        "location": {"type": "Point", "coordinates": [80.2275, 12.9010]},
        "medicines": [
            # Diabetes
            {"name": "Glycomet GP2",        "active_ingredient": "Glipizide + Metformin",    "strength": "2mg/500mg",   "price": 179},
            {"name": "Janumet 50/500",       "active_ingredient": "Sitagliptin + Metformin",  "strength": "50mg/500mg",  "price": 408},
            {"name": "Metformin 500",        "active_ingredient": "Metformin",                "strength": "500mg",       "price": 42},
            {"name": "Glimepiride 2mg",      "active_ingredient": "Glimepiride",              "strength": "2mg",         "price": 55},
            {"name": "Glycomet SR 500",      "active_ingredient": "Metformin",                "strength": "500mg",       "price": 90},
            # Hypertension
            {"name": "Telma 40",             "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 139},
            {"name": "Telmikind 40",         "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 79},
            {"name": "Amlodipine 5mg",       "active_ingredient": "Amlodipine",               "strength": "5mg",         "price": 50},
            {"name": "Telmisartan 40mg",     "active_ingredient": "Telmisartan",              "strength": "40mg",        "price": 55},
            {"name": "Repace 50",            "active_ingredient": "Losartan",                 "strength": "50mg",        "price": 130},
            # Cholesterol
            {"name": "Rosuvas 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 171},
            {"name": "Rozavel 10",           "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 150},
            {"name": "Storvas 10",           "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 103},
            {"name": "Rosuvastatin 10mg",    "active_ingredient": "Rosuvastatin",             "strength": "10mg",        "price": 70},
            {"name": "Atorvastatin 10mg",    "active_ingredient": "Atorvastatin",             "strength": "10mg",        "price": 50},
            # Hypothyroidism
            {"name": "Thyronorm 50",         "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 81},
            {"name": "Levothyroxine 50mcg",  "active_ingredient": "Levothyroxine",            "strength": "50mcg",       "price": 36},
            # Asthma
            {"name": "Asthalin",             "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 89},
            {"name": "Budecort",             "active_ingredient": "Budesonide",               "strength": "200mcg",      "price": 181},
            {"name": "Foracort",             "active_ingredient": "Formoterol + Budesonide",  "strength": "6/200mcg",    "price": 312},
            {"name": "Salbutamol 100mcg",    "active_ingredient": "Salbutamol",               "strength": "100mcg",      "price": 50},
        ]
    },
]


async def seed():
    mc = AsyncIOMotorClient(MONGODB_URI)
    db = mc.healthcare_navigator

    await db.pharmacies.delete_many({})
    result = await db.pharmacies.insert_many(PHARMACIES)
    print(f"Inserted {len(result.inserted_ids)} pharmacies")

    # Index on name for fast lookup
    await db.pharmacies.create_index("name")
    await db.pharmacies.create_index("area")
    print("Created indexes on name and area")

    mc.close()
    print("\nPharmacy seeding complete!")
    print("Each pharmacy has realistic price variation.")
    print("Not all pharmacies stock all medicines — realistic.")


if __name__ == "__main__":
    asyncio.run(seed())
