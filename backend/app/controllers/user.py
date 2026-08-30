from fastapi import HTTPException, status
from app.schemas import User


async def get_current_user_controller(auth_data: tuple[User, str]) -> User:
    """Returns the currently authenticated user details"""
    user, _ = auth_data
    return user
