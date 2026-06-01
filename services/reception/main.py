"""
Reception Service — Port 8001
Handles guest check-in, check-out, and room inventory queries.
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
    logger.info("Reception Service starting on port %d…", settings.RECEPTION_SERVICE_PORT)
    yield
    publisher.close()
    logger.info("Reception Service shut down.")


app = FastAPI(title="Reception Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "reception"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.RECEPTION_SERVICE_PORT)
