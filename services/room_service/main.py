import logging
from datetime import datetime
from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.config import settings
from app.core.auth import require_roles, any_authenticated, get_current_user
from app.core.broker import make_publisher
from app.db.database import db
from app.schemas.enums import OrderStatus
from app.schemas.events import EVENT_ORDER_STATUS_CHANGED

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher = make_publisher()


class OrderItem(BaseModel):
    name: str
    quantity: int
    price: float


class OrderCreate(BaseModel):
    room_id: int
    items: List[OrderItem]
    special_requests: Optional[str] = None


class OrderUpdate(BaseModel):
    status: OrderStatus


class OrderResponse(BaseModel):
    id: int
    room_id: int
    items: List[dict]
    status: str  # keep as string for flexibility; DB stores strings
    total_amount: float
    special_requests: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None

    model_config = {"populate_by_name": True}


VALID_TRANSITIONS = {
    OrderStatus.RECEIVED:    [OrderStatus.PREPARING,   OrderStatus.CANCELLED],
    OrderStatus.PREPARING:   [OrderStatus.IN_DELIVERY, OrderStatus.CANCELLED],
    OrderStatus.IN_DELIVERY: [OrderStatus.DELIVERED,   OrderStatus.CANCELLED],
    OrderStatus.DELIVERED:   [],
    OrderStatus.CANCELLED:   [],
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Room Service starting on port %d", settings.ROOM_SERVICE_PORT)
    yield
    publisher.close()


app = FastAPI(title="Room Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/orders", response_model=OrderResponse, status_code=201)
async def create_order(order: OrderCreate, current: dict = Depends(any_authenticated)):
    if not db.get_room(order.room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    total = sum(i.price * i.quantity for i in order.items)
    created = db.create_order({
        "room_id": order.room_id,
        "items": [i.model_dump() for i in order.items],
        "status": OrderStatus.RECEIVED,
        "total_amount": total,
        "special_requests": order.special_requests,
        "updated_at": datetime.now().isoformat(),
    })
    publisher.publish(EVENT_ORDER_STATUS_CHANGED, "room_service", {
        "order_id": created["id"], "room_id": order.room_id,
        "status": OrderStatus.RECEIVED.value, "total_amount": total,
    })
    return OrderResponse(**created)


@app.get("/orders")
async def get_all_orders(
    current: dict = Depends(require_roles("admin", "room_service", "reception")),
):
    """Return all orders — used by kitchen display and dashboard."""
    from sqlalchemy import select as _select
    from app.db.engine import get_session as _gs
    from app.db.models import Order as _Order
    with _gs() as s:
        rows = s.execute(_select(_Order).order_by(_Order.id.desc())).scalars().all()
        return [r.to_dict() for r in rows]


@app.get("/orders/room/{room_id}")
async def get_room_orders(room_id: int, current: dict = Depends(any_authenticated)):
    if current["role"] == "guest":
        guest_id = current.get("guest_id")
        room = db.get_room(room_id)
        if not room or room.current_guest_id != guest_id:
            raise HTTPException(status_code=403, detail="Access denied")
    if not db.get_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "orders": db.get_orders_by_room(room_id)}


@app.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, current: dict = Depends(any_authenticated)):
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse(**order)


@app.put("/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: int,
    update: OrderUpdate,
    current: dict = Depends(require_roles("admin", "room_service")),
):
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    raw = order["status"]
    try:
        current_status = raw if isinstance(raw, OrderStatus) else OrderStatus(raw)
    except ValueError:
        raise HTTPException(status_code=409, detail=f"Unknown current status: '{raw}'")
    if update.status not in VALID_TRANSITIONS.get(current_status, []):
        raise HTTPException(status_code=409, detail=f"Cannot transition '{current_status.value}' → '{update.status.value}'")
    db.update_order(order_id, {"status": update.status, "updated_at": datetime.now().isoformat()})
    publisher.publish(EVENT_ORDER_STATUS_CHANGED, "room_service", {
        "order_id": order_id, "room_id": order["room_id"],
        "status": update.status.value, "total_amount": order["total_amount"],
    })
    return OrderResponse(**db.get_order(order_id))


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "room_service"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.ROOM_SERVICE_PORT)
