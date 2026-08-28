"""
SQLAlchemy ORM models for RAG features.

Tables:
  - book_rag_status  : tracks indexing status per book per user
  - book_notes       : stores generated notes (per chapter or full book)
  - chat_history     : stores Q&A pairs for a book session
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, DateTime, Integer,
    Boolean, ForeignKey, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID
import enum
from app.db import Base


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class IndexStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class NoteScope(str, enum.Enum):
    CHAPTER = "chapter"
    FULL = "full"


class NoteStatus(str, enum.Enum):
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# BookRagStatus
# ---------------------------------------------------------------------------

class BookRagStatus(Base):
    """
    Tracks whether a book's PDF has been parsed, chunked, embedded, and
    stored in ChromaDB.

    book_id   — the Google Drive file ID
    user_id   — the Google user ID (so each user has their own index)
    """
    __tablename__ = "book_rag_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)

    # Indexing progress
    status = Column(SAEnum(IndexStatus), nullable=False, default=IndexStatus.PENDING)
    celery_task_id = Column(String, nullable=True)   # Celery task ID for polling
    total_chunks = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def __repr__(self):
        return f"<BookRagStatus book_id={self.book_id} status={self.status}>"


# ---------------------------------------------------------------------------
# BookNote
# ---------------------------------------------------------------------------

class BookNote(Base):
    """
    Stores a generated note for a book. A note can cover a single chapter
    or the entire book, depending on the scope.
    """
    __tablename__ = "book_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)

    # What this note covers
    scope = Column(SAEnum(NoteScope), nullable=False, default=NoteScope.CHAPTER)
    chapter_title = Column(String, nullable=True)   # null if scope == FULL
    chapter_index = Column(Integer, nullable=True)  # ordering for display

    # The generated note content (Markdown)
    content = Column(Text, nullable=True)
    status = Column(SAEnum(NoteStatus), nullable=False, default=NoteStatus.PENDING)
    celery_task_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def __repr__(self):
        return f"<BookNote book_id={self.book_id} scope={self.scope} chapter={self.chapter_title}>"


# ---------------------------------------------------------------------------
# ChatHistory
# ---------------------------------------------------------------------------

class ChatMessage(Base):
    """
    Stores individual messages in a chat session with a book.
    """
    __tablename__ = "chat_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)

    role = Column(String, nullable=False)   # "user" | "assistant"
    content = Column(Text, nullable=False)

    # Source chunks used to answer (stored as comma-separated chunk IDs)
    source_chunk_ids = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_now)

    def __repr__(self):
        return f"<ChatMessage book_id={self.book_id} role={self.role}>"
