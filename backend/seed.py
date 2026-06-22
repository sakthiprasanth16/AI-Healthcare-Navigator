"""
Seed script: inserts 25 sample labs across Chennai into MongoDB.
Run: python seed.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/healthcare_navigator")

LABS = [
    {
        "name": "Apollo Diagnostics",
        "area": "Anna Nagar",
        "address": "2nd Avenue, Anna Nagar, Chennai - 600040",
        "rating": 4.7,
        "location": {"type": "Point", "coordinates": [80.2100, 13.0843]},
        "tests": [
            {"name": "HbA1c", "price": 450},
            {"name": "CBC", "price": 280},
            {"name": "Lipid Profile", "price": 520},
            {"name": "Thyroid Profile", "price": 680},
            {"name": "Fasting Blood Sugar", "price": 120},
            {"name": "Vitamin D", "price": 850},
        ]
    },
    {
        "name": "Vijaya Diagnostic Centre",
        "area": "T Nagar",
        "address": "Usman Road, T Nagar, Chennai - 600017",
        "rating": 4.5,
        "location": {"type": "Point", "coordinates": [80.2341, 13.0418]},
        "tests": [
            {"name": "HbA1c", "price": 390},
            {"name": "CBC", "price": 260},
            {"name": "Lipid Profile", "price": 490},
            {"name": "Thyroid Profile", "price": 620},
            {"name": "Fasting Blood Sugar", "price": 100},
            {"name": "Creatinine", "price": 180},
            {"name": "Liver Function Test", "price": 540},
        ]
    },
    {
        "name": "Dr. Lal PathLabs",
        "area": "Velachery",
        "address": "Velachery Main Road, Velachery, Chennai - 600042",
        "rating": 4.6,
        "location": {"type": "Point", "coordinates": [80.2180, 12.9815]},
        "tests": [
            {"name": "HbA1c", "price": 420},
            {"name": "CBC", "price": 250},
            {"name": "Lipid Profile", "price": 500},
            {"name": "Kidney Function Test", "price": 620},
            {"name": "Thyroid Profile", "price": 650},
            {"name": "Vitamin D", "price": 820},
            {"name": "Fasting Blood Sugar", "price": 110},
        ]
    },
    {
        "name": "SRL Diagnostics",
        "area": "Adyar",
        "address": "LB Road, Adyar, Chennai - 600020",
        "rating": 4.4,
        "location": {"type": "Point", "coordinates": [80.2567, 13.0067]},
        "tests": [
            {"name": "HbA1c", "price": 480},
            {"name": "CBC", "price": 300},
            {"name": "Lipid Profile", "price": 560},
            {"name": "Thyroid Profile", "price": 700},
            {"name": "Liver Function Test", "price": 580},
            {"name": "Creatinine", "price": 200},
        ]
    },
    {
        "name": "Medall Diagnostics",
        "area": "Porur",
        "address": "Trunk Road, Porur, Chennai - 600116",
        "rating": 4.3,
        "location": {"type": "Point", "coordinates": [80.1569, 13.0358]},
        "tests": [
            {"name": "HbA1c", "price": 360},
            {"name": "CBC", "price": 230},
            {"name": "Lipid Profile", "price": 460},
            {"name": "Vitamin D", "price": 790},
            {"name": "Kidney Function Test", "price": 590},
            {"name": "Fasting Blood Sugar", "price": 95},
        ]
    },
    {
        "name": "Thyrocare Technologies",
        "area": "OMR",
        "address": "Sholinganallur, OMR, Chennai - 600119",
        "rating": 4.2,
        "location": {"type": "Point", "coordinates": [80.2275, 12.9010]},
        "tests": [
            {"name": "HbA1c", "price": 340},
            {"name": "Thyroid Profile", "price": 580},
            {"name": "Lipid Profile", "price": 440},
            {"name": "CBC", "price": 220},
            {"name": "Vitamin D", "price": 760},
        ]
    },
    {
        "name": "Neuberg Diagnostics",
        "area": "Perungudi",
        "address": "Perungudi Industrial Estate, Chennai - 600096",
        "rating": 4.5,
        "location": {"type": "Point", "coordinates": [80.2413, 12.9650]},
        "tests": [
            {"name": "HbA1c", "price": 410},
            {"name": "CBC", "price": 270},
            {"name": "Lipid Profile", "price": 510},
            {"name": "Thyroid Profile", "price": 640},
            {"name": "Kidney Function Test", "price": 600},
            {"name": "Creatinine", "price": 185},
            {"name": "Liver Function Test", "price": 560},
        ]
    },
    {
        "name": "Cloudnine Diagnostics",
        "area": "Guindy",
        "address": "Mount Road, Guindy, Chennai - 600032",
        "rating": 4.4,
        "location": {"type": "Point", "coordinates": [80.2098, 13.0067]},
        "tests": [
            {"name": "HbA1c", "price": 470},
            {"name": "CBC", "price": 290},
            {"name": "Fasting Blood Sugar", "price": 115},
            {"name": "Lipid Profile", "price": 530},
            {"name": "Liver Function Test", "price": 550},
        ]
    },
    {
        "name": "Kannan Diagnostics",
        "area": "Tambaram",
        "address": "GST Road, Tambaram, Chennai - 600045",
        "rating": 4.1,
        "location": {"type": "Point", "coordinates": [80.1178, 12.9236]},
        "tests": [
            {"name": "HbA1c", "price": 320},
            {"name": "CBC", "price": 210},
            {"name": "Lipid Profile", "price": 420},
            {"name": "Thyroid Profile", "price": 560},
            {"name": "Fasting Blood Sugar", "price": 90},
            {"name": "Creatinine", "price": 165},
        ]
    },
    {
        "name": "Chromepet Clinical Lab",
        "area": "Chromepet",
        "address": "GST Road, Chromepet, Chennai - 600044",
        "rating": 4.0,
        "location": {"type": "Point", "coordinates": [80.1448, 12.9518]},
        "tests": [
            {"name": "CBC", "price": 200},
            {"name": "HbA1c", "price": 300},
            {"name": "Fasting Blood Sugar", "price": 85},
            {"name": "Lipid Profile", "price": 400},
            {"name": "Creatinine", "price": 160},
        ]
    },
    {
        "name": "Kodambakkam Health Lab",
        "area": "Kodambakkam",
        "address": "Kodambakkam High Road, Chennai - 600024",
        "rating": 4.2,
        "location": {"type": "Point", "coordinates": [80.2232, 13.0524]},
        "tests": [
            {"name": "HbA1c", "price": 380},
            {"name": "CBC", "price": 245},
            {"name": "Thyroid Profile", "price": 600},
            {"name": "Vitamin D", "price": 800},
            {"name": "Fasting Blood Sugar", "price": 105},
        ]
    },
    {
        "name": "Mylapore Diagnostics",
        "area": "Mylapore",
        "address": "Luz Church Road, Mylapore, Chennai - 600004",
        "rating": 4.6,
        "location": {"type": "Point", "coordinates": [80.2686, 13.0338]},
        "tests": [
            {"name": "HbA1c", "price": 430},
            {"name": "CBC", "price": 265},
            {"name": "Lipid Profile", "price": 495},
            {"name": "Thyroid Profile", "price": 660},
            {"name": "Kidney Function Test", "price": 610},
            {"name": "Liver Function Test", "price": 555},
            {"name": "Vitamin D", "price": 830},
        ]
    },
    {
        "name": "HealthFirst Labs",
        "area": "Anna Nagar",
        "address": "3rd Main Road, Anna Nagar West, Chennai - 600040",
        "rating": 4.3,
        "location": {"type": "Point", "coordinates": [80.1980, 13.0901]},
        "tests": [
            {"name": "HbA1c", "price": 400},
            {"name": "CBC", "price": 255},
            {"name": "Fasting Blood Sugar", "price": 108},
            {"name": "Creatinine", "price": 175},
            {"name": "Kidney Function Test", "price": 580},
        ]
    },
    {
        "name": "LifeCare Diagnostics",
        "area": "Velachery",
        "address": "100 Feet Road, Velachery, Chennai - 600042",
        "rating": 4.4,
        "location": {"type": "Point", "coordinates": [80.2210, 12.9750]},
        "tests": [
            {"name": "HbA1c", "price": 440},
            {"name": "Lipid Profile", "price": 515},
            {"name": "Thyroid Profile", "price": 670},
            {"name": "Vitamin D", "price": 840},
            {"name": "CBC", "price": 275},
        ]
    },
    {
        "name": "CityPath Labs",
        "area": "T Nagar",
        "address": "Pondy Bazaar, T Nagar, Chennai - 600017",
        "rating": 4.1,
        "location": {"type": "Point", "coordinates": [80.2280, 13.0450]},
        "tests": [
            {"name": "CBC", "price": 240},
            {"name": "Fasting Blood Sugar", "price": 95},
            {"name": "Creatinine", "price": 170},
            {"name": "Lipid Profile", "price": 475},
            {"name": "HbA1c", "price": 370},
        ]
    },
    {
        "name": "Sunrise Diagnostic Center",
        "area": "OMR",
        "address": "Perungudi, OMR, Chennai - 600096",
        "rating": 4.3,
        "location": {"type": "Point", "coordinates": [80.2320, 12.9520]},
        "tests": [
            {"name": "HbA1c", "price": 395},
            {"name": "CBC", "price": 260},
            {"name": "Lipid Profile", "price": 485},
            {"name": "Kidney Function Test", "price": 595},
            {"name": "Liver Function Test", "price": 545},
        ]
    },
    {
        "name": "Spectrum Lab",
        "area": "Adyar",
        "address": "Gandhi Nagar, Adyar, Chennai - 600020",
        "rating": 4.5,
        "location": {"type": "Point", "coordinates": [80.2490, 13.0015]},
        "tests": [
            {"name": "HbA1c", "price": 460},
            {"name": "Thyroid Profile", "price": 695},
            {"name": "Vitamin D", "price": 865},
            {"name": "CBC", "price": 285},
            {"name": "Creatinine", "price": 195},
        ]
    },
    {
        "name": "Precision Diagnostics",
        "area": "Guindy",
        "address": "St. Thomas Mount, Guindy, Chennai - 600016",
        "rating": 4.2,
        "location": {"type": "Point", "coordinates": [80.2020, 13.0110]},
        "tests": [
            {"name": "HbA1c", "price": 350},
            {"name": "CBC", "price": 225},
            {"name": "Lipid Profile", "price": 445},
            {"name": "Liver Function Test", "price": 530},
            {"name": "Fasting Blood Sugar", "price": 92},
        ]
    },
    {
        "name": "CareMax Labs",
        "area": "Porur",
        "address": "Ramapuram, Porur, Chennai - 600089",
        "rating": 4.0,
        "location": {"type": "Point", "coordinates": [80.1650, 13.0289]},
        "tests": [
            {"name": "HbA1c", "price": 330},
            {"name": "CBC", "price": 215},
            {"name": "Thyroid Profile", "price": 570},
            {"name": "Fasting Blood Sugar", "price": 88},
        ]
    },
    {
        "name": "MedPlus Diagnostics",
        "area": "Tambaram",
        "address": "West Tambaram, Chennai - 600045",
        "rating": 4.1,
        "location": {"type": "Point", "coordinates": [80.1050, 12.9180]},
        "tests": [
            {"name": "CBC", "price": 220},
            {"name": "Fasting Blood Sugar", "price": 88},
            {"name": "HbA1c", "price": 310},
            {"name": "Lipid Profile", "price": 410},
        ]
    },
    {
        "name": "Accord Diagnostics",
        "area": "Chromepet",
        "address": "Pallavaram Road, Chromepet, Chennai - 600044",
        "rating": 4.3,
        "location": {"type": "Point", "coordinates": [80.1380, 12.9580]},
        "tests": [
            {"name": "HbA1c", "price": 355},
            {"name": "Lipid Profile", "price": 450},
            {"name": "Thyroid Profile", "price": 590},
            {"name": "Kidney Function Test", "price": 575},
            {"name": "CBC", "price": 235},
        ]
    },
    {
        "name": "Gem Diagnostics",
        "area": "Mylapore",
        "address": "Dr. Ranga Road, Mylapore, Chennai - 600004",
        "rating": 4.4,
        "location": {"type": "Point", "coordinates": [80.2720, 13.0290]},
        "tests": [
            {"name": "HbA1c", "price": 415},
            {"name": "Thyroid Profile", "price": 640},
            {"name": "Vitamin D", "price": 810},
            {"name": "Liver Function Test", "price": 545},
            {"name": "CBC", "price": 258},
        ]
    },
    {
        "name": "Venkateshwara Labs",
        "area": "Kodambakkam",
        "address": "GN Chetty Road, Kodambakkam, Chennai - 600024",
        "rating": 4.0,
        "location": {"type": "Point", "coordinates": [80.2190, 13.0500]},
        "tests": [
            {"name": "CBC", "price": 235},
            {"name": "Fasting Blood Sugar", "price": 88},
            {"name": "Creatinine", "price": 158},
            {"name": "HbA1c", "price": 345},
        ]
    },
    {
        "name": "Nova Pathology",
        "area": "Perungudi",
        "address": "TIDEL Park Road, Perungudi, Chennai - 600096",
        "rating": 4.6,
        "location": {"type": "Point", "coordinates": [80.2480, 12.9600]},
        "tests": [
            {"name": "HbA1c", "price": 425},
            {"name": "CBC", "price": 268},
            {"name": "Lipid Profile", "price": 505},
            {"name": "Thyroid Profile", "price": 655},
            {"name": "Vitamin D", "price": 825},
            {"name": "Kidney Function Test", "price": 605},
            {"name": "Liver Function Test", "price": 552},
            {"name": "Creatinine", "price": 188},
            {"name": "Fasting Blood Sugar", "price": 112},
        ]
    },
    {
        "name": "BioGen Diagnostics",
        "area": "Adyar",
        "address": "Kasturba Nagar, Adyar, Chennai - 600020",
        "rating": 4.7,
        "location": {"type": "Point", "coordinates": [80.2530, 13.0120]},
        "tests": [
            {"name": "HbA1c", "price": 465},
            {"name": "CBC", "price": 292},
            {"name": "Lipid Profile", "price": 525},
            {"name": "Thyroid Profile", "price": 685},
            {"name": "Vitamin D", "price": 855},
            {"name": "Kidney Function Test", "price": 618},
            {"name": "Liver Function Test", "price": 562},
            {"name": "Creatinine", "price": 192},
        ]
    },
]


async def seed():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client.healthcare_navigator

    # Create geospatial index
    await db.labs.create_index([("location", "2dsphere")])

    # Clear existing labs
    await db.labs.delete_many({})

    result = await db.labs.insert_many(LABS)
    print(f"Inserted {len(result.inserted_ids)} labs")

    client.close()
    print("Seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed())
