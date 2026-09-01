from fastapi import APIRouter, Depends, UploadFile, File, Response
from sqlalchemy.orm import Session
from app.configs.db.config import get_db
from app.schemas import Book, BookProgress, LibraryResponse, User
from app.schema.document_processing import DocumentProcessingResponse
from app.services.session import get_current_user_and_token
from app.controllers.books import (
    list_books_controller,
    get_book_content_controller,
    upload_book_controller,
    delete_book_controller,
    update_book_progress_controller,
    index_book_controller,
    get_book_index_status_controller,
    get_book_markdown_controller,
)

books_router = APIRouter(prefix="/books", tags=["books"])


@books_router.get("", response_model=LibraryResponse)
async def list_books(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Lists all PDF books in user's Google Drive with sync metadata"""
    return await list_books_controller(auth_data=auth_data)


@books_router.get("/{book_id}/content")
async def get_book_content(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """Downloads and streams the PDF file content from Google Drive or local cache"""
    return await get_book_content_controller(book_id=book_id, auth_data=auth_data, db=db)


@books_router.post("/upload", response_model=Book)
async def upload_book(
    file: UploadFile = File(...),
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Uploads a new PDF file to user's Google Drive and initializes reading progress"""
    return await upload_book_controller(file=file, auth_data=auth_data)


@books_router.delete("/{book_id}")
async def delete_book(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Deletes a PDF file from Google Drive and purges its sync entry"""
    return await delete_book_controller(book_id=book_id, auth_data=auth_data)


@books_router.patch("/{book_id}/progress", response_model=BookProgress)
async def update_book_progress(
    book_id: str,
    progress: BookProgress,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token)
):
    """Updates page progress and annotations for a specific book in Google Drive"""
    return await update_book_progress_controller(book_id=book_id, progress=progress, auth_data=auth_data)


@books_router.post("/{book_id}/index")
async def index_book(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """
    Triggers asynchronous Kafka indexing pipeline for a PDF document.
    Dispatches event through 5 decoupled stages:
    Fetch -> Parse -> Chunk -> Embed -> ChromaDB store.
    """
    return await index_book_controller(book_id=book_id, auth_data=auth_data, db=db)


@books_router.get("/{book_id}/index-status", response_model=DocumentProcessingResponse)
async def get_book_index_status(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """
    Returns the real-time processing status of a document in the indexing pipeline.
    """
    return await get_book_index_status_controller(book_id=book_id, auth_data=auth_data, db=db)


@books_router.get("/{book_id}/markdown")
async def get_book_markdown(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """
    Fetches the parsed Markdown text of an indexed PDF document.
    """
    return await get_book_markdown_controller(book_id=book_id, auth_data=auth_data, db=db)

