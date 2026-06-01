"""Guest-related Pydantic schemas."""
from typing import Optional
from pydantic import BaseModel, EmailStr


class GuestCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None


class GuestResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    created_at: str
