from datetime import datetime, timezone
from typing import Optional, List
from fastapi import HTTPException, status
from app.schemas import Book, BookProgress, User
from app.schema.folder import FolderCreate, FolderUpdate, FolderResponse, FolderDetailResponse
from app.services.google_drive_service import google_drive_service
from app.controllers.books import empty_progress


async def list_directories_controller(
    parent_id: Optional[str],
    auth_data: tuple[User, str],
) -> List[FolderResponse]:
    """
    Lists Google Drive directories. If parent_id is specified, lists subdirectories.
    """
    _, token = auth_data
    try:
        raw_folders = await google_drive_service.list_folders(token, parent_id=parent_id)
        # Fetch all PDF files to calculate book counts per directory
        all_pdfs = await google_drive_service.list_pdf_files(token)

        folder_counts = {}
        for pdf in all_pdfs:
            for p in pdf.get("parents", []):
                folder_counts[p] = folder_counts.get(p, 0) + 1

        results: List[FolderResponse] = []
        for rf in raw_folders:
            folder_id = rf.get("id")
            parents = rf.get("parents", [])
            parent_folder_id = parents[0] if parents else None
            results.append(
                FolderResponse(
                    id=folder_id,
                    name=rf.get("name", "Untitled Folder"),
                    parent_folder_id=parent_folder_id,
                    created_time=rf.get("createdTime"),
                    modified_time=rf.get("modifiedTime"),
                    book_count=folder_counts.get(folder_id, 0),
                )
            )
        return results
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list directories: {str(e)}",
        )


async def get_directory_controller(
    directory_id: str,
    auth_data: tuple[User, str],
) -> FolderDetailResponse:
    """
    Gets metadata, subdirectories, and contained books for a specific directory.
    """
    _, token = auth_data
    try:
        folder_info = await google_drive_service.get_folder(token, directory_id)
        subfolders_raw = await google_drive_service.list_folders(token, parent_id=directory_id)
        books_raw = await google_drive_service.list_pdf_files(token, folder_id=directory_id)
        _, sync_data = await google_drive_service.find_or_create_sync_file(token)

        # Parse subdirectories
        subdirectories: List[FolderResponse] = []
        for sf in subfolders_raw:
            subdirectories.append(
                FolderResponse(
                    id=sf.get("id"),
                    name=sf.get("name", "Untitled Folder"),
                    parent_folder_id=directory_id,
                    created_time=sf.get("createdTime"),
                    modified_time=sf.get("modifiedTime"),
                )
            )

        # Parse books in this directory
        books: List[Book] = []
        for df in books_raw:
            file_id = df.get("id")
            stats = sync_data.books.get(file_id) or empty_progress()
            size_val = int(df["size"]) if df.get("size") else None
            books.append(
                Book(
                    id=file_id,
                    name=df.get("name", "Untitled.pdf"),
                    size=size_val,
                    createdTime=df.get("createdTime"),
                    currentPage=stats.currentPage,
                    totalPages=stats.totalPages,
                    lastReadTime=stats.lastReadTime,
                )
            )

        parents = folder_info.get("parents", [])
        parent_folder_id = parents[0] if parents else None

        return FolderDetailResponse(
            id=folder_info.get("id", directory_id),
            name=folder_info.get("name", "Untitled Folder"),
            parent_folder_id=parent_folder_id,
            created_time=folder_info.get("createdTime"),
            modified_time=folder_info.get("modifiedTime"),
            subdirectories=subdirectories,
            books=books,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch directory details: {str(e)}",
        )


async def get_directory_books_controller(
    directory_id: str,
    auth_data: tuple[User, str],
) -> List[Book]:
    """
    Fetches all books residing inside a specific directory with sync progress.
    """
    _, token = auth_data
    try:
        books_raw = await google_drive_service.list_pdf_files(token, folder_id=directory_id)
        _, sync_data = await google_drive_service.find_or_create_sync_file(token)

        books: List[Book] = []
        for df in books_raw:
            file_id = df.get("id")
            stats = sync_data.books.get(file_id) or empty_progress()
            size_val = int(df["size"]) if df.get("size") else None
            books.append(
                Book(
                    id=file_id,
                    name=df.get("name", "Untitled.pdf"),
                    size=size_val,
                    createdTime=df.get("createdTime"),
                    currentPage=stats.currentPage,
                    totalPages=stats.totalPages,
                    lastReadTime=stats.lastReadTime,
                )
            )
        return books
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch books in directory: {str(e)}",
        )


async def create_directory_controller(
    payload: FolderCreate,
    auth_data: tuple[User, str],
) -> FolderResponse:
    """
    Creates a new directory/folder in Google Drive.
    """
    _, token = auth_data
    try:
        created = await google_drive_service.create_folder(
            token=token,
            name=payload.name,
            parent_folder_id=payload.parent_folder_id,
        )
        parents = created.get("parents", [])
        parent_id = parents[0] if parents else payload.parent_folder_id

        return FolderResponse(
            id=created.get("id"),
            name=created.get("name", payload.name),
            parent_folder_id=parent_id,
            created_time=created.get("createdTime"),
            modified_time=created.get("modifiedTime"),
            book_count=0,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create directory: {str(e)}",
        )


async def update_directory_controller(
    directory_id: str,
    payload: FolderUpdate,
    auth_data: tuple[User, str],
) -> FolderResponse:
    """
    Renames or moves a directory in Google Drive.
    """
    _, token = auth_data
    try:
        updated = await google_drive_service.update_folder(
            token=token,
            folder_id=directory_id,
            name=payload.name,
            parent_folder_id=payload.parent_folder_id,
        )
        parents = updated.get("parents", [])
        parent_id = parents[0] if parents else payload.parent_folder_id

        return FolderResponse(
            id=updated.get("id", directory_id),
            name=updated.get("name", payload.name or ""),
            parent_folder_id=parent_id,
            created_time=updated.get("createdTime"),
            modified_time=updated.get("modifiedTime"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update directory: {str(e)}",
        )


async def delete_directory_controller(
    directory_id: str,
    auth_data: tuple[User, str],
) -> dict:
    """
    Deletes a directory from Google Drive.
    """
    _, token = auth_data
    try:
        await google_drive_service.delete_folder(token, directory_id)
        return {"message": "Directory deleted successfully", "id": directory_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete directory: {str(e)}",
        )


async def add_book_to_directory_controller(
    directory_id: str,
    book_id: str,
    auth_data: tuple[User, str],
) -> dict:
    """
    Moves an existing book into a target directory.
    """
    _, token = auth_data
    try:
        result = await google_drive_service.move_file_to_folder(
            token=token,
            file_id=book_id,
            target_folder_id=directory_id,
        )
        return {
            "message": "Book moved to directory successfully",
            "directory_id": directory_id,
            "book_id": book_id,
            "file": result,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to move book to directory: {str(e)}",
        )


async def remove_book_from_directory_controller(
    directory_id: str,
    book_id: str,
    auth_data: tuple[User, str],
) -> dict:
    """
    Removes a book from a directory.
    """
    _, token = auth_data
    try:
        result = await google_drive_service.remove_file_from_folder(
            token=token,
            file_id=book_id,
            folder_id=directory_id,
        )
        return {
            "message": "Book removed from directory successfully",
            "directory_id": directory_id,
            "book_id": book_id,
            "file": result,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove book from directory: {str(e)}",
        )
