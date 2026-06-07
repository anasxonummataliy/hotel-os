from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Float, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    email:         Mapped[str]           = mapped_column(String(255), unique=True, nullable=False, index=True)
    username:      Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True, index=True)
    password_hash: Mapped[str]           = mapped_column(String(512), nullable=False)
    full_name:     Mapped[str]           = mapped_column(String(200), nullable=False)
    role:          Mapped[str]           = mapped_column(String(30),  nullable=False, default="guest")
    is_active:     Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)
    guest_id:      Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("guests.id"), nullable=True)
    created_at:    Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now())
    updated_at:    Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    guest: Mapped[Optional["Guest"]] = relationship("Guest", back_populates="user", foreign_keys=[guest_id])

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "email":      self.email,
            "username":   self.username,
            "full_name":  self.full_name,
            "role":       self.role,
            "is_active":  self.is_active,
            "guest_id":   self.guest_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Room(Base):
    __tablename__ = "rooms"

    id:              Mapped[int]      = mapped_column(Integer, primary_key=True)
    number:          Mapped[str]      = mapped_column(String(10), unique=True, nullable=False)
    floor:           Mapped[int]      = mapped_column(Integer, nullable=False)
    room_type:       Mapped[str]      = mapped_column(String(20), nullable=False)
    status:          Mapped[str]      = mapped_column(String(20), nullable=False, default="clean")
    price_per_night: Mapped[float]    = mapped_column(Float, nullable=False)
    amenities_json:  Mapped[str]      = mapped_column(Text, nullable=False, default="[]")
    last_cleaned:    Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    current_guest_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("guests.id"), nullable=True)

    bookings:     Mapped[List["Booking"]]          = relationship("Booking",          back_populates="room", foreign_keys="Booking.room_id")
    orders:       Mapped[List["Order"]]            = relationship("Order",            back_populates="room")
    maint_issues: Mapped[List["MaintenanceIssue"]] = relationship("MaintenanceIssue", back_populates="room")

    @property
    def amenities(self) -> List[str]:
        try:
            return json.loads(self.amenities_json)
        except Exception:
            return []

    @amenities.setter
    def amenities(self, value: List[str]):
        self.amenities_json = json.dumps(value)

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "number":           self.number,
            "floor":            self.floor,
            "room_type":        self.room_type,
            "status":           self.status,
            "price_per_night":  self.price_per_night,
            "amenities":        self.amenities,
            "last_cleaned":     self.last_cleaned.isoformat() if self.last_cleaned else None,
            "current_guest_id": self.current_guest_id,
        }


class Guest(Base):
    __tablename__ = "guests"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    first_name:  Mapped[str]           = mapped_column(String(100), nullable=False)
    last_name:   Mapped[str]           = mapped_column(String(100), nullable=False)
    email:       Mapped[str]           = mapped_column(String(255), unique=True, nullable=False)
    phone:       Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    passport_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    created_at:  Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now())

    bookings: Mapped[List["Booking"]] = relationship("Booking", back_populates="guest", foreign_keys="Booking.guest_id")
    user:     Mapped[Optional["User"]] = relationship("User", back_populates="guest", foreign_keys="User.guest_id")

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "first_name":  self.first_name,
            "last_name":   self.last_name,
            "email":       self.email,
            "phone":       self.phone,
            "passport_id": self.passport_id,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
        }


class Booking(Base):
    __tablename__ = "bookings"

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    guest_id:         Mapped[int]           = mapped_column(Integer, ForeignKey("guests.id"), nullable=False)
    room_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("rooms.id"), nullable=False)
    check_in_date:    Mapped[str]           = mapped_column(String(20), nullable=False)
    check_out_date:   Mapped[str]           = mapped_column(String(20), nullable=False)
    status:           Mapped[str]           = mapped_column(String(30), nullable=False, default="checked_in")
    special_requests: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_cost:       Mapped[float]         = mapped_column(Float, nullable=False, default=0.0)
    created_at:       Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now())

    guest: Mapped["Guest"] = relationship("Guest", back_populates="bookings", foreign_keys=[guest_id])
    room:  Mapped["Room"]  = relationship("Room",  back_populates="bookings", foreign_keys=[room_id])

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "guest_id":         self.guest_id,
            "room_id":          self.room_id,
            "check_in_date":    self.check_in_date,
            "check_out_date":   self.check_out_date,
            "status":           self.status,
            "special_requests": self.special_requests,
            "total_cost":       self.total_cost,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }


class Order(Base):
    __tablename__ = "orders"

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("rooms.id"), nullable=False)
    items_json:       Mapped[str]           = mapped_column(Text, nullable=False, default="[]")
    status:           Mapped[str]           = mapped_column(String(30), nullable=False, default="received")
    total_amount:     Mapped[float]         = mapped_column(Float, nullable=False, default=0.0)
    special_requests: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at:       Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now())
    updated_at:       Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    room: Mapped["Room"] = relationship("Room", back_populates="orders")

    @property
    def items(self) -> list:
        try:
            return json.loads(self.items_json)
        except Exception:
            return []

    @items.setter
    def items(self, value: list):
        self.items_json = json.dumps(value)

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "room_id":          self.room_id,
            "items":            self.items,
            "status":           self.status,
            "total_amount":     self.total_amount,
            "special_requests": self.special_requests,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
            "updated_at":       self.updated_at.isoformat() if self.updated_at else None,
        }


class MaintenanceIssue(Base):
    __tablename__ = "maintenance_issues"

    id:               Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("rooms.id"), nullable=False)
    description:      Mapped[str]           = mapped_column(Text, nullable=False)
    priority:         Mapped[str]           = mapped_column(String(20), nullable=False, default="normal")
    status:           Mapped[str]           = mapped_column(String(30), nullable=False, default="reported")
    reported_by:      Mapped[str]           = mapped_column(String(100), nullable=False, default="unknown")
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at:      Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at:       Mapped[datetime]      = mapped_column(DateTime, nullable=False, default=func.now())

    room: Mapped["Room"] = relationship("Room", back_populates="maint_issues")

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "room_id":          self.room_id,
            "description":      self.description,
            "priority":         self.priority,
            "status":           self.status,
            "reported_by":      self.reported_by,
            "resolution_notes": self.resolution_notes,
            "resolved_at":      self.resolved_at,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
        }
