import time
import logging
from typing import Optional, Set
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from app.config import TOKEN_STORAGE_COOKIE
from app.schemas import User
from app.services.google_auth_service import google_auth_service
from app.services.session_store import session_store

logger = logging.getLogger("app.middlewares.auth")

# Public paths that do not require authentication
PUBLIC_EXEMPT_PATHS: Set[str] = {
    "/",
    "/api/health",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/auth/url",
    "/api/auth/callback",
    "/api/auth/token",
}

# ponytail: Prefix matching for public docs and auth routes.
# Ceiling: Won't support dynamic regex route matching.
# Upgrade path: Use a trie or route-level dependency decorators for fine-grained route permissioning.
def is_public_path(path: str) -> bool:
    if path in PUBLIC_EXEMPT_PATHS:
        return True
    if path.startswith("/docs") or path.startswith("/redoc"):
        return True
    return False


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Extracts OAuth session token from Cookies, Authorization Bearer header, or Query parameters.
    2. Retrieves session credentials from Redis session store (or JWT payload).
    3. Transparently refreshes expired Google OAuth access tokens using refresh tokens.
    4. Attaches authenticated `user` and `access_token` to `request.state`.
    5. Blocks unauthenticated requests to protected endpoints with a 401 response.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Preflight OPTIONS requests skip authentication
        if request.method == "OPTIONS":
            return await call_next(request)

        # Initialize default request state
        request.state.user = None
        request.state.access_token = None
        request.state.session_id = None

        token_str = self._extract_token(request)

        if token_str:
            await self._authenticate_token(request, token_str)

        # If accessing a protected route without valid user authentication
        if not is_public_path(request.url.path) and not request.state.user:
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentication required or session expired. Please log in."},
            )

        response = await call_next(request)
        return response

    @staticmethod
    def _extract_token(request: Request) -> Optional[str]:
        # 1. Check HTTP-only cookie
        cookie_token = request.cookies.get(TOKEN_STORAGE_COOKIE)
        if cookie_token:
            return cookie_token

        # 2. Check Authorization Bearer header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            return auth_header.split("Bearer ", 1)[1].strip()

        # 3. Check query param (e.g. for streaming file/media URLs)
        query_token = request.query_params.get("token")
        if query_token:
            return query_token

        return None

    @classmethod
    async def _authenticate_token(cls, request: Request, token_str: str) -> None:
        # Step 1: Decode JWT to obtain session identity
        session_data = google_auth_service.decode_session_token(token_str)
        session_id = token_str

        user_data = None
        access_token = None
        refresh_token = None
        expires_at = None

        if session_data:
            # Check Redis session store first
            redis_session = await session_store.get_session(session_id)
            if redis_session:
                user_data = redis_session.get("user")
                access_token = redis_session.get("access_token")
                refresh_token = redis_session.get("refresh_token")
                expires_at = redis_session.get("expires_at")
            else:
                # Fallback to signed JWT claims if Redis didn't have the entry
                user_data = {
                    "id": session_data.get("sub", ""),
                    "email": session_data.get("email", ""),
                    "name": session_data.get("name"),
                    "picture": session_data.get("picture"),
                }
                access_token = session_data.get("access_token")
                refresh_token = session_data.get("refresh_token")

        if user_data and access_token:
            # Step 2: Check if access token is expired or close to expiring (within 60s)
            now = time.time()
            is_expired = expires_at and expires_at <= (now + 60)

            if is_expired and refresh_token:
                try:
                    # Refresh Google OAuth access token
                    new_tokens = await google_auth_service.refresh_access_token(refresh_token)
                    access_token = new_tokens.get("access_token", access_token)
                    new_expires_in = new_tokens.get("expires_in", 3600)
                    expires_at = now + new_expires_in

                    # Save refreshed token in Redis to avoid subsequent refresh calls
                    await session_store.update_access_token(
                        session_id=session_id,
                        new_access_token=access_token,
                        expires_at=expires_at,
                        new_refresh_token=new_tokens.get("refresh_token"),
                    )
                    logger.info("Successfully refreshed expired Google OAuth access token")
                except Exception as e:
                    logger.warning(f"Failed to refresh access token: {e}")
                    return

            user = User(
                id=user_data.get("id", ""),
                email=user_data.get("email", ""),
                name=user_data.get("name"),
                picture=user_data.get("picture"),
            )
            request.state.user = user
            request.state.access_token = access_token
            request.state.session_id = session_id
            return

        # Step 3: Check if token_str is a raw Google Access Token
        try:
            user = await google_auth_service.fetch_user_info(token_str)
            request.state.user = user
            request.state.access_token = token_str
        except Exception:
            pass
