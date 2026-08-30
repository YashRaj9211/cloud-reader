from typing import List
from fastapi import APIRouter, Depends
from app.schemas import User
from app.services.session import get_current_user_and_token
from app.controllers.chat import list_chat_sessions_controller

chat_router = APIRouter(prefix="/chat", tags=["chat"])


@chat_router.get("/sessions", response_model=List[dict])
async def list_chat_sessions(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Lists chat sessions for the authenticated user"""
    return await list_chat_sessions_controller(auth_data=auth_data)
