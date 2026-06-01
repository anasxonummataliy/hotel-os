"""
Redis Pub/Sub broker for inter-service communication.

BUG FIXES vs original:
1. publisher/subscriber are now FACTORY functions, not global singletons.
   Global singletons caused Redis connection sharing across services
   (each service must own its connection).
2. Subscriber.listen() now uses asyncio-compatible iteration with
   asyncio.sleep(0) to yield the event loop instead of blocking the thread.
3. Publisher.publish() gracefully handles Redis unavailability (logs warning
   instead of crashing the service).
"""

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
    """Publishes events to Redis Pub/Sub channels."""

    def __init__(self, redis_url: str = None):
        self._redis_url = redis_url or settings.REDIS_URL
        self._client: Optional[redis.Redis] = None

    def _get_client(self) -> redis.Redis:
        """Lazy-connect: only connect when first needed."""
        if self._client is None:
            self._client = redis.from_url(self._redis_url, decode_responses=True)
        return self._client

    def publish(
        self,
        event_type: str,
        service: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Publish an event to the appropriate Redis channel.
        Channel name: hotel:<event_type>
        """
        event = HotelEvent(
            event_type=event_type,
            timestamp=datetime.utcnow(),
            service=service,
            data=data,
            metadata=metadata,
        )
        channel = f"hotel:{event_type}"
        message = event.model_dump_json()

        try:
            self._get_client().publish(channel, message)
            logger.info(f"[{service}] Published '{event_type}' → {channel}")
        except redis.exceptions.ConnectionError as e:
            # Don't crash the service if Redis is temporarily unavailable
            logger.warning(f"[{service}] Redis unavailable, event '{event_type}' dropped: {e}")
        except Exception as e:
            logger.error(f"[{service}] Unexpected publish error: {e}")

    def close(self):
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None


class Subscriber:
    """Subscribes to Redis Pub/Sub events."""

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
        """Register a handler for an event type and subscribe to its channel."""
        channel = f"hotel:{event_type}"
        pubsub = self._get_pubsub()

        if event_type not in self.handlers:
            self.handlers[event_type] = []
            pubsub.subscribe(channel)
            logger.info(f"Subscribed to channel: {channel}")

        self.handlers[event_type].append(handler)

    async def listen(self) -> None:
        """
        Non-blocking async listen loop.

        FIX: The original used a plain `for message in pubsub.listen()` which
        blocks the event loop forever. We use get_message(timeout=0.01) and
        yield control back with asyncio.sleep(0) so FastAPI lifespan tasks
        and other coroutines can still run.
        """
        pubsub = self._get_pubsub()
        logger.info("Event listener started.")
        while True:
            try:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=0.05)
                if message and message.get("type") == "message":
                    try:
                        event_data = json.loads(message["data"])
                        event = HotelEvent(**event_data)
                        handlers = self.handlers.get(event.event_type, [])
                        for handler in handlers:
                            try:
                                handler(event)
                            except Exception as e:
                                logger.error(f"Handler error for '{event.event_type}': {e}")
                    except Exception as e:
                        logger.error(f"Message parse error: {e}")
            except redis.exceptions.ConnectionError:
                logger.warning("Redis connection lost, retrying in 2s…")
                await asyncio.sleep(2)
                # Reset so next call re-connects
                self._pubsub = None
                self._client = None
                continue
            except Exception as e:
                logger.error(f"Listener unexpected error: {e}")

            await asyncio.sleep(0)  # Yield to event loop

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
    """Create a new Publisher instance (call once per service)."""
    return Publisher()


def make_subscriber() -> Subscriber:
    """Create a new Subscriber instance (call once per service)."""
    return Subscriber()
