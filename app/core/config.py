from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/hotel_os"

    SECRET_KEY: str = "hotel-os-super-secret-jwt-key-change-in-production-2024"

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB:   int = 0

    AUTH_SERVICE_PORT:         int = 8000
    RECEPTION_SERVICE_PORT:    int = 8001
    HOUSEKEEPING_SERVICE_PORT: int = 8002
    ROOM_SERVICE_PORT:         int = 8003
    MAINTENANCE_SERVICE_PORT:  int = 8004
    WEBSOCKET_GATEWAY_PORT:    int = 8005

    DEBUG:       bool = False
    ENVIRONMENT: str  = "development"

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
