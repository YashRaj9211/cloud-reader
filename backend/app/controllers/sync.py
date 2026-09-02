from fastapi import HTTPException, status
from app.schemas import SyncData, User
from app.services.google_drive_service import google_drive_service


async def get_sync_data_controller(auth_data: tuple[User, str]) -> SyncData:
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


async def replace_sync_data_controller(sync_data: SyncData, auth_data: tuple[User, str]) -> SyncData:
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
