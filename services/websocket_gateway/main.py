import logging
import asyncio
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.auth import get_current_user
from app.core.broker import make_publisher, make_subscriber
from app.db.database import db
from app.schemas.events import (
    EVENT_ROOM_VACATED, EVENT_ROOM_CLEANED, EVENT_ORDER_STATUS_CHANGED,
    EVENT_MAINTENANCE_UPDATED, EVENT_CHECK_IN_COMPLETED, EVENT_CHECK_OUT_COMPLETED,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher  = make_publisher()
subscriber = make_subscriber()

_event_loop: asyncio.AbstractEventLoop = None
_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active = [c for c in self.active if c is not ws]

    async def broadcast(self, data: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def event_handler(event):
    global _event_loop
    if _event_loop is None:
        return
    asyncio.run_coroutine_threadsafe(
        manager.broadcast({
            "event_type": event.event_type,
            "timestamp":  event.timestamp.isoformat(),
            "service":    event.service,
            "data":       event.data,
        }),
        _event_loop,
    )


async def subscribe_to_events():
    for et in [
        EVENT_ROOM_VACATED, EVENT_ROOM_CLEANED, EVENT_ORDER_STATUS_CHANGED,
        EVENT_MAINTENANCE_UPDATED, EVENT_CHECK_IN_COMPLETED, EVENT_CHECK_OUT_COMPLETED,
    ]:
        subscriber.subscribe(et, event_handler)
    await subscriber.listen()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _event_loop
    _event_loop = asyncio.get_running_loop()
    logger.info("WebSocket Gateway starting on port %d", settings.WEBSOCKET_GATEWAY_PORT)
    task = asyncio.create_task(subscribe_to_events())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    subscriber.close()
    publisher.close()


app = FastAPI(title="WebSocket Gateway", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

if os.path.isdir(_frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dir, "assets")), name="assets")


@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    html_path = os.path.join(_frontend_dir, "index.html")
    if os.path.exists(html_path):
        with open(html_path) as f:
            return HTMLResponse(f.read())
    return HTMLResponse("""
    <html><body style="font-family:sans-serif;padding:2rem">
    <h1>🏨 HotelOS Dashboard</h1>
    <p>Frontend not built yet. Run: <code>cd frontend && pnpm install && pnpm build</code></p>
    <p>API docs: 
      <a href="http://localhost:8000/docs">Auth</a> |
      <a href="http://localhost:8001/docs">Reception</a> |
      <a href="http://localhost:8002/docs">Housekeeping</a> |
      <a href="http://localhost:8003/docs">Room Service</a> |
      <a href="http://localhost:8004/docs">Maintenance</a>
    </p>
    </body></html>
    """)


@app.websocket("/ws/dashboard")
async def ws_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        rooms_snapshot = {r.id: r.status.value for r in db.get_all_rooms()}
        await websocket.send_json({
            "event_type": "dashboard_init",
            "timestamp": "",
            "service": "gateway",
            "data": {"rooms": rooms_snapshot},
        })
    except Exception as e:
        logger.error("Init snapshot error: %s", e)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("WS error: %s", e)
        manager.disconnect(websocket)


@app.get("/status")
async def get_status(current: dict = Depends(get_current_user)):
    return {
        "rooms": [r.to_dict() for r in db.get_all_rooms()],
        "clients": len(manager.active),
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "websocket_gateway", "clients": len(manager.active)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.WEBSOCKET_GATEWAY_PORT)
