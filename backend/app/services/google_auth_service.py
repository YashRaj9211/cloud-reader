import urllib.parse
from typing import Optional, Dict, Any
import httpx
import jwt
from datetime import datetime, timedelta, timezone

from app.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_SCOPES,
    SESSION_SECRET
)
from app.schemas import User


class GoogleAuthService:
    @staticmethod
    def get_authorization_url(redirect_uri: Optional[str] = None, state: Optional[str] = None) -> str:
        params = {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri or GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(GOOGLE_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        if state:
            params["state"] = state
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

    @staticmethod
    async def exchange_code_for_tokens(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri or GOOGLE_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code != 200:
                raise Exception(f"Failed to exchange Google OAuth code: {resp.text}")
            return resp.json()

    @staticmethod
    async def fetch_user_info(access_token: str) -> User:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch Google user info: {resp.text}")
            data = resp.json()
            return User(
                id=data.get("id", ""),
                email=data.get("email", ""),
                name=data.get("name", ""),
                picture=data.get("picture", "")
            )

    @staticmethod
    def create_session_token(user: User, access_token: str, refresh_token: Optional[str] = None) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(days=30)).timestamp()),
        }
        return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")

    @staticmethod
    def decode_session_token(token: str) -> Optional[Dict[str, Any]]:
        try:
            return jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        except Exception:
            return None


google_auth_service = GoogleAuthService()
