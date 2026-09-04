import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from app.config import FRONTEND_URL, TOKEN_STORAGE_COOKIE, COOKIE_SECURE, COOKIE_SAMESITE
from app.schemas import AuthStatus, GoogleTokenRequest, User
from app.services.google_auth_service import google_auth_service
from app.services.session import get_current_user_and_token
from app.services.session_store import session_store

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/url")
def get_auth_url(redirect_uri: Optional[str] = None, state: Optional[str] = None):
    """Returns the Google OAuth consent URL"""
    url = google_auth_service.get_authorization_url(redirect_uri=redirect_uri, state=state)
    return {"url": url}


@router.get("/callback")
async def oauth_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
):
    """Google OAuth redirect callback endpoint"""
    try:
        token_data = await google_auth_service.exchange_code_for_tokens(code)
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)
        user = await google_auth_service.fetch_user_info(access_token)

        session_token = google_auth_service.create_session_token(
            user=user,
            access_token=access_token,
            refresh_token=refresh_token
        )

        # Save session in Redis
        await session_store.save_session(
            session_id=session_token,
            user=user.model_dump(),
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=time.time() + expires_in,
        )

        frontend_target = state if (state and state.startswith("http")) else FRONTEND_URL
        redirect_target = f"{frontend_target}?auth_success=1&token={session_token}"
        res = RedirectResponse(url=redirect_target)
        res.set_cookie(
            key=TOKEN_STORAGE_COOKIE,
            value=session_token,
            httponly=True,
            samesite=COOKIE_SAMESITE,
            secure=COOKIE_SECURE,
            max_age=30 * 24 * 3600
        )
        return res
    except Exception as e:
        frontend_target = state if (state and state.startswith("http")) else FRONTEND_URL
        redirect_err = f"{frontend_target}?auth_error={str(e)}"
        return RedirectResponse(url=redirect_err)


@router.post("/token")
async def exchange_token(payload: GoogleTokenRequest, response: Response):
    """
    Exchanges authorization code or accepts access token,
    validates with Google and sets up a session.
    """
    try:
        access_token = payload.access_token
        refresh_token = None
        expires_in = 3600

        if payload.code:
            token_data = await google_auth_service.exchange_code_for_tokens(
                payload.code,
                redirect_uri=payload.redirect_uri
            )
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)

        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either 'code' or 'access_token' must be provided."
            )

        user = await google_auth_service.fetch_user_info(access_token)
        session_token = google_auth_service.create_session_token(
            user=user,
            access_token=access_token,
            refresh_token=refresh_token
        )

        # Save session in Redis
        await session_store.save_session(
            session_id=session_token,
            user=user.model_dump(),
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=time.time() + expires_in,
        )

        response.set_cookie(
            key=TOKEN_STORAGE_COOKIE,
            value=session_token,
            httponly=True,
            samesite=COOKIE_SAMESITE,
            secure=COOKIE_SECURE,
            max_age=30 * 24 * 3600
        )

        return {
            "authenticated": True,
            "user": user,
            "session_token": session_token,
            "access_token": access_token
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Authentication failed: {str(e)}"
        )


@router.get("/me", response_model=AuthStatus)
async def get_current_user_profile(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Returns the authenticated user's profile"""
    user, _ = auth_data
    return AuthStatus(authenticated=True, user=user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clears the session from Redis and cookie"""
    session_id = getattr(request.state, "session_id", None) or request.cookies.get(TOKEN_STORAGE_COOKIE)
    if session_id:
        await session_store.delete_session(session_id)
    response.delete_cookie(TOKEN_STORAGE_COOKIE)
    return {"message": "Successfully logged out"}
