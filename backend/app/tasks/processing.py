"""
Processing Tasks
================
Celery tasks for the book indexing pipeline:

  process_book_task(book_id, user_id, pdf_bytes_b64)
    Step 1: Parse PDF bytes → Markdown          (parse_pdf)
    Step 2: Chunk Markdown                      (chunking_service)
    Step 3: Generate embeddings for all chunks  (embedding_service)
    Step 4: Store in ChromaDB                   (chroma_service)
    Step 5: Update BookRagStatus in NeonDB

The task reports progress by updating the `status` and `total_chunks`
fields on the BookRagStatus record after each major step.
"""
import base64
import asyncio
import uuid
from datetime import datetime, timezone

from celery import Task
from sqlalchemy import select

from celery_app import celery_app
from app.services.parse_pdf import parse_pdf
from app.services.chunking_service import chunk_markdown
from app.services.embedding_service import embed_texts
from app.services.chroma_service import upsert_chunks, delete_collection
from app.db import AsyncSessionLocal
from app.models import BookRagStatus, IndexStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _update_status(
    book_id: str,
    user_id: str,
    status: IndexStatus,
    total_chunks: int = None,
    error_message: str = None,
    celery_task_id: str = None,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(BookRagStatus).where(
                BookRagStatus.book_id == book_id,
                BookRagStatus.user_id == user_id,
            )
        )
        record = result.scalar_one_or_none()

        if record is None:
            record = BookRagStatus(
                id=uuid.uuid4(),
                book_id=book_id,
                user_id=user_id,
            )
            session.add(record)

        record.status = status
        record.updated_at = datetime.now(timezone.utc)

        if total_chunks is not None:
            record.total_chunks = total_chunks
        if error_message is not None:
            record.error_message = error_message
        if celery_task_id is not None:
            record.celery_task_id = celery_task_id

        await session.commit()


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    name="app.tasks.processing.process_book_task",
    queue="processing",
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def process_book_task(self: Task, book_id: str, user_id: str, pdf_bytes_b64: str):
    """
    Full indexing pipeline for a book.

    Parameters
    ----------
    book_id       : Google Drive file ID
    user_id       : Google user ID
    pdf_bytes_b64 : Base64-encoded PDF bytes
    """
    task_id = self.request.id
    _run_async(_update_status(book_id, user_id, IndexStatus.PROCESSING, celery_task_id=task_id))

    try:
        # ----------------------------------------------------------------
        # Step 1: Parse PDF → Markdown
        # ----------------------------------------------------------------
        pdf_bytes = base64.b64decode(pdf_bytes_b64)
        parse_result = parse_pdf(pdf_bytes, ocr_mode="auto")
        markdown_text = parse_result.markdown or ""

        if not markdown_text.strip():
            raise ValueError("PDF produced no extractable text. Is it a scanned image-only PDF?")

        # ----------------------------------------------------------------
        # Step 2: Chunk Markdown
        # ----------------------------------------------------------------
        chunks = chunk_markdown(markdown_text, book_id=book_id, user_id=user_id)

        if not chunks:
            raise ValueError("Chunking produced zero chunks. The PDF may be empty or unreadable.")

        # ----------------------------------------------------------------
        # Step 3: Embed all chunks
        # ----------------------------------------------------------------
        texts = [c["text"] for c in chunks]
        embeddings = embed_texts(texts, input_type="passage")

        # ----------------------------------------------------------------
        # Step 4: Store in ChromaDB (delete old index first for re-processing)
        # ----------------------------------------------------------------
        delete_collection(user_id=user_id, book_id=book_id)
        upsert_chunks(
            user_id=user_id,
            book_id=book_id,
            chunks=chunks,
            embeddings=embeddings,
        )

        # ----------------------------------------------------------------
        # Step 5: Update DB status → COMPLETED
        # ----------------------------------------------------------------
        _run_async(_update_status(
            book_id, user_id, IndexStatus.COMPLETED,
            total_chunks=len(chunks),
        ))

        return {
            "status": "completed",
            "book_id": book_id,
            "total_chunks": len(chunks),
        }

    except Exception as exc:
        _run_async(_update_status(
            book_id, user_id, IndexStatus.FAILED,
            error_message=str(exc),
        ))
        # Retry up to max_retries times
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            raise
