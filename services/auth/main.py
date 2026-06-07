import logging
import random
import string
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends
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
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def _gen_username(first: str, last: str) -> str:
    name = first.lower().strip()
    name = "".join(c for c in name if c.isalnum())
    suffix = "".join(random.choices(string.digits, k=4))
    return f"{name}.{suffix}"


def _gen_password(length: int = 4) -> str:
    return "".join(random.choices(string.digits, k=length))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
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


def get_user_by_login(login: str) -> Optional[User]:
    with get_session() as s:
        row = s.execute(
            select(User).where(
                (User.email == login) | (User.username == login)
            )
        ).scalar_one_or_none()
        if row:
            s.expunge(row)
        return row


class StaffRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "reception"


class GuestRegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    passport_id: Optional[str] = None


class GuestCredentialsResponse(BaseModel):
    guest_id: int
    user_id: int
    full_name: str
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@asynccontextmanager
async def lifespan(app: FastAPI):
    with get_session() as s:
        if not s.execute(select(User)).first():
            s.add(User(
                email="admin@hotel.com",
                username="admin",
                password_hash=ph.hash("admin123"),
                full_name="System Admin",
                role="admin",
                is_active=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            ))
            for email, uname, name, role in [
                ("reception@hotel.com",    "reception",    "Reception Staff",    "reception"),
                ("housekeeping@hotel.com", "housekeeping", "Housekeeping Staff", "housekeeping"),
                ("roomservice@hotel.com",  "roomservice",  "Room Service Staff", "room_service"),
                ("maintenance@hotel.com",  "maintenance",  "Maintenance Staff",  "maintenance"),
            ]:
                s.add(User(
                    email=email,
                    username=uname,
                    password_hash=ph.hash("staff123"),
                    full_name=name,
                    role=role,
                    is_active=True,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                ))
            logger.info("Seeded default accounts")
    logger.info("Auth Service starting on port %d", settings.AUTH_SERVICE_PORT)
    yield


app = FastAPI(title="HotelOS Auth", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.post("/auth/login", response_model=LoginResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user_row = get_user_by_login(form.username)
    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    try:
        ph.verify(user_row.password_hash, form.password)
    except VerifyMismatchError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user_row.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token({
        "sub":       str(user_row.id),
        "email":     user_row.email,
        "username":  user_row.username or user_row.email,
        "role":      user_row.role,
        "full_name": user_row.full_name,
        "guest_id":  user_row.guest_id,
    })
    return LoginResponse(access_token=token, user=user_row.to_dict())


@app.post(
    "/auth/register/guest",
    response_model=GuestCredentialsResponse,
    status_code=201,
)
async def register_guest(
    req: GuestRegisterRequest,
    current: dict = Depends(require_roles("admin", "reception")),
):
    with get_session() as s:
        existing_guest = s.execute(
            select(Guest).where(Guest.email == req.email)
        ).scalar_one_or_none()

        if existing_guest:
            existing_user = s.execute(
                select(User).where(User.guest_id == existing_guest.id)
            ).scalar_one_or_none()
            if existing_user:
                raise HTTPException(
                    status_code=409,
                    detail=f"Guest with email {req.email} already has an account (username: {existing_user.username})",
                )

        guest = existing_guest or Guest(
            first_name=req.first_name,
            last_name=req.last_name,
            email=req.email,
            phone=req.phone,
            passport_id=req.passport_id,
            created_at=datetime.utcnow(),
        )
        if not existing_guest:
            s.add(guest)
            s.flush()

        username = _gen_username(req.first_name, req.last_name)
        password = _gen_password()

        user = User(
            email=req.email,
            username=username,
            password_hash=ph.hash(password),
            full_name=f"{req.first_name} {req.last_name}",
            role="guest",
            is_active=True,
            guest_id=guest.id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        s.add(user)
        s.flush()

        logger.info(
            "Guest registered by %s: %s %s → username=%s",
            current["email"], req.first_name, req.last_name, username,
        )

        return GuestCredentialsResponse(
            guest_id=guest.id,
            user_id=user.id,
            full_name=f"{req.first_name} {req.last_name}",
            username=username,
            password=password,
        )


@app.post("/auth/register/staff", status_code=201)
async def register_staff(
    req: StaffRegisterRequest,
    current: dict = Depends(require_roles("admin")),
):
    with get_session() as s:
        if s.execute(select(User).where(User.email == req.email)).scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already registered")
        user = User(
            email=req.email,
            username=req.email,
            password_hash=ph.hash(req.password),
            full_name=req.full_name,
            role=req.role,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        s.add(user)
        s.flush()
        return {"message": "Staff account created", "user": user.to_dict()}


@app.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return current


@app.get("/auth/users")
async def list_users(current: dict = Depends(require_roles("admin"))):
    with get_session() as s:
        return [
            r.to_dict()
            for r in s.execute(select(User).order_by(User.id)).scalars().all()
        ]


@app.patch("/auth/users/{user_id}/activate")
async def toggle_activate(
    user_id: int,
    current: dict = Depends(require_roles("admin")),
):
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
