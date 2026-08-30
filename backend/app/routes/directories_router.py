from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from app.schemas import Book, User
from app.schema.folder import FolderCreate, FolderUpdate, FolderResponse, FolderDetailResponse
from app.services.session import get_current_user_and_token
from app.controllers.directories import (
    list_directories_controller,
    get_directory_controller,
    get_directory_books_controller,
    create_directory_controller,
    update_directory_controller,
    delete_directory_controller,
    add_book_to_directory_controller,
    remove_book_from_directory_controller,
)

directories_router = APIRouter(prefix="/directories", tags=["directories"])


@directories_router.get("", response_model=List[FolderResponse])
async def list_directories(
    parent_id: Optional[str] = Query(None, description="Optional parent directory ID to list subdirectories"),
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Lists Google Drive directories / folders for the authenticated user.
    """
    return await list_directories_controller(parent_id=parent_id, auth_data=auth_data)


@directories_router.post("", response_model=FolderResponse)
async def create_directory(
    payload: FolderCreate,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Creates a new directory in Google Drive.
    """
    return await create_directory_controller(payload=payload, auth_data=auth_data)


@directories_router.get("/{directory_id}", response_model=FolderDetailResponse)
async def get_directory_details(
    directory_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Gets details of a directory, including its subdirectories and contained books.
    """
    return await get_directory_controller(directory_id=directory_id, auth_data=auth_data)


@directories_router.patch("/{directory_id}", response_model=FolderResponse)
async def update_directory(
    directory_id: str,
    payload: FolderUpdate,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Renames or moves a directory in Google Drive.
    """
    return await update_directory_controller(directory_id=directory_id, payload=payload, auth_data=auth_data)


@directories_router.delete("/{directory_id}")
async def delete_directory(
    directory_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Deletes a directory from Google Drive.
    """
    return await delete_directory_controller(directory_id=directory_id, auth_data=auth_data)


@directories_router.get("/{directory_id}/books", response_model=List[Book])
async def get_directory_books(
    directory_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Fetches all books inside a specific directory along with their sync reading progress.
    """
    return await get_directory_books_controller(directory_id=directory_id, auth_data=auth_data)


@directories_router.post("/{directory_id}/books/{book_id}")
async def add_book_to_directory(
    directory_id: str,
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Moves/assigns a book into a directory in Google Drive.
    """
    return await add_book_to_directory_controller(directory_id=directory_id, book_id=book_id, auth_data=auth_data)


@directories_router.delete("/{directory_id}/books/{book_id}")
async def remove_book_from_directory(
    directory_id: str,
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
):
    """
    Removes a book from a directory in Google Drive.
    """
    return await remove_book_from_directory_controller(directory_id=directory_id, book_id=book_id, auth_data=auth_data)
