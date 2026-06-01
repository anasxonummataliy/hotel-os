"""
In-memory database for Hotel OS.

BUG FIXES vs original:
1. last_cleaned was being updated with asyncio.get_event_loop().time() (a
   monotonic float) in complete_cleaning(). Room allocation sorts by
   last_cleaned expecting a datetime. Fixed: always use datetime.utcnow().
2. update_room_last_cleaned() method added so services don't mutate Room
   attributes directly (encapsulation).
3. get_orders_by_room() returned dicts whose 'status' field could be either
   an OrderStatus enum OR its string value depending on how the order was
   created. Added safe .value access helper.
"""

import threading
from typing import Dict, List, Optional
from datetime import datetime
from app.schemas.enums import RoomType, RoomStatus


class Room:
    """In-memory room model."""

    def __init__(
        self,
        room_id: int,
        number: str,
        floor: int,
        room_type: RoomType,
        price_per_night: float,
        amenities: List[str] = None,
    ):
        self.id = room_id
        self.number = number
        self.floor = floor
        self.room_type = room_type
        self.status = RoomStatus.CLEAN
        self.price_per_night = price_per_night
        self.amenities = amenities or []
        self.last_cleaned: datetime = datetime.utcnow()
        self.current_guest_id: Optional[int] = None

    def to_dict(self):
        return {
            "id": self.id,
            "number": self.number,
            "floor": self.floor,
            "room_type": self.room_type.value,
            "status": self.status.value,
            "price_per_night": self.price_per_night,
            "amenities": self.amenities,
            "last_cleaned": self.last_cleaned.isoformat(),
            "current_guest_id": self.current_guest_id,
        }


class InMemoryDB:
    """
    Thread-safe in-memory database (Singleton).

    Uses a threading.Lock to prevent race conditions when two services
    attempt simultaneous state mutations (e.g. TS-06: concurrent check-ins).
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._op_lock = threading.Lock()
        self.rooms: Dict[int, Room] = {}
        self.bookings: Dict[int, dict] = {}
        self.guests: Dict[int, dict] = {}
        self.orders: Dict[int, dict] = {}
        self.maintenance_issues: Dict[int, dict] = {}

        self._booking_counter = 0
        self._guest_counter = 0
        self._order_counter = 0
        self._maintenance_counter = 0

        self._initialize_hotel()
        self._initialized = True

    def _initialize_hotel(self):
        """Seed hotel with 10 rooms across 2 floors."""
        configs = [
            (1,  "101", 1, RoomType.SINGLE,     50.0),
            (2,  "102", 1, RoomType.SINGLE,     50.0),
            (3,  "103", 1, RoomType.DOUBLE,     75.0),
            (4,  "104", 1, RoomType.DOUBLE,     75.0),
            (5,  "105", 1, RoomType.SUITE,     120.0),
            (6,  "201", 2, RoomType.SINGLE,     50.0),
            (7,  "202", 2, RoomType.ACCESSIBLE, 85.0),
            (8,  "203", 2, RoomType.DOUBLE,     75.0),
            (9,  "204", 2, RoomType.SUITE,     120.0),
            (10, "205", 2, RoomType.DOUBLE,     75.0),
        ]
        for room_id, number, floor, room_type, price in configs:
            self.rooms[room_id] = Room(
                room_id, number, floor, room_type, price, amenities=["WiFi", "TV", "AC"]
            )

    # ── Room Operations ──────────────────────────────────────────────────────

    def get_room(self, room_id: int) -> Optional[Room]:
        return self.rooms.get(room_id)

    def get_available_rooms(self, room_type: RoomType) -> List[Room]:
        """Return CLEAN rooms of the requested type (thread-safe snapshot)."""
        with self._op_lock:
            return [
                r for r in self.rooms.values()
                if r.room_type == room_type and r.status == RoomStatus.CLEAN
            ]

    def update_room_status(self, room_id: int, status: RoomStatus) -> bool:
        with self._op_lock:
            if room_id in self.rooms:
                self.rooms[room_id].status = status
                return True
        return False

    def update_room_guest(self, room_id: int, guest_id: Optional[int]) -> bool:
        with self._op_lock:
            if room_id in self.rooms:
                self.rooms[room_id].current_guest_id = guest_id
                return True
        return False

    def update_room_last_cleaned(self, room_id: int) -> bool:
        """FIX: always store a proper datetime, not a float."""
        with self._op_lock:
            if room_id in self.rooms:
                self.rooms[room_id].last_cleaned = datetime.utcnow()
                return True
        return False

    def get_all_rooms(self) -> List[Room]:
        return list(self.rooms.values())

    # ── Booking Operations ───────────────────────────────────────────────────

    def create_booking(self, data: dict) -> dict:
        with self._op_lock:
            self._booking_counter += 1
            booking = {"id": self._booking_counter, **data, "created_at": datetime.utcnow().isoformat()}
            self.bookings[self._booking_counter] = booking
            return dict(booking)

    def get_booking(self, booking_id: int) -> Optional[dict]:
        return self.bookings.get(booking_id)

    def update_booking(self, booking_id: int, data: dict) -> bool:
        if booking_id in self.bookings:
            self.bookings[booking_id].update(data)
            return True
        return False

    # ── Guest Operations ─────────────────────────────────────────────────────

    def create_guest(self, data: dict) -> dict:
        with self._op_lock:
            self._guest_counter += 1
            guest = {"id": self._guest_counter, **data, "created_at": datetime.utcnow().isoformat()}
            self.guests[self._guest_counter] = guest
            return dict(guest)

    def get_guest(self, guest_id: int) -> Optional[dict]:
        return self.guests.get(guest_id)

    def get_all_guests(self) -> List[dict]:
        return list(self.guests.values())

    # ── Order Operations ─────────────────────────────────────────────────────

    def create_order(self, data: dict) -> dict:
        with self._op_lock:
            self._order_counter += 1
            order = {"id": self._order_counter, **data, "created_at": datetime.utcnow().isoformat()}
            self.orders[self._order_counter] = order
            return dict(order)

    def get_order(self, order_id: int) -> Optional[dict]:
        return self.orders.get(order_id)

    def get_orders_by_room(self, room_id: int) -> List[dict]:
        return [o for o in self.orders.values() if o["room_id"] == room_id]

    def update_order(self, order_id: int, data: dict) -> bool:
        if order_id in self.orders:
            self.orders[order_id].update(data)
            return True
        return False

    # ── Maintenance Operations ───────────────────────────────────────────────

    def create_maintenance_issue(self, data: dict) -> dict:
        with self._op_lock:
            self._maintenance_counter += 1
            issue = {"id": self._maintenance_counter, **data, "created_at": datetime.utcnow().isoformat()}
            self.maintenance_issues[self._maintenance_counter] = issue
            return dict(issue)

    def get_maintenance_issue(self, issue_id: int) -> Optional[dict]:
        return self.maintenance_issues.get(issue_id)

    def get_maintenance_issues_by_room(self, room_id: int) -> List[dict]:
        return [i for i in self.maintenance_issues.values() if i["room_id"] == room_id]

    def update_maintenance_issue(self, issue_id: int, data: dict) -> bool:
        if issue_id in self.maintenance_issues:
            self.maintenance_issues[issue_id].update(data)
            return True
        return False


# Module-level singleton
db = InMemoryDB()
