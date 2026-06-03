import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from jose import JWTError, jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import select

from app.core.config import settings
from app.db.engine import get_session
from app.db.models import User, Guest

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ph = PasswordHasher()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "guest"


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    return decode_token(token)


def require_roles(*roles: str):
    def _checker(current: dict = Depends(get_current_user)):
        if current.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current
    return _checker


def get_user_by_email(email: str) -> Optional[User]:
    with get_session() as s:
        row = s.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if row:
            s.expunge(row)
        return row


def create_user_in_db(email: str, password: str, full_name: str, role: str) -> dict:
    with get_session() as s:
        if s.execute(select(User).where(User.email == email)).scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already registered")
        guest_id = None
        if role == "guest":
            parts = full_name.strip().split(maxsplit=1)
            guest = Guest(
                first_name=parts[0],
                last_name=parts[1] if len(parts) > 1 else "",
                email=email,
                created_at=datetime.utcnow(),
            )
            s.add(guest)
            s.flush()
            guest_id = guest.id
        user = User(
            email=email,
            password_hash=ph.hash(password),
            full_name=full_name,
            role=role,
            is_active=True,
            guest_id=guest_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        s.add(user)
        s.flush()
        return user.to_dict()


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_session() as s:
        if not s.execute(select(User)).first():
            s.add(User(email="admin@hotel.com", password_hash=ph.hash("admin123"),
                       full_name="System Admin", role="admin", is_active=True,
                       created_at=datetime.utcnow(), updated_at=datetime.utcnow()))
            for email, name, role in [
                ("reception@hotel.com",    "Reception Staff",    "reception"),
                ("housekeeping@hotel.com", "Housekeeping Staff", "housekeeping"),
                ("roomservice@hotel.com",  "Room Service Staff", "room_service"),
                ("maintenance@hotel.com",  "Maintenance Staff",  "maintenance"),
            ]:
                s.add(User(email=email, password_hash=ph.hash("staff123"),
                           full_name=name, role=role, is_active=True,
                           created_at=datetime.utcnow(), updated_at=datetime.utcnow()))
            logger.info("Seeded default accounts")
    logger.info("Auth Service starting on port %d", settings.AUTH_SERVICE_PORT)
    yield


app = FastAPI(title="HotelOS Auth", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/auth/register", status_code=201)
async def register(req: RegisterRequest):
    if req.role != "guest":
        raise HTTPException(status_code=403, detail="Only guests can self-register")
    return {"message": "Registration successful", "user": create_user_in_db(req.email, req.password, req.full_name, req.role)}


@app.post("/auth/register/staff", status_code=201)
async def register_staff(req: RegisterRequest, current: dict = Depends(require_roles("admin"))):
    return {"message": "Staff account created", "user": create_user_in_db(req.email, req.password, req.full_name, req.role)}


@app.post("/auth/login", response_model=LoginResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user_row = get_user_by_email(form.username)
    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    try:
        ph.verify(user_row.password_hash, form.password)
    except VerifyMismatchError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user_row.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    token = create_access_token({
        "sub": str(user_row.id),
        "email": user_row.email,
        "role": user_row.role,
        "full_name": user_row.full_name,
        "guest_id": user_row.guest_id,
    })
    return LoginResponse(access_token=token, user=user_row.to_dict())


@app.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return current


@app.get("/auth/users")
async def list_users(current: dict = Depends(require_roles("admin"))):
    with get_session() as s:
        return [r.to_dict() for r in s.execute(select(User).order_by(User.id)).scalars().all()]


@app.patch("/auth/users/{user_id}/activate")
async def toggle_activate(user_id: int, current: dict = Depends(require_roles("admin"))):
    with get_session() as s:
        user = s.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.is_active = not user.is_active
        return {"id": user.id, "is_active": user.is_active}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "auth"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.AUTH_SERVICE_PORT)
