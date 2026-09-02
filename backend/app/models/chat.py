import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Text, DateTime, Enum as SQLEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.configs.db.config import Base
from app.schema.enums import ScopeType, MessageRole

if TYPE_CHECKING:
    from app.models.user import User


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), default="New Chat", nullable=False)
    scope_type: Mapped[ScopeType] = mapped_column(
        SQLEnum(ScopeType, name="scope_type_enum", create_constraint=True),
        default=ScopeType.ALL,
        nullable=False,
    )
    scope_id: Mapped[Optional[str]] = mapped_column(String(36), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="chat_sessions")
    messages: Mapped[List["ChatMessage"]] = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[MessageRole] = mapped_column(
        SQLEnum(MessageRole, name="message_role_enum", create_constraint=True),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")
