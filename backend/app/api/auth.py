from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta
from app.schemas.schemas import UserSignup, UserLogin, Token
from app.core.security import get_password_hash, verify_password, create_access_token, decode_token
from app.db.database import get_db
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    db = get_db()
    user = await db.users.find_one({"username": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/signup", response_model=Token)
async def signup(data: UserSignup):
    db = get_db()
    existing = await db.users.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user_doc = {
        "name": data.name,
        "age": data.age,
        "username": data.username,
        "hashed_password": get_password_hash(data.password),
        "patient_type": data.patient_type,
        "created_at": datetime.utcnow(),
        "last_login": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)

    token = create_access_token({"sub": data.username})
    return Token(
        access_token=token,
        token_type="bearer",
        user={
            "id": str(result.inserted_id),
            "name": data.name,
            "username": data.username,
            "patient_type": data.patient_type,
            "age": data.age,
            "last_login": datetime.utcnow().isoformat()
        }
    )


@router.post("/login", response_model=Token)
async def login(data: UserLogin):
    db = get_db()

    # Demo login
    if data.username == "demo" and data.password == "demo123":
        demo_user = await db.users.find_one({"username": "demo"})
        if not demo_user:
            demo_doc = {
                "name": "Demo User",
                "age": 35,
                "username": "demo",
                "hashed_password": get_password_hash("demo123"),
                "patient_type": "Type 2 Diabetes",
                "created_at": datetime.utcnow(),
                "last_login": datetime.utcnow()
            }
            result = await db.users.insert_one(demo_doc)
            demo_user = {**demo_doc, "_id": result.inserted_id}

        await db.users.update_one({"username": "demo"}, {"$set": {"last_login": datetime.utcnow()}})
        token = create_access_token({"sub": "demo"})
        return Token(
            access_token=token,
            token_type="bearer",
            user={
                "id": str(demo_user["_id"]),
                "name": demo_user["name"],
                "username": "demo",
                "patient_type": demo_user["patient_type"],
                "age": demo_user["age"],
                "last_login": datetime.utcnow().isoformat()
            }
        )

    user = await db.users.find_one({"username": data.username})
    if not user or not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.utcnow()}})
    token = create_access_token({"sub": data.username})
    return Token(
        access_token=token,
        token_type="bearer",
        user={
            "id": str(user["_id"]),
            "name": user["name"],
            "username": user["username"],
            "patient_type": user["patient_type"],
            "age": user["age"],
            "last_login": datetime.utcnow().isoformat()
        }
    )


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return {
        "id": str(current_user["_id"]),
        "name": current_user["name"],
        "username": current_user["username"],
        "patient_type": current_user["patient_type"],
        "age": current_user["age"],
        "last_login": current_user.get("last_login", datetime.utcnow()).isoformat()
    }
