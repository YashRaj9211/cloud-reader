from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, Response
from app.schemas import AuthStatus, GoogleTokenRequest, User
from app.services.session import get_current_user_and_token
from app.controllers.auth import (
    get_auth_url_controller,
    oauth_callback_controller,
    exchange_token_controller,
    get_current_user_profile_controller,
    logout_controller,
)

# Public Auth Router (No authentication required)
public_auth_router = APIRouter(prefix="/auth", tags=["auth"])

# Private Auth Router (Authentication required)
private_auth_router = APIRouter(prefix="/auth", tags=["auth"])


@public_auth_router.get("/url")
async def get_auth_url(redirect_uri: Optional[str] = None, state: Optional[str] = None):
    """Returns the Google OAuth consent URL"""
    return await get_auth_url_controller(redirect_uri=redirect_uri, state=state)


@public_auth_router.get("/callback")
async def oauth_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
):
    """Google OAuth redirect callback endpoint"""
    return await oauth_callback_controller(code=code, state=state)


@public_auth_router.post("/token")
async def exchange_token(payload: GoogleTokenRequest, response: Response):
    """Exchanges authorization code or accepts access token for a session"""
    return await exchange_token_controller(payload=payload, response=response)


@private_auth_router.get("/me", response_model=AuthStatus)
async def get_current_user_profile(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Returns the authenticated user's profile"""
    return await get_current_user_profile_controller(auth_data=auth_data)


@private_auth_router.post("/logout")
async def logout(request: Request, response: Response):
    """Clears the session from Redis and cookie"""
    return await logout_controller(request=request, response=response)
