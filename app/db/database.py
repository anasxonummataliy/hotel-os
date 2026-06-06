"""
PostgreSQL-backed database layer.

Public API is intentionally identical to the old InMemoryDB so every
service's main.py only needs to change one import line:

    from app.db.database import db          # new
    # from app.db.memory_db import db       # old

All write operations are wrapped in a session that auto-commits on
success and auto-rolls-back on error.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import select, update

from app.db.engine import get_session
from app.db.models import Booking, Guest, MaintenanceIssue, Order, Room
from app.schemas.enums import RoomStatus, RoomType


# ── Seed data ─────────────────────────────────────────────────────────────────
# Prices based on real Uzbekistan 4-star hotels (USD/night):
# Single (Standard): ~$80 (Ramada Tashkent, Hilton Garden Inn)
# Double: ~$120 (Hyatt Regency Tashkent, Lotte City Hotel)
# Suite (Luxury): ~$250 (Hilton Tashkent City, Intercontinental)
# Accessible: ~$95 (adapted standard rooms)

_ROOM_SEED = [
    # Floor 1
    (1,  "101", 1, "single",      80.0),
    (2,  "102", 1, "single",      80.0),
    (3,  "103", 1, "double",     120.0),
    (4,  "104", 1, "double",     120.0),
    (5,  "105", 1, "suite",      250.0),
    # Floor 2
    (6,  "201", 2, "single",      80.0),
    (7,  "202", 2, "accessible",  95.0),
    (8,  "203", 2, "double",     120.0),
    (9,  "204", 2, "suite",      250.0),
    (10, "205", 2, "double",     120.0),
]


def seed_rooms() -> None:
    """Insert default rooms if the table is empty."""
    with get_session() as s:
        if s.execute(select(Room)).first() is not None:
            return
        for room_id, number, floor, room_type, price in _ROOM_SEED:
            s.add(Room(
                id=room_id,
                number=number,
                floor=floor,
                room_type=room_type,
                status="clean",
                price_per_night=price,
                amenities_json=json.dumps(["WiFi", "TV", "AC"]),
                last_cleaned=datetime.utcnow(),
            ))


# ── RoomProxy — mimics the old Room object API ────────────────────────────────

class RoomProxy:
    """
    Thin wrapper around a Room ORM row so existing service code that
    accesses  room.status, room.number, room.room_type, etc. keeps working.
    """
    __slots__ = (
        "id", "number", "floor", "room_type", "status",
        "price_per_night", "amenities", "last_cleaned", "current_guest_id",
    )

    def __init__(self, row: Room):
        self.id               = row.id
        self.number           = row.number
        self.floor            = row.floor
        self.room_type        = RoomType(row.room_type)
        self.status           = RoomStatus(row.status)
        self.price_per_night  = row.price_per_night
        self.amenities        = row.amenities
        self.last_cleaned     = row.last_cleaned
        self.current_guest_id = row.current_guest_id

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "number":           self.number,
            "floor":            self.floor,
            "room_type":        self.room_type.value,
            "status":           self.status.value,
            "price_per_night":  self.price_per_night,
            "amenities":        self.amenities,
            "last_cleaned":     self.last_cleaned.isoformat() if self.last_cleaned else None,
            "current_guest_id": self.current_guest_id,
        }


# ── Database class ────────────────────────────────────────────────────────────

class Database:
    """
    Thread-safe PostgreSQL database layer (Singleton).
    Exposes the same method signatures as the old InMemoryDB.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
        return cls._instance

    # ── Room ──────────────────────────────────────────────────────────────────

    def get_room(self, room_id: int) -> Optional[RoomProxy]:
        with get_session() as s:
            row = s.get(Room, room_id)
            return RoomProxy(row) if row else None

    def get_available_rooms(self, room_type: RoomType) -> List[RoomProxy]:
        with get_session() as s:
            rows = s.execute(
                select(Room).where(
                    Room.room_type == room_type.value,
                    Room.status == RoomStatus.CLEAN.value,
                )
            ).scalars().all()
            return [RoomProxy(r) for r in rows]

    def get_all_rooms(self) -> List[RoomProxy]:
        with get_session() as s:
            rows = s.execute(select(Room).order_by(Room.id)).scalars().all()
            return [RoomProxy(r) for r in rows]

    def update_room_status(self, room_id: int, status: RoomStatus) -> bool:
        with get_session() as s:
            row = s.get(Room, room_id)
            if not row:
                return False
            row.status = status.value
            return True

    def update_room_guest(self, room_id: int, guest_id: Optional[int]) -> bool:
        with get_session() as s:
            row = s.get(Room, room_id)
            if not row:
                return False
            row.current_guest_id = guest_id
            return True

    def update_room_last_cleaned(self, room_id: int) -> bool:
        with get_session() as s:
            row = s.get(Room, room_id)
            if not row:
                return False
            row.last_cleaned = datetime.utcnow()
            return True

    # ── Guest ─────────────────────────────────────────────────────────────────

    def create_guest(self, data: dict) -> dict:
        with get_session() as s:
            guest = Guest(
                first_name=data["first_name"],
                last_name=data["last_name"],
                email=data["email"],
                phone=data.get("phone"),
                passport_id=data.get("passport_id"),
                created_at=datetime.utcnow(),
            )
            s.add(guest)
            s.flush()   # get auto-generated id before commit
            return guest.to_dict()

    def get_guest(self, guest_id: int) -> Optional[dict]:
        with get_session() as s:
            row = s.get(Guest, guest_id)
            return row.to_dict() if row else None

    def get_all_guests(self) -> List[dict]:
        with get_session() as s:
            rows = s.execute(select(Guest).order_by(Guest.id)).scalars().all()
            return [r.to_dict() for r in rows]

    # ── Booking ───────────────────────────────────────────────────────────────

    def create_booking(self, data: dict) -> dict:
        with get_session() as s:
            booking = Booking(
                guest_id=data["guest_id"],
                room_id=data["room_id"],
                check_in_date=data["check_in_date"],
                check_out_date=data["check_out_date"],
                status=data.get("status", "checked_in"),
                special_requests=data.get("special_requests"),
                total_cost=data.get("total_cost", 0.0),
                created_at=datetime.utcnow(),
            )
            s.add(booking)
            s.flush()
            return booking.to_dict()

    def get_booking(self, booking_id: int) -> Optional[dict]:
        with get_session() as s:
            row = s.get(Booking, booking_id)
            return row.to_dict() if row else None

    def get_all_bookings(self) -> List[dict]:
        with get_session() as s:
            rows = s.execute(select(Booking).order_by(Booking.id.desc())).scalars().all()
            return [r.to_dict() for r in rows]

    def get_bookings_by_guest(self, guest_id: int) -> List[dict]:
        with get_session() as s:
            rows = s.execute(
                select(Booking).where(Booking.guest_id == guest_id).order_by(Booking.id.desc())
            ).scalars().all()
            return [r.to_dict() for r in rows]

    def update_booking(self, booking_id: int, data: dict) -> bool:
        with get_session() as s:
            row = s.get(Booking, booking_id)
            if not row:
                return False
            for k, v in data.items():
                setattr(row, k, v)
            return True

    # ── Order ─────────────────────────────────────────────────────────────────

    def create_order(self, data: dict) -> dict:
        with get_session() as s:
            # status may be an enum or string
            status_val = data["status"]
            if hasattr(status_val, "value"):
                status_val = status_val.value

            items = data.get("items", [])
            # items may be list of dicts or list of pydantic models
            items_serialisable = []
            for item in items:
                items_serialisable.append(item if isinstance(item, dict) else item.model_dump())

            order = Order(
                room_id=data["room_id"],
                items_json=json.dumps(items_serialisable),
                status=status_val,
                total_amount=data.get("total_amount", 0.0),
                special_requests=data.get("special_requests"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            s.add(order)
            s.flush()
            return order.to_dict()

    def get_order(self, order_id: int) -> Optional[dict]:
        with get_session() as s:
            row = s.get(Order, order_id)
            return row.to_dict() if row else None

    def get_orders_by_room(self, room_id: int) -> List[dict]:
        with get_session() as s:
            rows = s.execute(
                select(Order).where(Order.room_id == room_id).order_by(Order.id)
            ).scalars().all()
            return [r.to_dict() for r in rows]

    def update_order(self, order_id: int, data: dict) -> bool:
        with get_session() as s:
            row = s.get(Order, order_id)
            if not row:
                return False
            for k, v in data.items():
                # normalise enum → string
                val = v.value if hasattr(v, "value") else v
                setattr(row, k, val)
            return True

    # ── Maintenance ───────────────────────────────────────────────────────────

    def create_maintenance_issue(self, data: dict) -> dict:
        with get_session() as s:
            priority_val = data["priority"]
            if hasattr(priority_val, "value"):
                priority_val = priority_val.value

            issue = MaintenanceIssue(
                room_id=data["room_id"],
                description=data["description"],
                priority=priority_val,
                status=data.get("status", "reported"),
                reported_by=data.get("reported_by", "unknown"),
                resolved_at=data.get("resolved_at"),
                created_at=datetime.utcnow(),
            )
            s.add(issue)
            s.flush()
            return issue.to_dict()

    def get_maintenance_issue(self, issue_id: int) -> Optional[dict]:
        with get_session() as s:
            row = s.get(MaintenanceIssue, issue_id)
            return row.to_dict() if row else None

    def get_maintenance_issues_by_room(self, room_id: int) -> List[dict]:
        with get_session() as s:
            rows = s.execute(
                select(MaintenanceIssue).where(MaintenanceIssue.room_id == room_id)
            ).scalars().all()
            return [r.to_dict() for r in rows]

    def update_maintenance_issue(self, issue_id: int, data: dict) -> bool:
        with get_session() as s:
            row = s.get(MaintenanceIssue, issue_id)
            if not row:
                return False
            for k, v in data.items():
                setattr(row, k, v)
            return True


# ── Singleton instance ────────────────────────────────────────────────────────
db = Database()
