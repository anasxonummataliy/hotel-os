"""Maintenance Service — API router."""
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Header

from app.core.config import settings
from app.core.broker import make_publisher
from app.db.memory_db import db
from app.schemas.enums import PriorityLevel
from app.schemas.events import EVENT_MAINTENANCE_UPDATED

from services.maintenance.schemas import MaintenanceIssueCreate, MaintenanceIssueResponse, MaintenanceIssueUpdate

logger = logging.getLogger(__name__)

router = APIRouter()

publisher = make_publisher()


# ── Priority Queue ────────────────────────────────────────────────────────────

class PriorityQueue:
    """
    Maintenance priority queue (LO1).
    Sort order: Critical > High > Normal > Low, then FIFO within same priority.
    """

    PRIORITY_ORDER = {
        PriorityLevel.CRITICAL: 4,
        PriorityLevel.HIGH: 3,
        PriorityLevel.NORMAL: 2,
        PriorityLevel.LOW: 1,
    }

    def __init__(self):
        self.queue = []
        self._counter = 0

    def add_issue(self, issue: dict) -> dict:
        self._counter += 1
        priority = issue["priority"]
        if not isinstance(priority, PriorityLevel):
            priority = PriorityLevel(priority)
        issue["_priority_value"] = self.PRIORITY_ORDER.get(priority, 0)
        issue["_fifo_seq"] = self._counter
        self.queue.append(issue)
        self._sort()
        return issue

    def _sort(self):
        self.queue.sort(key=lambda x: (-x.get("_priority_value", 0), x.get("_fifo_seq", 0)))

    def get_queue(self):
        return self.queue

    def remove_issue(self, issue_id: int):
        self.queue = [i for i in self.queue if i["id"] != issue_id]


priority_queue = PriorityQueue()


# ── Helpers ───────────────────────────────────────────────────────────────────

def verify_token(x_token: str = Header(...)):
    if x_token != settings.API_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API token")


# ── Endpoints — fixed paths BEFORE parameterised paths ───────────────────────

@router.get("/maintenance/queue", status_code=status.HTTP_200_OK)
async def get_maintenance_queue(x_token: str = Header(...)):
    """Return priority-sorted maintenance queue."""
    verify_token(x_token)
    items = []
    for idx, issue in enumerate(priority_queue.get_queue(), 1):
        priority_val = issue.get("priority")
        items.append({
            "position": idx,
            "issue_id": issue["id"],
            "room_id": issue["room_id"],
            "priority": priority_val.value if isinstance(priority_val, PriorityLevel) else priority_val,
            "status": issue["status"],
            "description": issue.get("description", ""),
        })
    return {"queue": items}


@router.post("/maintenance/report", response_model=MaintenanceIssueResponse, status_code=status.HTTP_201_CREATED)
async def report_maintenance(issue: MaintenanceIssueCreate, x_token: str = Header(...)):
    verify_token(x_token)
    if not db.get_room(issue.room_id):
        raise HTTPException(status_code=404, detail="Room not found")

    issue_data = {
        "room_id": issue.room_id,
        "description": issue.description,
        "priority": issue.priority,
        "status": "reported",
        "reported_by": issue.reported_by or "unknown",
        "resolved_at": None,
    }
    created = db.create_maintenance_issue(issue_data)
    priority_queue.add_issue(created)

    publisher.publish(EVENT_MAINTENANCE_UPDATED, "maintenance", {
        "issue_id": created["id"],
        "room_id": issue.room_id,
        "priority": issue.priority.value,
        "status": "reported",
    })
    logger.info(f"Maintenance issue {created['id']} reported for room {issue.room_id} [{issue.priority.value}]")
    return MaintenanceIssueResponse(**created)


@router.get("/maintenance/room/{room_id}", status_code=status.HTTP_200_OK)
async def get_room_maintenance(room_id: int, x_token: str = Header(...)):
    verify_token(x_token)
    if not db.get_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "issues": db.get_maintenance_issues_by_room(room_id)}


@router.get("/maintenance/{issue_id}", response_model=MaintenanceIssueResponse)
async def get_maintenance_issue(issue_id: int, x_token: str = Header(...)):
    verify_token(x_token)
    issue = db.get_maintenance_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return MaintenanceIssueResponse(**issue)


@router.post("/maintenance/{issue_id}/resolve", response_model=MaintenanceIssueResponse)
async def resolve_maintenance(issue_id: int, update: MaintenanceIssueUpdate, x_token: str = Header(...)):
    verify_token(x_token)
    issue = db.get_maintenance_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    db.update_maintenance_issue(issue_id, {
        "status": "resolved",
        "resolution_notes": update.resolution_notes or "Resolved",
        "resolved_at": datetime.utcnow().isoformat(),
    })
    priority_queue.remove_issue(issue_id)

    publisher.publish(EVENT_MAINTENANCE_UPDATED, "maintenance", {
        "issue_id": issue_id,
        "room_id": issue["room_id"],
        "status": "resolved",
    })
    return MaintenanceIssueResponse(**db.get_maintenance_issue(issue_id))
