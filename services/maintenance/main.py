import logging
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.config import settings
from app.core.auth import require_roles, any_authenticated
from app.core.broker import make_publisher
from app.db.database import db
from app.schemas.enums import PriorityLevel
from app.schemas.events import EVENT_MAINTENANCE_UPDATED

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

publisher = make_publisher()


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


class PriorityQueue:
    PRIORITY_ORDER = {
        PriorityLevel.CRITICAL: 4,
        PriorityLevel.HIGH: 3,
        PriorityLevel.NORMAL: 2,
        PriorityLevel.LOW: 1,
    }

    def __init__(self):
        self.queue = []
        self._counter = 0

    def add(self, issue: dict) -> dict:
        self._counter += 1
        p = issue["priority"]
        if not isinstance(p, PriorityLevel):
            p = PriorityLevel(p)
        issue["_pv"] = self.PRIORITY_ORDER.get(p, 0)
        issue["_seq"] = self._counter
        self.queue.append(issue)
        self.queue.sort(key=lambda x: (-x.get("_pv", 0), x.get("_seq", 0)))
        return issue

    def remove(self, issue_id: int):
        self.queue = [i for i in self.queue if i["id"] != issue_id]


priority_queue = PriorityQueue()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Maintenance Service starting on port %d", settings.MAINTENANCE_SERVICE_PORT)
    yield
    publisher.close()


app = FastAPI(title="Maintenance Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/maintenance/queue")
async def get_queue(current: dict = Depends(require_roles("admin", "maintenance", "reception"))):
    items = []
    for idx, issue in enumerate(priority_queue.queue, 1):
        pv = issue.get("priority")
        items.append({
            "position": idx,
            "issue_id": issue["id"],
            "room_id": issue["room_id"],
            "priority": pv.value if isinstance(pv, PriorityLevel) else pv,
            "status": issue["status"],
            "description": issue.get("description", ""),
        })
    return {"queue": items}


@app.post("/maintenance/report", response_model=MaintenanceIssueResponse, status_code=201)
async def report_issue(
    issue: MaintenanceIssueCreate,
    current: dict = Depends(any_authenticated),
):
    if not db.get_room(issue.room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    reported_by = issue.reported_by or current.get("full_name") or "unknown"
    created = db.create_maintenance_issue({
        "room_id": issue.room_id,
        "description": issue.description,
        "priority": issue.priority,
        "status": "reported",
        "reported_by": reported_by,
        "resolved_at": None,
    })
    priority_queue.add(created)
    publisher.publish(EVENT_MAINTENANCE_UPDATED, "maintenance", {
        "issue_id": created["id"], "room_id": issue.room_id,
        "priority": issue.priority.value, "status": "reported",
    })
    return MaintenanceIssueResponse(**created)


@app.get("/maintenance/room/{room_id}")
async def get_room_issues(room_id: int, current: dict = Depends(any_authenticated)):
    if not db.get_room(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "issues": db.get_maintenance_issues_by_room(room_id)}


@app.get("/maintenance/{issue_id}", response_model=MaintenanceIssueResponse)
async def get_issue(issue_id: int, current: dict = Depends(any_authenticated)):
    issue = db.get_maintenance_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return MaintenanceIssueResponse(**issue)


@app.post("/maintenance/{issue_id}/resolve", response_model=MaintenanceIssueResponse)
async def resolve_issue(
    issue_id: int,
    update: MaintenanceIssueUpdate,
    current: dict = Depends(require_roles("admin", "maintenance")),
):
    issue = db.get_maintenance_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    db.update_maintenance_issue(issue_id, {
        "status": "resolved",
        "resolution_notes": update.resolution_notes or "Resolved",
        "resolved_at": datetime.utcnow().isoformat(),
    })
    priority_queue.remove(issue_id)
    publisher.publish(EVENT_MAINTENANCE_UPDATED, "maintenance", {
        "issue_id": issue_id, "room_id": issue["room_id"], "status": "resolved",
    })
    return MaintenanceIssueResponse(**db.get_maintenance_issue(issue_id))


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "maintenance"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.MAINTENANCE_SERVICE_PORT)
