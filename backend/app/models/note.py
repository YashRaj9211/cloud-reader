import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.configs.db.config import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.document import Document
    from app.models.chapter import Chapter


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    document_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=True)
    chapter_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("chapters.id", ondelete="SET NULL"), index=True, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notes")
    document: Mapped[Optional["Document"]] = relationship("Document", back_populates="notes")
    chapter: Mapped[Optional["Chapter"]] = relationship("Chapter", back_populates="notes")
