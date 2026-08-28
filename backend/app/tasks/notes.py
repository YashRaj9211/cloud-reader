"""
Notes Tasks
===========
Celery tasks for generating book notes.

Two task types:
  1. generate_chapter_notes_task — generates notes for a single chapter
  2. generate_full_notes_task    — generates a holistic full-book notes doc

The orchestrator `dispatch_notes_tasks` is called by the API endpoint.
It:
  a) downloads the PDF markdown from ChromaDB (if available) or re-fetches
  b) detects chapters using notes_service.detect_chapters
  c) creates a BookNote record per chapter (status=PENDING)
  d) dispatches one Celery task per chapter
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import List

from celery import Task
from sqlalchemy import select

from celery_app import celery_app
from app.services.notes_service import (
    detect_chapters,
    generate_chapter_notes,
    generate_full_book_notes,
)
from app.services.chroma_service import query_collection
from app.services.embedding_service import embed_query
from app.db import AsyncSessionLocal
from app.models import BookNote, NoteScope, NoteStatus, BookRagStatus, IndexStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _get_rag_status(book_id: str, user_id: str) -> BookRagStatus | None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(BookRagStatus).where(
                BookRagStatus.book_id == book_id,
                BookRagStatus.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()


async def _create_note_record(
    note_id: uuid.UUID,
    book_id: str,
    user_id: str,
    scope: NoteScope,
    chapter_title: str,
    chapter_index: int,
    celery_task_id: str,
):
    async with AsyncSessionLocal() as session:
        note = BookNote(
            id=note_id,
            book_id=book_id,
            user_id=user_id,
            scope=scope,
            chapter_title=chapter_title,
            chapter_index=chapter_index,
            status=NoteStatus.GENERATING,
            celery_task_id=celery_task_id,
        )
        session.add(note)
        await session.commit()


async def _update_note_record(
    note_id: uuid.UUID,
    content: str = None,
    status: NoteStatus = None,
    error_message: str = None,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(BookNote).where(BookNote.id == note_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            return
        if content is not None:
            note.content = content
        if status is not None:
            note.status = status
        if error_message is not None:
            note.error_message = error_message
        note.updated_at = datetime.now(timezone.utc)
        await session.commit()


# ---------------------------------------------------------------------------
# Task: generate notes for a single chapter
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="app.tasks.notes.generate_chapter_notes_task",
    queue="notes",
    max_retries=1,
    acks_late=True,
)
def generate_chapter_notes_task(
    self: Task,
    note_id_str: str,
    book_id: str,
    user_id: str,
    chapter_title: str,
    chapter_excerpt: str,
):
    """
    Generate Markdown notes for a single chapter and save to NeonDB.

    Parameters
    ----------
    note_id_str     : UUID string of the pre-created BookNote record
    chapter_title   : Chapter heading / title
    chapter_excerpt : First ~500 chars of the chapter text (used as RAG query)
    """
    note_id = uuid.UUID(note_id_str)

    try:
        notes_md = generate_chapter_notes(
            book_id=book_id,
            user_id=user_id,
            chapter_title=chapter_title,
            chapter_excerpt=chapter_excerpt,
        )
        _run_async(_update_note_record(
            note_id,
            content=notes_md,
            status=NoteStatus.COMPLETED,
        ))
        return {"status": "completed", "note_id": note_id_str, "chapter": chapter_title}

    except Exception as exc:
        _run_async(_update_note_record(
            note_id,
            status=NoteStatus.FAILED,
            error_message=str(exc),
        ))
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            raise


# ---------------------------------------------------------------------------
# Task: generate a single full-book notes document
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="app.tasks.notes.generate_full_notes_task",
    queue="notes",
    max_retries=1,
    acks_late=True,
)
def generate_full_notes_task(
    self: Task,
    note_id_str: str,
    book_id: str,
    user_id: str,
    book_title: str,
):
    """Generate a holistic full-book notes document."""
    note_id = uuid.UUID(note_id_str)

    try:
        notes_md = generate_full_book_notes(
            book_id=book_id,
            user_id=user_id,
            book_title=book_title,
        )
        _run_async(_update_note_record(
            note_id,
            content=notes_md,
            status=NoteStatus.COMPLETED,
        ))
        return {"status": "completed", "note_id": note_id_str}

    except Exception as exc:
        _run_async(_update_note_record(
            note_id,
            status=NoteStatus.FAILED,
            error_message=str(exc),
        ))
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            raise


# ---------------------------------------------------------------------------
# Orchestrator: dispatched by the API to fan-out chapter tasks
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.tasks.notes.orchestrate_notes_task",
    queue="notes",
    acks_late=True,
)
def orchestrate_notes_task(
    book_id: str,
    user_id: str,
    book_title: str,
    markdown_text: str,
    scope: str,          # "chapter" | "full"
):
    """
    Orchestrator task that:
      - For 'full' scope: dispatches a single generate_full_notes_task
      - For 'chapter' scope: detects chapters then fans out per-chapter tasks

    Called by the API with the book's Markdown (passed from processing).
    """
    if scope == "full":
        note_id = uuid.uuid4()
        task = generate_full_notes_task.apply_async(
            args=[str(note_id), book_id, user_id, book_title],
            queue="notes",
        )
        _run_async(_create_note_record(
            note_id=note_id,
            book_id=book_id,
            user_id=user_id,
            scope=NoteScope.FULL,
            chapter_title=f"Full Book: {book_title}",
            chapter_index=0,
            celery_task_id=task.id,
        ))
        return {"dispatched": 1, "scope": "full"}

    # Chapter-by-chapter
    chapters = detect_chapters(markdown_text)
    dispatched_tasks = []

    for ch in chapters:
        note_id = uuid.uuid4()
        task = generate_chapter_notes_task.apply_async(
            args=[
                str(note_id),
                book_id,
                user_id,
                ch["title"],
                ch["excerpt"],
            ],
            queue="notes",
        )
        _run_async(_create_note_record(
            note_id=note_id,
            book_id=book_id,
            user_id=user_id,
            scope=NoteScope.CHAPTER,
            chapter_title=ch["title"],
            chapter_index=ch["index"],
            celery_task_id=task.id,
        ))
        dispatched_tasks.append({"chapter": ch["title"], "task_id": task.id})

    return {"dispatched": len(dispatched_tasks), "scope": "chapter", "tasks": dispatched_tasks}
