from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from typing import Optional

client: Optional[AsyncIOMotorClient] = None
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client.healthcare_navigator
    # Geospatial indexes
    await db.labs.create_index([("location", "2dsphere")])
    await db.user_locations.create_index([("location", "2dsphere")])
    print("Connected to MongoDB")


async def close_db():
    global client
    if client:
        client.close()
        print("Closed MongoDB connection")


def get_db():
    return db
