import os
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from app.schemas import User
from app.services.session import get_current_user_and_token
from app.controllers.notes import list_notes_controller

logger = logging.getLogger(__name__)

notes_router = APIRouter(prefix="/notes", tags=["notes"])
public_notes_router = APIRouter(prefix="/notes", tags=["notes"])

# Directory where Playwright-generated PDFs are stored
_NOTES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app_data",
    "generated_notes",
)


@notes_router.get("", response_model=List[dict])
async def list_notes(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Lists notes for the authenticated user"""
    return await list_notes_controller(auth_data=auth_data)


@public_notes_router.get("/generated/{filename}")
async def download_generated_note(
    filename: str,
):
    """
    Serves a Playwright-generated PDF notes file for download.
    The filename is returned by the pdf_notes_agent tool in the chat response.
    """
    # Basic path traversal guard
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = os.path.join(_NOTES_DIR, filename)

    if not os.path.isfile(file_path):
        logger.warning("[NotesRouter] Requested generated note not found: %s", file_path)
        raise HTTPException(status_code=404, detail="Generated note PDF not found.")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@notes_router.get("/generated", response_model=List[dict])
async def list_generated_notes(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Returns a list of all generated PDF note files available for download.
    """
    if not os.path.isdir(_NOTES_DIR):
        return []

    files = []
    for fname in sorted(os.listdir(_NOTES_DIR), reverse=True):
        if fname.endswith(".pdf"):
            fpath = os.path.join(_NOTES_DIR, fname)
            files.append({
                "filename": fname,
                "download_url": f"/api/notes/generated/{fname}",
                "size_bytes": os.path.getsize(fpath),
            })
    return files
