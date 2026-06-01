"""Enums for Hotel OS application."""
from enum import Enum


class RoomType(str, Enum):
    SINGLE = "single"
    DOUBLE = "double"
    SUITE = "suite"
    ACCESSIBLE = "accessible"


class RoomStatus(str, Enum):
    CLEAN = "clean"
    OCCUPIED = "occupied"
    CLEANING = "cleaning"
    MAINTENANCE = "maintenance"
    DIRTY = "dirty"


class PriorityLevel(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class OrderStatus(str, Enum):
    RECEIVED = "received"
    PREPARING = "preparing"
    IN_DELIVERY = "in_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
