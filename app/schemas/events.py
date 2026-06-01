"""Event schemas and constants for Hotel OS."""
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel

# Event type constants
EVENT_ROOM_VACATED = "room_vacated"
EVENT_ROOM_CLEANED = "room_cleaned"
EVENT_ORDER_STATUS_CHANGED = "order_status_changed"
EVENT_MAINTENANCE_UPDATED = "maintenance_updated"
EVENT_CHECK_IN_COMPLETED = "check_in_completed"
EVENT_CHECK_OUT_COMPLETED = "check_out_completed"


class HotelEvent(BaseModel):
    """Standard event model for all hotel events."""
    event_type: str
    timestamp: datetime
    service: str
    data: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None
