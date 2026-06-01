"""Housekeeping Service — Pydantic schemas."""
from pydantic import BaseModel


class CleaningTask(BaseModel):
    room_id: int
    priority: int = 1
    status: str = "pending"


class CleaningQueueResponse(BaseModel):
    queue: list
