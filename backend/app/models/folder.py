import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.configs.db.config import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.document import Document


class DocumentFolder(Base):
    __tablename__ = "document_folders"

    folder_id: Mapped[str] = mapped_column(String(36), ForeignKey("folders.id", ondelete="CASCADE"), primary_key=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_folder_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("folders.id", ondelete="CASCADE"), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="folders")
    parent_folder: Mapped[Optional["Folder"]] = relationship("Folder", remote_side=[id], back_populates="subfolders")
    subfolders: Mapped[List["Folder"]] = relationship("Folder", back_populates="parent_folder", cascade="all, delete-orphan")
    documents: Mapped[List["Document"]] = relationship("Document", secondary="document_folders", back_populates="folders")
