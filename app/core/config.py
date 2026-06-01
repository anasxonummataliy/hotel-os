"""Application configuration using pydantic-settings."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    # Service ports
    RECEPTION_SERVICE_PORT: int = 8001
    HOUSEKEEPING_SERVICE_PORT: int = 8002
    ROOM_SERVICE_PORT: int = 8003
    MAINTENANCE_SERVICE_PORT: int = 8004
    WEBSOCKET_GATEWAY_PORT: int = 8005

    # Security
    API_TOKEN: str = "hotel-os-secret-token-2024"

    # App
    DEBUG: bool = True
    ENVIRONMENT: str = "development"

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
