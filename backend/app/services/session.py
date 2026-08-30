from typing import Optional, Tuple
from fastapi import Request, HTTPException, status, Header, Cookie
from app.services.google_auth_service import google_auth_service
from app.schemas import User


async def get_current_user_and_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    cloud_pdf_session: Optional[str] = Cookie(None),
) -> Tuple[User, str]:
    """
    Fast dependency resolving user and Google OAuth access token.
    Prioritizes state set by AuthenticationMiddleware.
    """
    # 1. Check if AuthenticationMiddleware already resolved the user & token
    if getattr(request.state, "user", None) and getattr(request.state, "access_token", None):
        return request.state.user, request.state.access_token

    # 2. Fallback resolution if called outside middleware
    token_str = None
    if authorization and authorization.startswith("Bearer "):
        token_str = authorization.split("Bearer ", 1)[1].strip()
    elif cloud_pdf_session:
        token_str = cloud_pdf_session

    if not token_str:
        query_token = request.query_params.get("token")
        if query_token:
            token_str = query_token

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided."
        )

    session_data = google_auth_service.decode_session_token(token_str)
    if session_data and session_data.get("access_token"):
        user = User(
            id=session_data.get("sub", ""),
            email=session_data.get("email", ""),
            name=session_data.get("name"),
            picture=session_data.get("picture")
        )
        access_token = session_data["access_token"]
        refresh_token = session_data.get("refresh_token")

        try:
            valid_access_token, _ = await google_auth_service.validate_or_refresh_token(
                access_token=access_token,
                refresh_token=refresh_token
            )
            return user, valid_access_token
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google OAuth session expired. Please log in again."
            )

    try:
        user = await google_auth_service.fetch_user_info(token_str)
        return user, token_str
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication session."
        )
