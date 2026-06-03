import redis
import json
import logging
import asyncio
from datetime import datetime
from typing import Callable, Dict, Any, Optional, List

from app.core.config import settings
from app.schemas.events import HotelEvent

logger = logging.getLogger(__name__)


class Publisher:
    def __init__(self, redis_url: str = None):
        self._redis_url = redis_url or settings.REDIS_URL
        self._client: Optional[redis.Redis] = None

    def _get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(self._redis_url, decode_responses=True)
        return self._client

    def publish(self, event_type: str, service: str, data: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None) -> None:
        event = HotelEvent(
            event_type=event_type,
            timestamp=datetime.utcnow(),
            service=service,
            data=data,
            metadata=metadata,
        )
        channel = f"hotel:{event_type}"
        try:
            self._get_client().publish(channel, event.model_dump_json())
            logger.info("[%s] Published '%s'", service, event_type)
        except redis.exceptions.ConnectionError as e:
            logger.warning("[%s] Redis unavailable, '%s' dropped: %s", service, event_type, e)
        except Exception as e:
            logger.error("[%s] Publish error: %s", service, e)

    def close(self):
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None


class Subscriber:
    def __init__(self, redis_url: str = None):
        self._redis_url = redis_url or settings.REDIS_URL
        self._client: Optional[redis.Redis] = None
        self._pubsub = None
        self.handlers: Dict[str, List[Callable]] = {}

    def _get_pubsub(self):
        if self._pubsub is None:
            self._client = redis.from_url(self._redis_url, decode_responses=True)
            self._pubsub = self._client.pubsub()
        return self._pubsub

    def subscribe(self, event_type: str, handler: Callable) -> None:
        channel = f"hotel:{event_type}"
        pubsub = self._get_pubsub()
        if event_type not in self.handlers:
            self.handlers[event_type] = []
            pubsub.subscribe(channel)
            logger.info("Subscribed to channel: %s", channel)
        self.handlers[event_type].append(handler)

    async def listen(self) -> None:
        pubsub = self._get_pubsub()
        while True:
            try:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=0.05)
                if message and message.get("type") == "message":
                    try:
                        event = HotelEvent(**json.loads(message["data"]))
                        for handler in self.handlers.get(event.event_type, []):
                            try:
                                handler(event)
                            except Exception as e:
                                logger.error("Handler error for '%s': %s", event.event_type, e)
                    except Exception as e:
                        logger.error("Message parse error: %s", e)
            except redis.exceptions.ConnectionError:
                logger.warning("Redis connection lost, retrying in 2s")
                await asyncio.sleep(2)
                self._pubsub = None
                self._client = None
                continue
            except Exception as e:
                logger.error("Listener error: %s", e)
            await asyncio.sleep(0)

    def close(self):
        try:
            if self._pubsub:
                self._pubsub.close()
            if self._client:
                self._client.close()
        except Exception:
            pass
        self._pubsub = None
        self._client = None


def make_publisher() -> Publisher:
    return Publisher()


def make_subscriber() -> Subscriber:
    return Subscriber()
