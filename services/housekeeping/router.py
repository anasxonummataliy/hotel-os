"""Housekeeping Service — API router."""
import logging

from fastapi import APIRouter, HTTPException, status, Header

from app.core.config import settings
from app.core.broker import make_publisher
from app.db.memory_db import db
from app.schemas.enums import RoomStatus
from app.schemas.events import EVENT_ROOM_CLEANED

logger = logging.getLogger(__name__)

router = APIRouter()

publisher = make_publisher()


# ── Cleaning Queue ────────────────────────────────────────────────────────────

class CleaningQueue:
    """Simple priority queue for cleaning tasks (higher value = higher priority)."""

    def __init__(self):
        self.queue = []

    def add_task(self, room_id: int, priority: int = 1):
        if not any(t["room_id"] == room_id for t in self.queue):
            self.queue.append({"room_id": room_id, "priority": priority, "status": "pending"})
            self.queue.sort(key=lambda x: x["priority"], reverse=True)

    def get_next_task(self):
        return self.queue[0] if self.queue else None

    def remove_task(self, room_id: int):
        self.queue = [t for t in self.queue if t["room_id"] != room_id]


cleaning_queue = CleaningQueue()


# ── Helpers ───────────────────────────────────────────────────────────────────

def verify_token(x_token: str = Header(...)):
    if x_token != settings.API_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API token")


def handle_room_vacated(event):
    """Auto-enqueue room for cleaning when reception fires room_vacated."""
    room_id = event.data.get("room_id")
    logger.info(f"room_vacated received — queuing room {room_id} for cleaning")
    cleaning_queue.add_task(room_id)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/clean/start", status_code=status.HTTP_200_OK)
async def start_cleaning(room_id: int, x_token: str = Header(...)):
    """Mark room as CLEANING (must currently be DIRTY)."""
    verify_token(x_token)
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status != RoomStatus.DIRTY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Room {room_id} is '{room.status.value}', expected 'dirty'",
        )
    db.update_room_status(room_id, RoomStatus.CLEANING)
    publisher.publish("cleaning_started", "housekeeping", {"room_id": room_id, "room_number": room.number})
    return {"status": "cleaning_started", "room_id": room_id, "room_number": room.number}


@router.post("/clean/complete", status_code=status.HTTP_200_OK)
async def complete_cleaning(room_id: int, x_token: str = Header(...)):
    """Mark room as CLEAN, record timestamp, fire room_cleaned event."""
    verify_token(x_token)
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status != RoomStatus.CLEANING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Room {room_id} is '{room.status.value}', expected 'cleaning'",
        )

    db.update_room_status(room_id, RoomStatus.CLEAN)
    db.update_room_last_cleaned(room_id)
    cleaning_queue.remove_task(room_id)

    publisher.publish(
        event_type=EVENT_ROOM_CLEANED,
        service="housekeeping",
        data={"room_id": room_id, "room_number": room.number},
    )
    return {"status": "cleaning_completed", "room_id": room_id, "room_number": room.number}


@router.get("/queue", status_code=status.HTTP_200_OK)
async def get_cleaning_queue(x_token: str = Header(...)):
    verify_token(x_token)
    return {"queue": cleaning_queue.queue}
