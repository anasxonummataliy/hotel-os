import logging
import threading
import httpx
from datetime import datetime, date
from contextlib import asynccontextmanager
from typing import Optional, List

import uvicorn
from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from app.core.config import settings
from app.core.auth import get_current_user, require_roles, any_authenticated, staff_or_admin
from app.core.broker import make_publisher
from app.db.database import db, seed_rooms
from app.schemas.enums import RoomType, RoomStatus
from app.schemas.events import EVENT_CHECK_IN_COMPLETED, EVENT_ROOM_VACATED, EVENT_CHECK_OUT_COMPLETED

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher = make_publisher()
_allocation_lock = threading.Lock()

AUTH_BASE = f"http://localhost:{settings.AUTH_SERVICE_PORT}"


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


class NoRoomAvailableResponse(BaseModel):
    detail: str
    requested_type: str
    available_types: list[str]
    suggestion: str


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


def allocate_room(room_type: RoomType, preferred_floor: Optional[int] = None) -> dict:
    with _allocation_lock:
        available = db.get_available_rooms(room_type)
        if not available:
            # TS-07: find which types DO have clean rooms and suggest them
            available_types = []
            for rt in RoomType:
                if rt != room_type and db.get_available_rooms(rt):
                    available_types.append(rt.value)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "detail": f"No clean {room_type.value} rooms available",
                    "requested_type": room_type.value,
                    "available_types": available_types,
                    "suggestion": (
                        f"Consider: {available_types[0]}" if available_types
                        else "All room types are currently occupied. Please add to waiting list."
                    ),
                },
            )
        # TS-01: sort by last_cleaned ascending (longest since cleaned = first priority)
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_rooms()
    logger.info("Reception Service starting on port %d…", settings.RECEPTION_SERVICE_PORT)
    yield
    publisher.close()
    logger.info("Reception Service shut down.")


app = FastAPI(title="Reception Service", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/guests/register", response_model=GuestCredentialsResponse, status_code=201)
async def register_guest(
    req: GuestRegisterRequest,
    request: Request,
    current: dict = Depends(require_roles("admin", "reception")),
):
    auth_token = request.headers.get("authorization", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{AUTH_BASE}/auth/register/guest",
                json={
                    "first_name": req.first_name,
                    "last_name":  req.last_name,
                    "email":      req.email,
                    "phone":      req.phone,
                    "passport_id": req.passport_id,
                },
                headers={"Authorization": auth_token},
            )
        if resp.status_code == 409:
            raise HTTPException(status_code=409, detail=resp.json().get("detail", "Already exists"))
        resp.raise_for_status()
        data = resp.json()
        return GuestCredentialsResponse(**data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Guest registration proxy error: %s", e)
        raise HTTPException(status_code=503, detail="Auth service unavailable")


@app.post("/guests", status_code=201)
async def create_guest_legacy(
    data: GuestRegisterRequest,
    current: dict = Depends(require_roles("admin", "reception")),
):
    return db.create_guest(data.model_dump())


@app.get("/guests")
async def list_guests(current: dict = Depends(require_roles("admin", "reception"))):
    return db.get_all_guests()


@app.get("/guests/{guest_id}")
async def get_guest(guest_id: int, current: dict = Depends(staff_or_admin)):
    if current["role"] == "guest" and current.get("guest_id") != guest_id:
        raise HTTPException(status_code=403, detail="Access denied")
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    return guest


@app.get("/bookings")
async def list_bookings(current: dict = Depends(require_roles("admin", "reception"))):
    return db.get_all_bookings()


@app.get("/bookings/my")
async def my_bookings(current: dict = Depends(get_current_user)):
    guest_id = current.get("guest_id")
    if not guest_id:
        raise HTTPException(status_code=404, detail="No guest profile linked to this account")
    return db.get_bookings_by_guest(guest_id)


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
            "guest_id":        request.guest_id,
            "room_id":         room_info["room_id"],
            "check_in_date":   request.check_in_date.isoformat(),
            "check_out_date":  request.check_out_date.isoformat(),
            "status":          "checked_in",
            "special_requests": request.special_requests,
            "total_cost":      0.0,
        })
        db.update_room_guest(room_info["room_id"], request.guest_id)
        publisher.publish(EVENT_CHECK_IN_COMPLETED, "reception", {
            "booking_id": booking["id"],
            "room_id":    room_info["room_id"],
            "guest_id":   request.guest_id,
        })
        return CheckInResponse(
            booking_id=booking["id"],
            room_id=room_info["room_id"],
            room_number=room_info["room_number"],
            guest_id=request.guest_id,
            check_in_date=request.check_in_date,
            check_out_date=request.check_out_date,
            status="checked_in",
            price_per_night=room_info["price_per_night"],
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
        if str(o.get("status", "")).replace("OrderStatus.", "") == "delivered"
    )
    bill = calculate_bill(
        booking["check_in_date"], booking["check_out_date"],
        room.price_per_night, room_svc,
    )
    db.update_room_status(request.room_id, RoomStatus.DIRTY)
    db.update_room_guest(request.room_id, None)
    db.update_booking(request.booking_id, {
        "status": "checked_out", "total_cost": bill.total_bill,
    })
    publisher.publish(EVENT_ROOM_VACATED, "reception", {
        "room_id":    request.room_id,
        "room_number": room.number,
        "booking_id": request.booking_id,
        "guest_id":   booking["guest_id"],
    })
    publisher.publish(EVENT_CHECK_OUT_COMPLETED, "reception", {
        "booking_id":  request.booking_id,
        "room_id":     request.room_id,
        "room_number": room.number,
        "guest_id":    booking["guest_id"],
        "total_bill":  bill.total_bill,
    })
    return CheckOutResponse(
        booking_id=request.booking_id,
        room_id=request.room_id,
        bill=bill,
        status="checked_out",
    )


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
