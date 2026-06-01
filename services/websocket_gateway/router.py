"""WebSocket Gateway — API router (WebSocket + REST endpoints)."""
import logging
import asyncio
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Header
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.memory_db import db

logger = logging.getLogger(__name__)

router = APIRouter()

# Event loop reference captured at startup — needed for thread-safe task scheduling
_event_loop: asyncio.AbstractEventLoop = None

_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")


# ── Connection Manager ────────────────────────────────────────────────────────

class ConnectionManager:
    """Thread-safe WebSocket connection manager."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Dashboard client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Dashboard client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        """Broadcast to all clients; remove any that have disconnected."""
        dead = []
        for ws in list(self.active_connections):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ── Event Handler (called from subscriber thread) ─────────────────────────────

def event_handler(event):
    """
    Sync callback invoked by the Redis subscriber thread.
    Uses run_coroutine_threadsafe to safely schedule the async broadcast.
    """
    global _event_loop
    if _event_loop is None:
        return
    message = {
        "event_type": event.event_type,
        "timestamp": event.timestamp.isoformat(),
        "service": event.service,
        "data": event.data,
    }
    asyncio.run_coroutine_threadsafe(manager.broadcast(message), _event_loop)
    logger.info(f"Forwarded '{event.event_type}' to {len(manager.active_connections)} client(s)")


def set_event_loop(loop: asyncio.AbstractEventLoop):
    global _event_loop
    _event_loop = loop


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def get_dashboard():
    """Serve the real-time operations dashboard."""
    frontend_html = os.path.join(_frontend_dir, "index.html")
    if os.path.exists(frontend_html):
        with open(frontend_html) as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Hotel OS Dashboard</h1><p>Connect via WebSocket at /ws/dashboard</p>")


@router.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time dashboard WebSocket endpoint.
    Sends current state on connect, then streams all hotel events.
    """
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
        logger.error(f"Failed to send init snapshot: {e}")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@router.get("/status")
async def get_status(x_token: str = Header(...)):
    """Return current room/order/maintenance state for dashboard REST polling."""
    if x_token != settings.API_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")
    rooms = [r.to_dict() for r in db.get_all_rooms()]
    return {
        "rooms": rooms,
        "connected_clients": len(manager.active_connections),
    }
