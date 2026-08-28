"""
RAG API Router
==============
Endpoints for the RAG pipeline — book processing, chat, and notes.

Routes:
  POST /api/rag/{book_id}/process           — Enqueue book indexing task
  GET  /api/rag/{book_id}/status            — Poll indexing status
  POST /api/rag/{book_id}/chat              — Ask a question (RAG + stream)
  POST /api/rag/{book_id}/notes/generate    — Enqueue note generation
  GET  /api/rag/{book_id}/notes             — Fetch stored notes
  GET  /api/rag/{book_id}/notes/{note_id}   — Fetch a single note
"""
import base64
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import (
    ProcessBookResponse,
    RagStatusResponse, ChatRequest, ChatResponse,
    GenerateNotesRequest, GenerateNotesResponse,
    NoteResponse,
)
from app.services.session import get_current_user_and_token
from app.services.google_drive_service import google_drive_service
from app.services.rag_service import answer_question, stream_answer
from app.services.chroma_service import collection_exists
from app.tasks.processing import process_book_task
from app.tasks.notes import orchestrate_notes_task
from app.db import get_db
from app.models import BookRagStatus, BookNote, ChatMessage, IndexStatus, NoteScope
from app.schemas import User

router = APIRouter(prefix="/rag", tags=["rag"])


# ---------------------------------------------------------------------------
# POST /rag/{book_id}/process
# ---------------------------------------------------------------------------

@router.post("/{book_id}/process", response_model=ProcessBookResponse)
async def process_book(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Download the book from Google Drive and enqueue the indexing pipeline.
    Returns immediately with a task ID — poll /status to track progress.
    """
    user, token = auth_data
    user_id = user.id

    # Check if already indexed and not failed
    result = await db.execute(
        select(BookRagStatus).where(
            BookRagStatus.book_id == book_id,
            BookRagStatus.user_id == user_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing and existing.status == IndexStatus.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This book is already being processed. Check /status for progress.",
        )

    # Download PDF bytes from Google Drive
    try:
        pdf_bytes = await google_drive_service.download_pdf_content(token, book_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to download book from Google Drive: {str(e)}",
        )

    # Base64-encode for JSON serialization over Redis
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    # Dispatch Celery task
    task = process_book_task.apply_async(
        args=[book_id, user_id, pdf_b64],
        queue="processing",
    )

    return ProcessBookResponse(
        book_id=book_id,
        task_id=task.id,
        message="Book processing started. Use /status to track progress.",
    )


# ---------------------------------------------------------------------------
# GET /rag/{book_id}/status
# ---------------------------------------------------------------------------

@router.get("/{book_id}/status", response_model=RagStatusResponse)
async def get_processing_status(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db),
):
    """Poll the indexing status of a book."""
    user, _ = auth_data

    result = await db.execute(
        select(BookRagStatus).where(
            BookRagStatus.book_id == book_id,
            BookRagStatus.user_id == user.id,
        )
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This book has not been submitted for processing yet.",
        )

    return RagStatusResponse(
        book_id=book_id,
        status=record.status.value,
        total_chunks=record.total_chunks,
        error_message=record.error_message,
        updated_at=record.updated_at.isoformat() if record.updated_at else None,
    )


# ---------------------------------------------------------------------------
# POST /rag/{book_id}/chat
# ---------------------------------------------------------------------------

@router.post("/{book_id}/chat")
async def chat_with_book(
    book_id: str,
    request: ChatRequest,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Ask a question about the book. Supports streaming (SSE) and non-streaming.

    - If `stream=true` in the request body, returns a text/event-stream response.
    - Otherwise returns a JSON ChatResponse.
    """
    user, _ = auth_data
    user_id = user.id

    # Guard: book must be indexed
    if not collection_exists(user_id, book_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This book has not been indexed yet. POST to /process first.",
        )

    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty.")

    if request.stream:
        # Streaming response via SSE
        async def event_generator():
            async for token in stream_answer(query=query, book_id=book_id, user_id=user_id):
                yield f"data: {token}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    # Non-streaming
    result = await answer_question(query=query, book_id=book_id, user_id=user_id)

    # Persist to chat history
    user_msg = ChatMessage(
        id=uuid.uuid4(), book_id=book_id, user_id=user_id,
        role="user", content=query,
    )
    assistant_msg = ChatMessage(
        id=uuid.uuid4(), book_id=book_id, user_id=user_id,
        role="assistant", content=result["answer"],
        source_chunk_ids=",".join(c["id"] for c in result["sources"]),
    )
    db.add_all([user_msg, assistant_msg])
    await db.commit()

    return ChatResponse(
        answer=result["answer"],
        sources=[
            {"page": c["page"], "chunk_index": c["chunk_index"], "text_preview": c["text"][:200]}
            for c in result["sources"]
        ],
    )


# ---------------------------------------------------------------------------
# POST /rag/{book_id}/notes/generate
# ---------------------------------------------------------------------------

@router.post("/{book_id}/notes/generate", response_model=GenerateNotesResponse)
async def generate_notes(
    book_id: str,
    request: GenerateNotesRequest,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Enqueue note generation for a book.

    scope:
      - "chapter" → detect chapters and generate notes per chapter (multiple tasks)
      - "full"    → generate one holistic notes document for the whole book
    """
    user, token = auth_data
    user_id = user.id

    # Guard: book must be indexed
    if not collection_exists(user_id, book_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Book not indexed yet. POST to /process first.",
        )

    # For chapter detection we need the Markdown — re-download and parse on the fly
    # (lightweight: parse_pdf is called inside the orchestrator task)
    try:
        pdf_bytes = await google_drive_service.download_pdf_content(token, book_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to download book: {str(e)}",
        )

    # Parse to Markdown (needed for chapter detection in the orchestrator)
    from app.services.parse_pdf import parse_pdf
    parse_result = parse_pdf(pdf_bytes, ocr_mode="auto")
    markdown_text = parse_result.markdown or ""

    book_title = request.book_title or book_id
    scope = request.scope or "chapter"

    task = orchestrate_notes_task.apply_async(
        args=[book_id, user_id, book_title, markdown_text, scope],
        queue="notes",
    )

    return GenerateNotesResponse(
        book_id=book_id,
        scope=scope,
        orchestrator_task_id=task.id,
        message=f"Note generation started ({scope} scope). Check GET /notes to see results as they complete.",
    )


# ---------------------------------------------------------------------------
# GET /rag/{book_id}/notes
# ---------------------------------------------------------------------------

@router.get("/{book_id}/notes", response_model=List[NoteResponse])
async def list_notes(
    book_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db),
):
    """Return all notes for a book, ordered by chapter index."""
    user, _ = auth_data

    result = await db.execute(
        select(BookNote)
        .where(BookNote.book_id == book_id, BookNote.user_id == user.id)
        .order_by(BookNote.chapter_index)
    )
    notes = result.scalars().all()

    return [
        NoteResponse(
            id=str(note.id),
            book_id=note.book_id,
            scope=note.scope.value,
            chapter_title=note.chapter_title,
            chapter_index=note.chapter_index,
            content=note.content,
            status=note.status.value,
            error_message=note.error_message,
            updated_at=note.updated_at.isoformat() if note.updated_at else None,
        )
        for note in notes
    ]


# ---------------------------------------------------------------------------
# GET /rag/{book_id}/notes/{note_id}
# ---------------------------------------------------------------------------

@router.get("/{book_id}/notes/{note_id}", response_model=NoteResponse)
async def get_note(
    book_id: str,
    note_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a single note by its UUID."""
    user, _ = auth_data

    try:
        note_uuid = uuid.UUID(note_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid note ID.")

    result = await db.execute(
        select(BookNote).where(
            BookNote.id == note_uuid,
            BookNote.book_id == book_id,
            BookNote.user_id == user.id,
        )
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    return NoteResponse(
        id=str(note.id),
        book_id=note.book_id,
        scope=note.scope.value,
        chapter_title=note.chapter_title,
        chapter_index=note.chapter_index,
        content=note.content,
        status=note.status.value,
        error_message=note.error_message,
        updated_at=note.updated_at.isoformat() if note.updated_at else None,
    )
