from fastapi import APIRouter, Depends
from app.schemas import User
from app.services.session import get_current_user_and_token
from app.controllers.user import get_current_user_controller

user_router = APIRouter(prefix="/user", tags=["user"])


@user_router.get("/me", response_model=User)
async def get_user_profile(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Returns current user details"""
    return await get_current_user_controller(auth_data=auth_data)
