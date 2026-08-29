from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas import SyncData, User
from app.services.google_drive_service import google_drive_service
from app.services.session import get_current_user_and_token

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("", response_model=SyncData)
async def get_sync_data(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """
    Fetches the full cloud_pdf_reader_sync.json metadata from Google Drive.
    """
    _, token = auth_data
    try:
        _, sync_data = await google_drive_service.find_or_create_sync_file(token)
        return sync_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch sync data: {str(e)}"
        )


@router.put("", response_model=SyncData)
async def replace_sync_data(
    sync_data: SyncData,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """
    Overwrites the full cloud_pdf_reader_sync.json metadata on Google Drive.
    """
    _, token = auth_data
    try:
        sync_file_id, _ = await google_drive_service.find_or_create_sync_file(token)
        await google_drive_service.update_sync_file(token, sync_file_id, sync_data)
        return sync_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save sync data: {str(e)}"
        )
