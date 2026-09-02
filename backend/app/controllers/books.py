import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, UploadFile, Response, status
from sqlalchemy.orm import Session

from app.schemas import Book, BookProgress, LibraryResponse, User
from app.models.user import User as DBUser
from app.models.document import Document
from app.models.document_processing import DocumentProcessing
from app.schema.enums import DocumentStatus
from app.schema.document_processing import DocumentProcessingResponse
from app.services.google_drive_service import google_drive_service
from app.services.vector_store_service import vector_store_service


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


async def get_book_content_controller(
    book_id: str,
    auth_data: tuple[User, str],
    db: Optional[Session] = None,
) -> Response:
    """
    Downloads and streams the PDF file content from Google Drive or cached local storage.
    Supports both Google Drive file IDs and internal Document UUIDs.
    """
    schema_user, token = auth_data
    from app.services.document_storage_service import document_storage_service

    try:
        drive_file_id = book_id
        doc_id = None
        user_id = None

        if db is not None:
            try:
                db_user = _get_or_create_db_user(db, schema_user)
                user_id = db_user.id
                doc = db.query(Document).filter(
                    (Document.id == book_id) | (Document.google_drive_file_id == book_id),
                    Document.user_id == db_user.id
                ).first()

                if doc:
                    doc_id = doc.id
                    drive_file_id = doc.google_drive_file_id or book_id

                    # Check if cached locally in document storage
                    if document_storage_service.has_pdf(user_id, doc_id):
                        local_bytes = document_storage_service.read_pdf(user_id, doc_id)
                        if local_bytes:
                            return Response(
                                content=local_bytes,
                                media_type="application/pdf",
                                headers={"Content-Disposition": f'inline; filename="{doc.filename or book_id}.pdf"'}
                            )
            except Exception as dbe:
                # Fallback to direct drive download if DB query encounters an issue
                pass

        # Download from Google Drive using resolved drive file ID
        content = await google_drive_service.download_pdf_content(token, drive_file_id)

        # Cache locally if document record was found
        if user_id and doc_id:
            try:
                document_storage_service.save_pdf(user_id, doc_id, content)
            except Exception:
                pass

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
    Deletes a PDF file from Google Drive, purges its sync entry,
    and removes its indexed chunks from ChromaDB.
    """
    user, token = auth_data
    try:
        # 1. Delete file from Google Drive
        await google_drive_service.delete_file(token, book_id)

        # 2. Update sync file
        sync_file_id, sync_data = await google_drive_service.find_or_create_sync_file(token)
        if book_id in sync_data.books:
            del sync_data.books[book_id]
            await google_drive_service.update_sync_file(token, sync_file_id, sync_data)

    # 3. Purge vector chunks from ChromaDB and clean up DB/filesystem
        from app.configs.db.config import SessionLocal
        from app.services.document_storage_service import document_storage_service
        if SessionLocal:
            db_session = SessionLocal()
            try:
                db_user = _get_or_create_db_user(db_session, user)
                doc = db_session.query(Document).filter(
                    (Document.google_drive_file_id == book_id) | (Document.id == book_id),
                    Document.user_id == db_user.id
                ).first()
                if doc:
                    vector_store_service.delete_chunks_by_document(document_id=doc.id, user_id=db_user.id)
                    document_storage_service.cleanup_document(db_user.id, doc.id)
                    db_session.delete(doc)
                    db_session.commit()
            except Exception:
                db_session.rollback()
            finally:
                db_session.close()

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


def _get_or_create_db_user(db: Session, schema_user: User) -> DBUser:
    """Ensures a corresponding User row exists in PostgreSQL for foreign key relationships."""
    db_user = db.query(DBUser).filter(
        (DBUser.google_id == schema_user.id) | (DBUser.email == schema_user.email)
    ).first()
    if not db_user:
        db_user = DBUser(
            google_id=schema_user.id or str(uuid.uuid4()),
            email=schema_user.email,
            name=schema_user.name,
            picture_url=schema_user.picture,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    return db_user


async def index_book_controller(
    book_id: str,
    auth_data: tuple[User, str],
    db: Session,
) -> dict:
    """
    Triggers the 5-stage asynchronous Kafka pipeline to index a PDF document:
    1. Ensures PostgreSQL User & Document records exist.
    2. Initializes/resets DocumentProcessing record.
    3. Emits initial PdfIndexRequestEvent to TOPIC_PDF_INDEX_REQUEST.
    """
    schema_user, token = auth_data
    db_user = _get_or_create_db_user(db, schema_user)

    # 1. Look up or create Document record
    doc = db.query(Document).filter(
        Document.google_drive_file_id == book_id,
        Document.user_id == db_user.id
    ).first()

    if not doc:
        # Check if book_id is directly the Document UUID
        doc = db.query(Document).filter(
            Document.id == book_id,
            Document.user_id == db_user.id
        ).first()

    if not doc:
        # Retrieve filename from Google Drive if possible
        filename = f"{book_id}.pdf"
        try:
            drive_files = await google_drive_service.list_pdf_files(token)
            for df in drive_files:
                if df.get("id") == book_id:
                    filename = df.get("name", filename)
                    break
        except Exception:
            pass

        doc = Document(
            user_id=db_user.id,
            google_drive_file_id=book_id,
            filename=filename,
            status=DocumentStatus.PROCESSING,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
    else:
        doc.status = DocumentStatus.PROCESSING
        db.commit()

    # 2. Initialize or reset DocumentProcessing record
    proc_rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc.id).first()
    if not proc_rec:
        proc_rec = DocumentProcessing(
            document_id=doc.id,
            status=DocumentStatus.PROCESSING,
            started_at=datetime.now(timezone.utc),
            total_pages=0,
            total_chunks=0,
            processed_chunks=0,
            error_message=None,
        )
        db.add(proc_rec)
    else:
        proc_rec.status = DocumentStatus.PROCESSING
        proc_rec.started_at = datetime.now(timezone.utc)
        proc_rec.completed_at = None
        proc_rec.processed_chunks = 0
        proc_rec.error_message = None

    db.commit()

    # 3. Purge previous ChromaDB chunks if re-indexing
    try:
        vector_store_service.delete_chunks_by_document(document_id=doc.id, user_id=db_user.id)
    except Exception:
        pass

    # 4. Create and emit Kafka event: TOPIC_PDF_INDEX_REQUEST
    from app.pipeline.constants import TOPIC_PDF_INDEX_REQUEST
    from app.pipeline.schemas import PdfIndexRequestEvent
    from app.pipeline.producer import publish_event

    event = PdfIndexRequestEvent(
        document_id=doc.id,
        google_drive_file_id=doc.google_drive_file_id or book_id,
        user_id=db_user.id,
        access_token=token,
        filename=doc.filename,
    )

    try:
        await publish_event(TOPIC_PDF_INDEX_REQUEST, event, key=doc.id)
    except Exception as pub_err:
        doc.status = DocumentStatus.FAILED
        if proc_rec:
            proc_rec.status = DocumentStatus.FAILED
            proc_rec.error_message = f"Failed to dispatch to pipeline: {pub_err}"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue indexing pipeline: {pub_err}"
        )

    return {
        "status": "queued",
        "document_id": doc.id,
        "filename": doc.filename,
        "message": f"Indexing initiated for '{doc.filename}'. Event dispatched to Kafka pipeline.",
    }


async def get_book_index_status_controller(
    book_id: str,
    auth_data: tuple[User, str],
    db: Session,
) -> DocumentProcessingResponse:
    """
    Returns current indexing status for a document.
    """
    schema_user, _ = auth_data
    db_user = _get_or_create_db_user(db, schema_user)

    doc = db.query(Document).filter(
        (Document.google_drive_file_id == book_id) | (Document.id == book_id),
        Document.user_id == db_user.id
    ).first()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{book_id}' not found."
        )

    proc_rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc.id).first()
    if not proc_rec:
        return DocumentProcessingResponse(
            id=str(uuid.uuid4()),
            document_id=doc.id,
            status=doc.status,
            total_pages=0,
            total_chunks=0,
            processed_chunks=0,
            error_message=None,
        )

    # Health & Integrity check:
    # If the database record indicates INDEXED, verify vector store actually has the chunks
    if proc_rec.status == DocumentStatus.INDEXED or doc.status == DocumentStatus.INDEXED:
        chunk_count = vector_store_service.count_chunks_for_document(document_id=doc.id, user_id=db_user.id)
        if chunk_count == 0:
            # Index is missing from ChromaDB (e.g. docker container recreated or wiped)
            proc_rec.status = DocumentStatus.FAILED
            proc_rec.error_message = "Vector index is missing from database. Please click Re-index."
            proc_rec.processed_chunks = 0
            doc.status = DocumentStatus.FAILED
            try:
                db.commit()
            except Exception:
                db.rollback()
        elif proc_rec.processed_chunks != chunk_count:
            proc_rec.processed_chunks = chunk_count
            try:
                db.commit()
            except Exception:
                db.rollback()

    return DocumentProcessingResponse.model_validate(proc_rec)



async def get_book_markdown_controller(
    book_id: str,
    auth_data: tuple[User, str],
    db: Session,
) -> dict:
    """
    Returns the parsed Markdown text for a document if already processed.
    """
    schema_user, _ = auth_data
    db_user = _get_or_create_db_user(db, schema_user)

    doc = db.query(Document).filter(
        (Document.google_drive_file_id == book_id) | (Document.id == book_id),
        Document.user_id == db_user.id
    ).first()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{book_id}' not found."
        )

    from app.services.document_storage_service import document_storage_service
    md_text = document_storage_service.read_markdown(db_user.id, doc.id)

    if md_text is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parsed markdown for document '{doc.filename}' is not available yet. Please index it first."
        )

    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "markdown": md_text,
    }

