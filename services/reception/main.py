"""
Reception Service — Port 8001
Handles guest check-in, check-out, room inventory and guest management.
Auth: JWT Bearer token (roles: admin, reception)
"""
import logging
import threading
from datetime import datetime, date
from contextlib import asynccontextmanager
from typing import Optional, List

import uvicorn
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from app.core.config import settings
from app.core.auth import get_current_user, require_roles, any_authenticated, staff_or_admin
from app.core.broker import make_publisher
from app.db.database import db, seed_rooms
from app.schemas.enums import RoomType, RoomStatus
from app.schemas.events import EVENT_CHECK_IN_COMPLETED, EVENT_ROOM_VACATED

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher = make_publisher()
_allocation_lock = threading.Lock()

# ── Schemas ───────────────────────────────────────────────────────────────────

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

class GuestCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None

# ── Business logic ────────────────────────────────────────────────────────────

def allocate_room(room_type: RoomType, preferred_floor: Optional[int] = None) -> dict:
    with _allocation_lock:
        available = db.get_available_rooms(room_type)
        if not available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"No clean {room_type.value} rooms available",
            )
        sorted_rooms = sorted(available, key=lambda r: r.last_cleaned)
        if preferred_floor:
            floor_rooms = [r for r in sorted_rooms if r.floor == preferred_floor]
            selected = floor_rooms[0] if floor_rooms else sorted_rooms[0]
        else:
            selected = sorted_rooms[0]
        db.update_room_status(selected.id, RoomStatus.OCCUPIED)
    return {
        "room_id": selected.id,
        "room_number": selected.number,
        "floor": selected.floor,
        "type": selected.room_type.value,
        "price_per_night": selected.price_per_night,
    }

def calculate_bill(check_in, check_out, price_per_night, room_svc=0.0, extra=0.0) -> BillDetails:
    if isinstance(check_in, str):
        check_in = datetime.fromisoformat(check_in).date()
    if isinstance(check_out, str):
        check_out = datetime.fromisoformat(check_out).date()
    nights = max((check_out - check_in).days, 1)
    total = price_per_night * nights + room_svc + extra
    return BillDetails(
        nightly_rate=price_per_night, num_nights=nights,
        room_service_charges=room_svc, additional_charges=extra, total_bill=total,
    )

# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_rooms()
    logger.info("Reception Service starting on port %d…", settings.RECEPTION_SERVICE_PORT)
    yield
    publisher.close()
    logger.info("Reception Service shut down.")

app = FastAPI(title="Reception Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Guest endpoints ───────────────────────────────────────────────────────────

@app.post("/guests", status_code=201)
async def create_guest(
    data: GuestCreate,
    current: dict = Depends(require_roles("admin", "reception")),
):
    return db.create_guest(data.model_dump())

@app.get("/guests")
async def list_guests(current: dict = Depends(require_roles("admin", "reception"))):
    return db.get_all_guests()

@app.get("/guests/{guest_id}")
async def get_guest(guest_id: int, current: dict = Depends(staff_or_admin)):
    # guests can only see their own record
    if current["role"] == "guest" and current.get("guest_id") != guest_id:
        raise HTTPException(status_code=403, detail="Access denied")
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    return guest

# ── Booking endpoints ─────────────────────────────────────────────────────────

@app.get("/bookings")
async def list_bookings(current: dict = Depends(require_roles("admin", "reception"))):
    return db.get_all_bookings()

@app.get("/bookings/my")
async def my_bookings(current: dict = Depends(get_current_user)):
    """Guest sees their own bookings."""
    guest_id = current.get("guest_id")
    if not guest_id:
        raise HTTPException(status_code=404, detail="No guest profile linked to this account")
    return db.get_bookings_by_guest(guest_id)

# ── Check-in / Check-out ──────────────────────────────────────────────────────

@app.post("/check-in", response_model=CheckInResponse)
async def check_in(
    request: CheckInRequest,
    current: dict = Depends(require_roles("admin", "reception")),
):
    if not db.get_guest(request.guest_id):
        raise HTTPException(status_code=404, detail="Guest not found")
    try:
        room_info = allocate_room(RoomType(request.room_type), request.preferred_floor)
        booking = db.create_booking({
            "guest_id": request.guest_id,
            "room_id": room_info["room_id"],
            "check_in_date": request.check_in_date.isoformat(),
            "check_out_date": request.check_out_date.isoformat(),
            "status": "checked_in",
            "special_requests": request.special_requests,
            "total_cost": 0.0,
        })
        db.update_room_guest(room_info["room_id"], request.guest_id)
        publisher.publish(EVENT_CHECK_IN_COMPLETED, "reception", {
            "booking_id": booking["id"], "room_id": room_info["room_id"], "guest_id": request.guest_id,
        })
        return CheckInResponse(
            booking_id=booking["id"], room_id=room_info["room_id"],
            room_number=room_info["room_number"], guest_id=request.guest_id,
            check_in_date=request.check_in_date, check_out_date=request.check_out_date,
            status="checked_in", price_per_night=room_info["price_per_night"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Check-in error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/check-out", response_model=CheckOutResponse)
async def check_out(
    request: CheckOutRequest,
    current: dict = Depends(require_roles("admin", "reception")),
):
    booking = db.get_booking(request.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    room = db.get_room(request.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    orders = db.get_orders_by_room(request.room_id)
    room_svc = sum(
        o.get("total_amount", 0) for o in orders
        if (o["status"].value if hasattr(o["status"], "value") else o["status"]) == "delivered"
    )
    bill = calculate_bill(booking["check_in_date"], booking["check_out_date"], room.price_per_night, room_svc)
    db.update_room_status(request.room_id, RoomStatus.DIRTY)
    db.update_room_guest(request.room_id, None)
    db.update_booking(request.booking_id, {"status": "checked_out", "total_cost": bill.total_bill})
    publisher.publish(EVENT_ROOM_VACATED, "reception", {
        "room_id": request.room_id, "room_number": room.number,
        "booking_id": request.booking_id, "guest_id": booking["guest_id"],
    })
    return CheckOutResponse(booking_id=request.booking_id, room_id=request.room_id, bill=bill, status="checked_out")

# ── Room endpoints ────────────────────────────────────────────────────────────

@app.get("/rooms")
async def get_rooms(current: dict = Depends(any_authenticated)):
    return [r.to_dict() for r in db.get_all_rooms()]

@app.get("/rooms/{room_id}")
async def get_room(room_id: int, current: dict = Depends(any_authenticated)):
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room.to_dict()

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "reception"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.RECEPTION_SERVICE_PORT)
