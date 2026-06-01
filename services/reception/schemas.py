"""Reception Service — Pydantic schemas (booking & guest)."""
from datetime import date
from typing import Optional
from pydantic import BaseModel, EmailStr


# ── Guest ─────────────────────────────────────────────────────────────────────

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


# ── Booking ───────────────────────────────────────────────────────────────────

class CheckInRequest(BaseModel):
    guest_id: int
    room_type: str
    check_in_date: date
    check_out_date: date
    preferred_floor: Optional[int] = None
    special_requests: Optional[str] = None


class CheckInResponse(BaseModel):
    booking_id: int
    room_id: int
    room_number: str
    guest_id: int
    check_in_date: date
    check_out_date: date
    status: str
    price_per_night: float


class CheckOutRequest(BaseModel):
    booking_id: int
    room_id: int


class BillDetails(BaseModel):
    nightly_rate: float
    num_nights: int
    room_service_charges: float
    additional_charges: float
    total_bill: float


class CheckOutResponse(BaseModel):
    booking_id: int
    room_id: int
    bill: BillDetails
    status: str
