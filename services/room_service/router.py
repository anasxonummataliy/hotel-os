"""Room Service — API router."""
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Header

from app.core.config import settings
from app.core.broker import make_publisher
from app.db.memory_db import db
from app.schemas.enums import OrderStatus
from app.schemas.events import EVENT_ORDER_STATUS_CHANGED

from services.room_service.schemas import OrderCreate, OrderResponse, OrderUpdate

logger = logging.getLogger(__name__)

router = APIRouter()

publisher = make_publisher()

# Valid status transitions
VALID_TRANSITIONS = {
    OrderStatus.RECEIVED:    [OrderStatus.PREPARING,    OrderStatus.CANCELLED],
    OrderStatus.PREPARING:   [OrderStatus.IN_DELIVERY,  OrderStatus.CANCELLED],
    OrderStatus.IN_DELIVERY: [OrderStatus.DELIVERED,    OrderStatus.CANCELLED],
    OrderStatus.DELIVERED:   [],
    OrderStatus.CANCELLED:   [],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def verify_token(x_token: str = Header(...)):
    if x_token != settings.API_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API token")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(order: OrderCreate, x_token: str = Header(...)):
    verify_token(x_token)
    room = db.get_room(order.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    total_amount = sum(item.price * item.quantity for item in order.items)
    order_data = {
        "room_id": order.room_id,
        "items": [item.model_dump() for item in order.items],
        "status": OrderStatus.RECEIVED,
        "total_amount": total_amount,
        "special_requests": order.special_requests,
        "updated_at": datetime.utcnow().isoformat(),
    }
    created = db.create_order(order_data)
    publisher.publish(EVENT_ORDER_STATUS_CHANGED, "room_service", {
        "order_id": created["id"],
        "room_id": order.room_id,
        "status": OrderStatus.RECEIVED.value,
        "total_amount": total_amount,
    })
    return OrderResponse(**created)


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, x_token: str = Header(...)):
    verify_token(x_token)
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderResponse(**order)


@router.get("/orders/room/{room_id}")
async def get_room_orders(room_id: int, x_token: str = Header(...)):
    verify_token(x_token)
    if not db.get_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "orders": db.get_orders_by_room(room_id)}


@router.put("/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(order_id: int, update: OrderUpdate, x_token: str = Header(...)):
    verify_token(x_token)
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    raw = order["status"]
    current_status = raw if isinstance(raw, OrderStatus) else OrderStatus(raw)
    new_status = update.status

    if new_status not in VALID_TRANSITIONS.get(current_status, []):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition from '{current_status.value}' to '{new_status.value}'",
        )

    db.update_order(order_id, {"status": new_status, "updated_at": datetime.utcnow().isoformat()})
    publisher.publish(EVENT_ORDER_STATUS_CHANGED, "room_service", {
        "order_id": order_id,
        "room_id": order["room_id"],
        "status": new_status.value,
        "total_amount": order["total_amount"],
    })
    return OrderResponse(**db.get_order(order_id))
