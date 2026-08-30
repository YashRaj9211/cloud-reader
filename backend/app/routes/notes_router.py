from typing import List
from fastapi import APIRouter, Depends
from app.schemas import User
from app.services.session import get_current_user_and_token
from app.controllers.notes import list_notes_controller

notes_router = APIRouter(prefix="/notes", tags=["notes"])


@notes_router.get("", response_model=List[dict])
async def list_notes(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Lists notes for the authenticated user"""
    return await list_notes_controller(auth_data=auth_data)
