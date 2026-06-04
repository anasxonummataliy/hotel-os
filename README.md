# 🏨 HotelOS — Property Management System

A microservices-based Hotel Property Management System built with Python (FastAPI), PostgreSQL, Redis Pub/Sub, and WebSocket real-time dashboard.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                    │
│              index.html + script.js + style.css          │
│           WebSocket client  ←→  REST API calls           │
└──────────────────┬──────────────────────────────────────┘
                   │
    ┌──────────────▼──────────────┐
    │   WebSocket Gateway :8005   │  ← Real-time event broadcast
    └──────────────┬──────────────┘
                   │ Redis Pub/Sub
    ┌──────────────▼──────────────────────────────────────┐
    │              Redis Message Broker                    │
    │         (hotel:check_in_completed, etc.)             │
    └─┬──────────┬──────────┬──────────┬─────────────────┘
      │          │          │          │
  ┌───▼───┐ ┌───▼───┐ ┌────▼──┐ ┌────▼──────┐ ┌────────┐
  │ Auth  │ │Recept.│ │ House │ │Room Serv. │ │Maint.  │
  │ :8000 │ │ :8001 │ │ :8002 │ │  :8003    │ │ :8004  │
  └───┬───┘ └───┬───┘ └────┬──┘ └────┬──────┘ └────┬───┘
      │          │          │          │              │
      └──────────┴──────────┴──────────┴──────────────┘
                            │
                    ┌───────▼────────┐
                    │   PostgreSQL   │
                    │   (hotel_os)   │
                    └────────────────┘
```

### Services

| Service | Port | Responsibility |
|---------|------|----------------|
| Auth | 8000 | JWT login, user/guest registration, role management |
| Reception | 8001 | Check-in/out, room allocation, guest & booking management |
| Housekeeping | 8002 | Cleaning queue, dirty→cleaning→clean status transitions |
| Room Service | 8003 | Food & beverage orders, status advancement workflow |
| Maintenance | 8004 | Issue reporting, priority queue (CRITICAL > HIGH > NORMAL > LOW) |
| WebSocket Gateway | 8005 | Real-time event broadcast to dashboard |

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | ≥ 3.11 | [python.org](https://python.org) |
| PostgreSQL | ≥ 14 | [postgresql.org](https://postgresql.org) |
| Redis | ≥ 7 | [redis.io](https://redis.io) |

---

### Step 1 — Clone & enter the project

```bash
git clone <repo-url>
cd hotelos
```

### Step 2 — Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows
```

### Step 3 — Install dependencies

```bash
pip install -r requirements.txt
```

### Step 4 — Set up PostgreSQL

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE hotel_os;"
```

### Step 5 — Configure environment (optional)

Create a `.env` file in the project root to override defaults:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/hotel_os
REDIS_HOST=localhost
REDIS_PORT=6379
SECRET_KEY=change-this-in-production
DEBUG=false
```

> **Default DATABASE_URL** assumes user `postgres`, password `postgres`, port `5432`.  
> Change as needed for your local setup.

### Step 6 — Create database tables

```bash
python3 - << 'EOF'
from app.db.engine import engine
from app.db.models import Base
Base.metadata.create_all(engine)
print("Tables created ✓")
EOF
```

### Step 7 — Start Redis

```bash
redis-server
# or on macOS with Homebrew:
brew services start redis
```

### Step 8 — Start all microservices

```bash
python3 run_services.py
```

This will start all 6 services and auto-restart any that crash. Output:

```
============================================================
  HotelOS — Microservices
============================================================
  Auth Service         → http://localhost:8000/docs
  Reception Service    → http://localhost:8001/docs
  Housekeeping Service → http://localhost:8002/docs
  Room Service         → http://localhost:8003/docs
  Maintenance Service  → http://localhost:8004/docs
  WebSocket Gateway    → http://localhost:8005/
============================================================
```

### Step 9 — Open the dashboard

Open `frontend/index.html` in a browser, or serve it with:

```bash
cd frontend
python3 -m http.server 3000
# Then visit http://localhost:3000
```

---

## 🔑 Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hotel.com | admin123 |
| Reception | reception@hotel.com | staff123 |
| Housekeeping | housekeeping@hotel.com | staff123 |
| Room Service | roomservice@hotel.com | staff123 |
| Maintenance | maintenance@hotel.com | staff123 |

> Guests can self-register via the "Guest Register" tab on the login page.

---

## 🧪 Running Tests

```bash
# Make sure all services are running first (Step 8)
python3 test_scenarios.py
```

Test scenarios covered:

| ID | Scenario |
|----|----------|
| TS-01 | Room allocation algorithm (selects least-recently-cleaned room) |
| TS-02 | Floor preference in room allocation |
| TS-03 | Dirty → Cleaning → Clean status transition |
| TS-04 | Maintenance priority queue (CRITICAL before NORMAL) |
| TS-05 | Room service order workflow (received→preparing→in_delivery→delivered) |
| TS-06 | Concurrent check-in race condition (threading.Lock protection) |
| TS-07 | No available rooms returns 409 Conflict |
| TS-08 | Invalid room type returns 422 Unprocessable Entity |

---

## 📡 API Documentation

Each service provides interactive Swagger UI at `/docs`:

- Auth: http://localhost:8000/docs
- Reception: http://localhost:8001/docs
- Housekeeping: http://localhost:8002/docs
- Room Service: http://localhost:8003/docs
- Maintenance: http://localhost:8004/docs

### Authentication

All endpoints (except `/auth/login` and `/auth/register`) require a Bearer token:

```bash
# 1. Get token
curl -X POST http://localhost:8000/auth/login \
  -d "username=admin@hotel.com&password=admin123"

# 2. Use token
curl http://localhost:8001/rooms \
  -H "Authorization: Bearer <token>"
```

---

## 🏗️ Project Structure

```
hotelos/
├── app/
│   ├── core/
│   │   ├── auth.py          # JWT decode + role guards
│   │   ├── broker.py        # Redis Pub/Sub publisher & subscriber
│   │   └── config.py        # Pydantic settings (reads .env)
│   ├── db/
│   │   ├── database.py      # Thread-safe DB layer (Singleton)
│   │   ├── engine.py        # SQLAlchemy engine + session factory
│   │   └── models.py        # ORM models (User, Room, Guest, Booking, Order, MaintenanceIssue)
│   └── schemas/
│       ├── enums.py         # RoomStatus, RoomType, OrderStatus, PriorityLevel
│       └── events.py        # HotelEvent schema + event type constants
├── services/
│   ├── auth/main.py         # Auth microservice (port 8000)
│   ├── reception/main.py    # Reception microservice (port 8001)
│   ├── housekeeping/main.py # Housekeeping microservice (port 8002)
│   ├── room_service/main.py # Room Service microservice (port 8003)
│   ├── maintenance/main.py  # Maintenance microservice (port 8004)
│   └── websocket_gateway/main.py # WS Gateway (port 8005)
├── frontend/
│   ├── index.html           # Single-page app (Auth + Staff + Guest portals)
│   ├── script.js            # API calls, WebSocket, rendering
│   └── style.css            # Light theme design system
├── run_services.py          # Starts all services + auto-restart
├── test_scenarios.py        # LO4 test suite (TS-01 through TS-08)
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

---

## 🔄 Event System (Redis Pub/Sub)

Services communicate exclusively via Redis channels — no direct service-to-service calls:

| Event | Publisher | Subscribers | Description |
|-------|-----------|-------------|-------------|
| `check_in_completed` | Reception | WS Gateway | Guest checked in, room now occupied |
| `room_vacated` | Reception | Housekeeping, WS Gateway | Guest checked out, room needs cleaning |
| `room_cleaned` | Housekeeping | WS Gateway | Room is clean and available |
| `cleaning_started` | Housekeeping | WS Gateway | Cleaning in progress |
| `order_status_changed` | Room Service | WS Gateway | Food order status updated |
| `maintenance_updated` | Maintenance | WS Gateway | Issue reported or resolved |

---

## 🔒 Security

- **JWT authentication** — all service endpoints require `Authorization: Bearer <token>`
- **Role-based access control** — endpoints enforce roles (`admin`, `reception`, `housekeeping`, `room_service`, `maintenance`, `guest`)
- **Password hashing** — Argon2 (not bcrypt) for secure password storage
- **Input validation** — Pydantic models validate all incoming data
- **CORS** — configured per-service (set `allow_origins` to specific domains in production)

---

## ⚙️ Known Issues & Fixes Applied

| # | Issue | Fix |
|---|-------|-----|
| 1 | `DATABASE_URL` had hardcoded username (`anasxonummataliyev`) | Changed to `postgres` default; override via `.env` |
| 2 | `check-out` status comparison used `.value` on plain string | Replaced with `str(...).replace("OrderStatus.","")` |
| 3 | `OrderResponse.status` was typed as `OrderStatus` enum but DB returns string | Changed to `str` with optional coercion |
| 4 | `MaintenanceIssueResponse` missing `resolution_notes` field | Added optional field |
| 5 | `test_scenarios.py` used deprecated `x-token` header | Updated to use JWT Bearer auth |

---

## 📝 Git History

```bash
git log --oneline
```

Aim for at least 10 commits covering: initial structure, auth service, reception service, housekeeping, room service, maintenance, websocket gateway, frontend, bug fixes, README.

---

*HotelOS © 2025 — Built for BTEC Programming Practice Assignment*
