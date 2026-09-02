import os
from typing import Optional
import redis
import redis.asyncio as aioredis

REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
REDIS_URL: str = os.getenv("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/0")

DEFAULT_CACHE_TTL: int = int(os.getenv("REDIS_DEFAULT_CACHE_TTL", "3600"))
SESSION_CACHE_TTL: int = int(os.getenv("REDIS_SESSION_CACHE_TTL", "86400"))

# Sync Redis client
_sync_redis_client: Optional[redis.Redis] = None

# Async Redis client
_async_redis_client: Optional[aioredis.Redis] = None


def get_redis_client() -> redis.Redis:
    """
    Returns a synchronous Redis client.
    """
    global _sync_redis_client
    if _sync_redis_client is None:
        _sync_redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    return _sync_redis_client


def get_async_redis_client() -> aioredis.Redis:
    """
    Returns an asynchronous Redis client for FastAPI async handlers.
    """
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _async_redis_client
