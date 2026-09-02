import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, BigInteger, DateTime, Enum as SQLEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.configs.db.config import Base
from app.schema.enums import DocumentStatus

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.folder import Folder
    from app.models.chapter import Chapter
    from app.models.note import Note
    from app.models.document_processing import DocumentProcessing


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    google_drive_file_id: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/pdf", nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    status: Mapped[DocumentStatus] = mapped_column(
        SQLEnum(DocumentStatus, name="document_status_enum", create_constraint=True),
        default=DocumentStatus.UPLOADED,
        nullable=False,
    )
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    indexed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="documents")
    folders: Mapped[List["Folder"]] = relationship("Folder", secondary="document_folders", back_populates="documents")
    chapters: Mapped[List["Chapter"]] = relationship("Chapter", back_populates="document", cascade="all, delete-orphan")
    notes: Mapped[List["Note"]] = relationship("Note", back_populates="document", cascade="all, delete-orphan")
    processing_records: Mapped[List["DocumentProcessing"]] = relationship("DocumentProcessing", back_populates="document", cascade="all, delete-orphan")
