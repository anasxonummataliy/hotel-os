"""Room Service — Pydantic schemas (food/beverage orders)."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from app.schemas.enums import OrderStatus


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
    status: OrderStatus
    total_amount: float
    special_requests: Optional[str] = None
    created_at: str
    updated_at: str
