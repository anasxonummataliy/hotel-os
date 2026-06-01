"""Reception Service — API router."""
import logging
import threading
from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Header

from app.core.config import settings
from app.core.broker import make_publisher
from app.db.memory_db import db
from app.schemas.enums import RoomType, RoomStatus
from app.schemas.events import EVENT_CHECK_IN_COMPLETED, EVENT_ROOM_VACATED

from services.reception.schemas import (
    CheckInRequest, CheckInResponse,
    CheckOutRequest, CheckOutResponse, BillDetails,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Per-service broker instance (created once when the module is imported)
publisher = make_publisher()

# Lock for the allocate+reserve atomic operation (prevents double-booking TS-06)
_allocation_lock = threading.Lock()


# ── Helpers ───────────────────────────────────────────────────────────────────

def verify_token(x_token: str = Header(...)) -> str:
    if x_token != settings.API_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API token")
    return x_token


# ── Room Allocation Algorithm ─────────────────────────────────────────────────

class RoomAllocationAlgorithm:
    """
    Room allocation algorithm (LO1).

    Selection criteria (in order):
      1. Room type must match the request
      2. Status must be CLEAN
      3. Among candidates: prefer the one cleaned longest ago (fairest rotation)
      4. Apply floor preference as a secondary filter if provided
    """

    @staticmethod
    def allocate_room(room_type: RoomType, preferred_floor: int = None) -> dict:
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


# ── Billing Engine ────────────────────────────────────────────────────────────

class BillingEngine:
    """Billing calculation engine (LO1)."""

    @staticmethod
    def calculate_bill(
        check_in_date,
        check_out_date,
        price_per_night: float,
        room_service_charges: float = 0.0,
        additional_charges: float = 0.0,
    ) -> BillDetails:
        if isinstance(check_in_date, str):
            check_in_date = datetime.fromisoformat(check_in_date).date()
        if isinstance(check_out_date, str):
            check_out_date = datetime.fromisoformat(check_out_date).date()

        num_nights = max((check_out_date - check_in_date).days, 1)
        room_charges = price_per_night * num_nights
        total = room_charges + room_service_charges + additional_charges

        return BillDetails(
            nightly_rate=price_per_night,
            num_nights=num_nights,
            room_service_charges=room_service_charges,
            additional_charges=additional_charges,
            total_bill=total,
        )


# ── Guest Endpoints ───────────────────────────────────────────────────────────

@router.post("/guests", status_code=status.HTTP_201_CREATED)
async def create_guest(data: dict, x_token: str = Header(...)):
    """Register a new guest. Returns guest with auto-assigned ID."""
    verify_token(x_token)
    required = {"first_name", "last_name", "email"}
    missing = required - data.keys()
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing fields: {missing}")
    return db.create_guest(data)


@router.get("/guests/{guest_id}", status_code=status.HTTP_200_OK)
async def get_guest(guest_id: int, x_token: str = Header(...)):
    verify_token(x_token)
    guest = db.get_guest(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    return guest


# ── Check-in / Check-out ──────────────────────────────────────────────────────

@router.post("/check-in", response_model=CheckInResponse, status_code=status.HTTP_200_OK)
async def check_in(request: CheckInRequest, x_token: str = Header(...)):
    """Allocate a room and record the booking."""
    verify_token(x_token)
    try:
        guest = db.get_guest(request.guest_id)
        if not guest:
            raise HTTPException(status_code=404, detail="Guest not found")

        room_info = RoomAllocationAlgorithm.allocate_room(
            RoomType(request.room_type), request.preferred_floor
        )

        booking_data = {
            "guest_id": request.guest_id,
            "room_id": room_info["room_id"],
            "check_in_date": request.check_in_date.isoformat(),
            "check_out_date": request.check_out_date.isoformat(),
            "status": "checked_in",
            "special_requests": request.special_requests,
            "total_cost": 0.0,
        }
        booking = db.create_booking(booking_data)
        db.update_room_guest(room_info["room_id"], request.guest_id)

        publisher.publish(
            event_type=EVENT_CHECK_IN_COMPLETED,
            service="reception",
            data={
                "booking_id": booking["id"],
                "room_id": room_info["room_id"],
                "guest_id": request.guest_id,
            },
        )

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
        logger.error(f"Check-in error: {e}")
        raise HTTPException(status_code=500, detail=f"Check-in failed: {str(e)}")


@router.post("/check-out", response_model=CheckOutResponse, status_code=status.HTTP_200_OK)
async def check_out(request: CheckOutRequest, x_token: str = Header(...)):
    """Calculate bill, mark room dirty, fire room_vacated event."""
    verify_token(x_token)
    try:
        booking = db.get_booking(request.booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")

        room = db.get_room(request.room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        orders = db.get_orders_by_room(request.room_id)
        room_service_charges = sum(
            o.get("total_amount", 0)
            for o in orders
            if (o["status"].value if hasattr(o["status"], "value") else o["status"]) == "delivered"
        )

        bill = BillingEngine.calculate_bill(
            booking["check_in_date"],
            booking["check_out_date"],
            room.price_per_night,
            room_service_charges=room_service_charges,
        )

        db.update_room_status(request.room_id, RoomStatus.DIRTY)
        db.update_room_guest(request.room_id, None)
        db.update_booking(request.booking_id, {"status": "checked_out", "total_cost": bill.total_bill})

        publisher.publish(
            event_type=EVENT_ROOM_VACATED,
            service="reception",
            data={
                "room_id": request.room_id,
                "room_number": room.number,
                "booking_id": request.booking_id,
                "guest_id": booking["guest_id"],
            },
        )

        return CheckOutResponse(
            booking_id=request.booking_id,
            room_id=request.room_id,
            bill=bill,
            status="checked_out",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Check-out error: {e}")
        raise HTTPException(status_code=500, detail=f"Check-out failed: {str(e)}")


# ── Room Endpoints ────────────────────────────────────────────────────────────

@router.get("/rooms", status_code=status.HTTP_200_OK)
async def get_rooms(x_token: str = Header(...)):
    verify_token(x_token)
    return [r.to_dict() for r in db.get_all_rooms()]


@router.get("/rooms/{room_id}", status_code=status.HTTP_200_OK)
async def get_room(room_id: int, x_token: str = Header(...)):
    verify_token(x_token)
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room.to_dict()
