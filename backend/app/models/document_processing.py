import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Text, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.configs.db.config import Base
from app.schema.enums import DocumentStatus

if TYPE_CHECKING:
    from app.models.document import Document


class DocumentProcessing(Base):
    __tablename__ = "document_processing"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        SQLEnum(DocumentStatus, name="document_processing_status_enum", create_constraint=True),
        default=DocumentStatus.PROCESSING,
        nullable=False,
    )
    total_pages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="processing_records")
