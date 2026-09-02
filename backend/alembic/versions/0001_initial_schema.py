"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-08-30 17:38:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("google_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("picture_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 2. Folders table
    op.create_table(
        "folders",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("parent_folder_id", sa.String(length=36), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_folders_user_id", "folders", ["user_id"], unique=False)
    op.create_index("ix_folders_parent_folder_id", "folders", ["parent_folder_id"], unique=False)

    # 3. Documents table
    document_status_enum = sa.Enum(
        "UPLOADED", "PROCESSING", "INDEXED", "FAILED", "NEEDS_REINDEX",
        name="document_status_enum"
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("google_drive_file_id", sa.String(length=255), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), server_default="application/pdf", nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("status", document_status_enum, server_default="UPLOADED", nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"], unique=False)
    op.create_index("ix_documents_google_drive_file_id", "documents", ["google_drive_file_id"], unique=False)

    # 4. Document Folders association table (Many-to-Many)
    op.create_table(
        "document_folders",
        sa.Column("folder_id", sa.String(length=36), sa.ForeignKey("folders.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # 5. Chapters table
    op.create_table(
        "chapters",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("chapter_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chapters_document_id", "chapters", ["document_id"], unique=False)

    # 6. Notes table
    op.create_table(
        "notes",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chapter_id", sa.String(length=36), sa.ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notes_user_id", "notes", ["user_id"], unique=False)
    op.create_index("ix_notes_document_id", "notes", ["document_id"], unique=False)
    op.create_index("ix_notes_chapter_id", "notes", ["chapter_id"], unique=False)

    # 7. Chat Sessions table
    scope_type_enum = sa.Enum(
        "ALL", "FOLDER", "DOCUMENT", "CHAPTER",
        name="scope_type_enum"
    )
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), server_default="New Chat", nullable=False),
        sa.Column("scope_type", scope_type_enum, server_default="ALL", nullable=False),
        sa.Column("scope_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"], unique=False)
    op.create_index("ix_chat_sessions_scope_id", "chat_sessions", ["scope_id"], unique=False)

    # 8. Chat Messages table
    message_role_enum = sa.Enum(
        "USER", "ASSISTANT", "SYSTEM",
        name="message_role_enum"
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("session_id", sa.String(length=36), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", message_role_enum, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"], unique=False)

    # 9. Document Processing table
    document_processing_status_enum = sa.Enum(
        "UPLOADED", "PROCESSING", "INDEXED", "FAILED", "NEEDS_REINDEX",
        name="document_processing_status_enum"
    )
    op.create_table(
        "document_processing",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("document_id", sa.String(length=36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", document_processing_status_enum, server_default="PROCESSING", nullable=False),
        sa.Column("total_pages", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_chunks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("processed_chunks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_document_processing_document_id", "document_processing", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_table("document_processing")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("notes")
    op.drop_table("chapters")
    op.drop_table("document_folders")
    op.drop_table("documents")
    op.drop_table("folders")
    op.drop_table("users")

    # Drop custom PostgreSQL ENUM types
    sa.Enum(name="document_processing_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="message_role_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="scope_type_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="document_status_enum").drop(op.get_bind(), checkfirst=True)
