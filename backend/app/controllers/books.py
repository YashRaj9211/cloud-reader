from datetime import datetime, timezone
from typing import List
from fastapi import HTTPException, UploadFile, Response, status
from app.schemas import Book, BookProgress, LibraryResponse, User
from app.services.google_drive_service import google_drive_service


def empty_progress(page: int = 1) -> BookProgress:
    return BookProgress(
        currentPage=page,
        totalPages=1,
        lastReadTime=datetime.now(timezone.utc).isoformat(),
        highlights=[],
        notes=[],
        inkStrokes=[],
        shapes=[],
        textBoxes=[],
    )


async def list_books_controller(auth_data: tuple[User, str]) -> LibraryResponse:
    """
    Lists all PDF books in user's Google Drive and combines them
    with saved sync metadata (reading position, annotations, etc.).
    """
    _, token = auth_data
    try:
        sync_file_id, sync_data = await google_drive_service.find_or_create_sync_file(token)
        drive_files = await google_drive_service.list_pdf_files(token)

        books: List[Book] = []
        for df in drive_files:
            file_id = df.get("id")
            stats = sync_data.books.get(file_id) or empty_progress()
            size_val = int(df["size"]) if df.get("size") else None
            books.append(Book(
                id=file_id,
                name=df.get("name", "Untitled.pdf"),
                size=size_val,
                createdTime=df.get("createdTime"),
                currentPage=stats.currentPage,
                totalPages=stats.totalPages,
                lastReadTime=stats.lastReadTime
            ))

        return LibraryResponse(
            books=books,
            syncData=sync_data,
            syncFileId=sync_file_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load library: {str(e)}"
        )


async def get_book_content_controller(book_id: str, auth_data: tuple[User, str]) -> Response:
    """
    Downloads and streams the PDF file content from Google Drive.
    """
    _, token = auth_data
    try:
        content = await google_drive_service.download_pdf_content(token, book_id)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{book_id}.pdf"'}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download book content: {str(e)}"
        )


async def upload_book_controller(file: UploadFile, auth_data: tuple[User, str]) -> Book:
    """
    Uploads a new PDF file to user's Google Drive and initializes reading progress.
    """
    _, token = auth_data
    try:
        content = await file.read()
        filename = file.filename or "Document.pdf"
        content_type = file.content_type or "application/pdf"

        # 1. Upload to Drive
        new_file_id = await google_drive_service.upload_pdf_file(
            token=token,
            filename=filename,
            content_type=content_type,
            file_bytes=content
        )

        # 2. Update Sync File
        sync_file_id, sync_data = await google_drive_service.find_or_create_sync_file(token)
        init_progress = empty_progress()
        sync_data.books[new_file_id] = init_progress
        await google_drive_service.update_sync_file(token, sync_file_id, sync_data)

        return Book(
            id=new_file_id,
            name=filename,
            size=len(content),
            createdTime=datetime.now(timezone.utc).isoformat(),
            currentPage=init_progress.currentPage,
            totalPages=init_progress.totalPages,
            lastReadTime=init_progress.lastReadTime
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload book: {str(e)}"
        )


async def delete_book_controller(book_id: str, auth_data: tuple[User, str]) -> dict:
    """
    Deletes a PDF file from Google Drive and purges its sync entry.
    """
    _, token = auth_data
    try:
        # 1. Delete file from Google Drive
        await google_drive_service.delete_file(token, book_id)

        # 2. Update sync file
        sync_file_id, sync_data = await google_drive_service.find_or_create_sync_file(token)
        if book_id in sync_data.books:
            del sync_data.books[book_id]
            await google_drive_service.update_sync_file(token, sync_file_id, sync_data)

        return {"message": "File deleted successfully", "id": book_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete book: {str(e)}"
        )


async def update_book_progress_controller(book_id: str, progress: BookProgress, auth_data: tuple[User, str]) -> BookProgress:
    """
    Updates page progress and annotations for a specific book in Google Drive.
    """
    _, token = auth_data
    try:
        sync_file_id, sync_data = await google_drive_service.find_or_create_sync_file(token)
        sync_data.books[book_id] = progress
        await google_drive_service.update_sync_file(token, sync_file_id, sync_data)
        return progress
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update book progress: {str(e)}"
        )
