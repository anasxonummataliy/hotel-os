"""
WebSocket Gateway — Port 8005
Broadcasts all hotel events to connected browser clients in real time.
"""
import logging
import asyncio
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.broker import make_publisher, make_subscriber
from app.core.config import settings
from app.schemas.events import (
    EVENT_ROOM_VACATED, EVENT_ROOM_CLEANED, EVENT_ORDER_STATUS_CHANGED,
    EVENT_MAINTENANCE_UPDATED, EVENT_CHECK_IN_COMPLETED, EVENT_CHECK_OUT_COMPLETED,
)

from .router import router, event_handler, set_event_loop, manager, _frontend_dir

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher = make_publisher()
subscriber = make_subscriber()


async def subscribe_to_events():
    for event_type in [
        EVENT_ROOM_VACATED, EVENT_ROOM_CLEANED, EVENT_ORDER_STATUS_CHANGED,
        EVENT_MAINTENANCE_UPDATED, EVENT_CHECK_IN_COMPLETED, EVENT_CHECK_OUT_COMPLETED,
    ]:
        subscriber.subscribe(event_type, event_handler)
    await subscriber.listen()


@asynccontextmanager
async def lifespan(app: FastAPI):
    set_event_loop(asyncio.get_running_loop())
    logger.info("WebSocket Gateway starting on port %d…", settings.WEBSOCKET_GATEWAY_PORT)
    task = asyncio.create_task(subscribe_to_events())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    subscriber.close()
    publisher.close()
    logger.info("WebSocket Gateway shut down.")


app = FastAPI(title="WebSocket Gateway", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static frontend files if the folder exists
if os.path.isdir(_frontend_dir):
    app.mount("/static", StaticFiles(directory=_frontend_dir), name="static")

app.include_router(router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "websocket_gateway",
        "clients": len(manager.active_connections),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.WEBSOCKET_GATEWAY_PORT)
