"""SQLAlchemy ORM models for RAG features."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Integer, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
import enum
from app.db import Base


def _now():
    return datetime.now(timezone.utc)


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


class BookRagStatus(Base):
    """Tracks indexing pipeline state per book per user."""
    __tablename__ = "book_rag_status"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    status = Column(SAEnum(IndexStatus, native_enum=False), nullable=False, default=IndexStatus.PENDING)
    celery_task_id = Column(String, nullable=True)
    total_chunks = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class BookNote(Base):
    """Stores a generated note (per chapter or full book) in Markdown."""
    __tablename__ = "book_notes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    scope = Column(SAEnum(NoteScope, native_enum=False), nullable=False, default=NoteScope.CHAPTER)
    chapter_title = Column(String, nullable=True)
    chapter_index = Column(Integer, nullable=True)
    content = Column(Text, nullable=True)
    status = Column(SAEnum(NoteStatus, native_enum=False), nullable=False, default=NoteStatus.PENDING)
    celery_task_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class ChatMessage(Base):
    """Stores Q&A pairs for a book's chat history."""
    __tablename__ = "chat_history"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)   # "user" | "assistant"
    content = Column(Text, nullable=False)
    source_chunk_ids = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
