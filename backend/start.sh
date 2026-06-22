#!/bin/bash
# Start the MedNav backend

echo "🏥 Starting MedNav Backend..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Copying from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env and add your MONGODB_URI and API keys, then re-run."
    exit 1
fi

# Check if venv exists
if [ ! -d venv ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt -q

# Run seed if labs collection is empty (optional)
echo "🌱 Checking seed data..."
python -c "
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv()
async def check():
    client = AsyncIOMotorClient(os.getenv('MONGODB_URI'))
    db = client.healthcare_navigator
    count = await db.labs.count_documents({})
    client.close()
    return count
count = asyncio.run(check())
if count == 0:
    print('No labs found. Running seed...')
    import subprocess
    subprocess.run(['python', 'seed.py'])
else:
    print(f'Found {count} labs in database. Skipping seed.')
" 2>/dev/null || echo "⚠️  Could not check DB (will proceed anyway)"

# Start server
echo ""
echo "🚀 Starting FastAPI on http://localhost:8000"
echo "📖 API docs: http://localhost:8000/docs"
echo ""
uvicorn app.main:app --reload --port 8000
