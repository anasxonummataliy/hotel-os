import logging
import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.broker import make_publisher, make_subscriber
from app.core.auth import require_roles, staff_or_admin
from app.db.database import db
from app.schemas.enums import RoomStatus
from app.schemas.events import EVENT_ROOM_VACATED, EVENT_ROOM_CLEANED

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher = make_publisher()
subscriber = make_subscriber()


class CleaningQueue:
    def __init__(self):
        self.queue = []

    def add(self, room_id: int, priority: int = 1):
        if not any(t["room_id"] == room_id for t in self.queue):
            self.queue.append({"room_id": room_id, "priority": priority, "status": "pending"})
            self.queue.sort(key=lambda x: x["priority"], reverse=True)

    def remove(self, room_id: int):
        self.queue = [t for t in self.queue if t["room_id"] != room_id]


cleaning_queue = CleaningQueue()


def handle_room_vacated(event):
    room_id = event.data.get("room_id")
    logger.info("room_vacated → queuing room %s for cleaning", room_id)
    cleaning_queue.add(room_id)


async def event_listener_task():
    subscriber.subscribe(EVENT_ROOM_VACATED, handle_room_vacated)
    await subscriber.listen()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Housekeeping Service starting on port %d…", settings.HOUSEKEEPING_SERVICE_PORT)
    task = asyncio.create_task(event_listener_task())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    subscriber.close()
    publisher.close()
    logger.info("Housekeeping Service shut down.")


app = FastAPI(title="Housekeeping Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/clean/start")
async def start_cleaning(room_id: int, current: dict = Depends(require_roles("admin", "housekeeping"))):
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status != RoomStatus.DIRTY:
        raise HTTPException(status_code=409, detail=f"Room is '{room.status.value}', expected 'dirty'")
    db.update_room_status(room_id, RoomStatus.CLEANING)
    publisher.publish("cleaning_started", "housekeeping", {"room_id": room_id, "room_number": room.number})
    return {"status": "cleaning_started", "room_id": room_id, "room_number": room.number}


@app.post("/clean/complete")
async def complete_cleaning(room_id: int, current: dict = Depends(require_roles("admin", "housekeeping"))):
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status != RoomStatus.CLEANING:
        raise HTTPException(status_code=409, detail=f"Room is '{room.status.value}', expected 'cleaning'")
    db.update_room_status(room_id, RoomStatus.CLEAN)
    db.update_room_last_cleaned(room_id)
    cleaning_queue.remove(room_id)
    publisher.publish(EVENT_ROOM_CLEANED, "housekeeping", {"room_id": room_id, "room_number": room.number})
    return {"status": "cleaning_completed", "room_id": room_id, "room_number": room.number}


@app.get("/queue")
async def get_queue(current: dict = Depends(require_roles("admin", "housekeeping"))):
    return {"queue": cleaning_queue.queue}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "housekeeping"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.HOUSEKEEPING_SERVICE_PORT)
