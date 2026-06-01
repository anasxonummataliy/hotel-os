"""Maintenance Service — Pydantic schemas."""
from typing import Optional
from pydantic import BaseModel

from app.schemas.enums import PriorityLevel


class MaintenanceIssueCreate(BaseModel):
    room_id: int
    description: str
    priority: PriorityLevel
    reported_by: Optional[str] = None


class MaintenanceIssueUpdate(BaseModel):
    resolution_notes: Optional[str] = None


class MaintenanceIssueResponse(BaseModel):
    id: int
    room_id: int
    description: str
    priority: PriorityLevel
    status: str
    reported_by: str
    resolved_at: Optional[str] = None
    created_at: str
