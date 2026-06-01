"""
Maintenance Service — Port 8004
Priority queue algorithm for maintenance issues.
"""
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from .router import router, publisher

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Maintenance Service starting on port %d…", settings.MAINTENANCE_SERVICE_PORT)
    yield
    publisher.close()
    logger.info("Maintenance Service shut down.")


app = FastAPI(title="Maintenance Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "maintenance"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.MAINTENANCE_SERVICE_PORT)
