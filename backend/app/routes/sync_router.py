from fastapi import APIRouter, Depends
from app.schemas import SyncData, User
from app.services.session import get_current_user_and_token
from app.controllers.sync import (
    get_sync_data_controller,
    replace_sync_data_controller,
)

sync_router = APIRouter(prefix="/sync", tags=["sync"])


@sync_router.get("", response_model=SyncData)
async def get_sync_data(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Fetches the full cloud_pdf_reader_sync.json metadata from Google Drive"""
    return await get_sync_data_controller(auth_data=auth_data)


@sync_router.put("", response_model=SyncData)
async def replace_sync_data(
    sync_data: SyncData,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Overwrites the full cloud_pdf_reader_sync.json metadata on Google Drive"""
    return await replace_sync_data_controller(sync_data=sync_data, auth_data=auth_data)
