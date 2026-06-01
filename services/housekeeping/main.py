"""
Housekeeping Service — Port 8002
Listens for room_vacated events and manages the cleaning queue.
"""
import logging
import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.broker import make_subscriber
from app.core.config import settings
from app.schemas.events import EVENT_ROOM_VACATED

from .router import router, publisher, handle_room_vacated

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

subscriber = make_subscriber()


async def event_listener_task():
    """Background task: subscribe + listen for broker events."""
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "housekeeping"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.HOUSEKEEPING_SERVICE_PORT)
