from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.db.database import connect_db, close_db
from app.api import auth, labs, location
from app.api import medicine_routes
from app.api import pharmacy_routes
from app.api import spending_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="AI Healthcare Cost Navigator",
    description="Lab cost comparison + Medicine cost optimizer + Spending tracker for Chennai",
    version="3.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(labs.router)
app.include_router(location.router)
app.include_router(medicine_routes.router)
app.include_router(pharmacy_routes.router)
app.include_router(spending_routes.router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "AI Healthcare Cost Navigator v3.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
