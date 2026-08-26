from typing import Optional, Dict, Any, Tuple
from fastapi import Request, HTTPException, status, Header, Cookie
from app.services.google_auth_service import google_auth_service
from app.config import TOKEN_STORAGE_COOKIE
from app.schemas import User


async def get_current_user_and_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    cloud_pdf_session: Optional[str] = Cookie(None),
) -> Tuple[User, str]:
    """
    Extracts the user and valid Google OAuth access token from:
    1. Authorization Bearer header (Session JWT or raw Google Access Token)
    2. Session Cookie (Session JWT)
    """
    token_str = None
    if authorization and authorization.startswith("Bearer "):
        token_str = authorization.split("Bearer ", 1)[1].strip()
    elif cloud_pdf_session:
        token_str = cloud_pdf_session

    if not token_str:
        # Check query parameter (e.g. for streaming media)
        query_token = request.query_params.get("token")
        if query_token:
            token_str = query_token

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided."
        )

    # First attempt: Try decoding as Session JWT
    session_data = google_auth_service.decode_session_token(token_str)
    if session_data and session_data.get("access_token"):
        user = User(
            id=session_data.get("sub", ""),
            email=session_data.get("email", ""),
            name=session_data.get("name"),
            picture=session_data.get("picture")
        )
        return user, session_data["access_token"]

    # Second attempt: Raw Google OAuth Access Token
    try:
        user = await google_auth_service.fetch_user_info(token_str)
        return user, token_str
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication session."
        )
