import json
import logging
from typing import Optional, Dict, Any
from app.configs.redis.config import get_async_redis_client, SESSION_CACHE_TTL

logger = logging.getLogger("app.services.session_store")

# ponytail: In-memory fallback if Redis connection is not established or down.
# Ceiling: Won't share state across multiple worker processes.
# Upgrade path: Run Redis cluster with persistent storage (AOF/RDB) or persist sessions directly in PostgreSQL.
_memory_session_store: Dict[str, Dict[str, Any]] = {}


class SessionStore:
    """
    Manages OAuth session tokens in Redis with in-memory fallback.
    """

    @staticmethod
    def _key(session_id: str) -> str:
        return f"session:{session_id}"

    @classmethod
    async def save_session(
        cls,
        session_id: str,
        user: Dict[str, Any],
        access_token: str,
        refresh_token: Optional[str] = None,
        expires_at: Optional[float] = None,
        ttl_seconds: int = SESSION_CACHE_TTL,
    ) -> None:
        session_data = {
            "user": user,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
        }
        try:
            redis_client = get_async_redis_client()
            await redis_client.set(
                cls._key(session_id),
                json.dumps(session_data),
                ex=ttl_seconds,
            )
        except Exception as e:
            logger.warning(f"Redis unavailable for saving session, falling back to memory: {e}")
            _memory_session_store[session_id] = session_data

    @classmethod
    async def get_session(cls, session_id: str) -> Optional[Dict[str, Any]]:
        try:
            redis_client = get_async_redis_client()
            raw_data = await redis_client.get(cls._key(session_id))
            if raw_data:
                return json.loads(raw_data)
        except Exception as e:
            logger.warning(f"Redis unavailable for retrieving session, checking memory fallback: {e}")
        
        return _memory_session_store.get(session_id)

    @classmethod
    async def update_access_token(
        cls,
        session_id: str,
        new_access_token: str,
        expires_at: Optional[float] = None,
        new_refresh_token: Optional[str] = None,
        ttl_seconds: int = SESSION_CACHE_TTL,
    ) -> None:
        session_data = await cls.get_session(session_id)
        if not session_data:
            return

        session_data["access_token"] = new_access_token
        if expires_at is not None:
            session_data["expires_at"] = expires_at
        if new_refresh_token:
            session_data["refresh_token"] = new_refresh_token

        try:
            redis_client = get_async_redis_client()
            await redis_client.set(
                cls._key(session_id),
                json.dumps(session_data),
                ex=ttl_seconds,
            )
        except Exception as e:
            logger.warning(f"Redis unavailable for updating session, falling back to memory: {e}")
            _memory_session_store[session_id] = session_data

    @classmethod
    async def delete_session(cls, session_id: str) -> None:
        try:
            redis_client = get_async_redis_client()
            await redis_client.delete(cls._key(session_id))
        except Exception as e:
            logger.warning(f"Redis unavailable for deleting session: {e}")
        
        _memory_session_store.pop(session_id, None)


session_store = SessionStore()
