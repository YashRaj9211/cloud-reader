import logging
from typing import List
import json
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.schemas import User
from app.controllers.books import _get_or_create_db_user
from app.models.chat import ChatMessage, ChatSession
from app.schema.chat import (
    ChatMessageResponse,
    ChatSessionResponse,
    CreateSessionRequest,
    QueryRequest,
    QueryResponse,
    QueryScope,
    SendMessageRequest,
    SendMessageResponse,
    UpdateSessionRequest,
)
from app.schema.enums import MessageRole
from app.agents import adk_agent
from app.services.query_service import query_service

logger = logging.getLogger(__name__)


async def list_chat_sessions_controller(
    auth_data: tuple[User, str],
    db: Session,
) -> List[ChatSessionResponse]:
    """Returns all chat sessions for the authenticated user, newest first."""
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == db_user.id)
        .order_by(desc(ChatSession.created_at))
        .all()
    )

    return [ChatSessionResponse.model_validate(s) for s in sessions]


async def get_chat_session_controller(
    session_id: str,
    auth_data: tuple[User, str],
    db: Session,
) -> ChatSessionResponse:
    """Returns a specific chat session with its full message history."""
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == db_user.id)
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session '{session_id}' not found.",
        )

    return ChatSessionResponse.model_validate(session)


async def create_chat_session_controller(
    payload: CreateSessionRequest,
    auth_data: tuple[User, str],
    db: Session,
) -> ChatSessionResponse:
    """
    Creates a new scoped chat session.
    Validates ownership of the selected scope (Folder, Document, Chapter, or All).
    """
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    # Validate scope existence & tenant isolation
    scope = QueryScope(type=payload.scope_type, id=payload.scope_id)
    query_service._build_scope_filter_and_validate(scope=scope, user_id=db_user.id, db=db)

    new_session = ChatSession(
        user_id=db_user.id,
        title=(payload.title or "New Chat").strip(),
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return ChatSessionResponse.model_validate(new_session)


async def update_chat_session_controller(
    session_id: str,
    payload: UpdateSessionRequest,
    auth_data: tuple[User, str],
    db: Session,
) -> ChatSessionResponse:
    """Updates chat session title."""
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == db_user.id)
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session '{session_id}' not found.",
        )

    if payload.title.strip():
        session.title = payload.title.strip()
        db.commit()
        db.refresh(session)

    return ChatSessionResponse.model_validate(session)


async def delete_chat_session_controller(
    session_id: str,
    auth_data: tuple[User, str],
    db: Session,
) -> dict:
    """Deletes a chat session and cascades deletion of its messages."""
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == db_user.id)
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session '{session_id}' not found.",
        )

    db.delete(session)
    db.commit()

    return {"status": "success", "message": f"Chat session '{session_id}' deleted."}


async def send_chat_message_controller(
    session_id: str,
    payload: SendMessageRequest,
    auth_data: tuple[User, str],
    db: Session,
):
    """
    Sends a message to the scoped RAG agent via Server-Sent Events (SSE):
    1. Validates and saves the USER message in PostgreSQL.
    2. Runs the Google ADK RAG agent against scoped ChromaDB chunks.
    3. Streams the assistant reply chunks as they are generated.
    4. Saves the ASSISTANT message in PostgreSQL.
    5. Auto-updates session title if default.
    """
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    message_text = payload.message.strip()
    if not message_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty.",
        )

    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == db_user.id)
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat session '{session_id}' not found.",
        )

    # 1. Save user message to PostgreSQL
    user_msg = ChatMessage(
        session_id=session.id,
        role=MessageRole.USER,
        content=message_text,
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # 2. Run Google ADK multi-agent turn streaming
    async def stream_generator():
        try:
            async for data in adk_agent.execute_turn_stream(
                session=session,
                user_message=message_text,
                user_id=db_user.id,
                db=db,
            ):
                if data["type"] == "chunk":
                    yield f"data: {json.dumps({'chunk': data['text']})}\n\n"
                elif data["type"] == "done":
                    # 3. Save assistant message to PostgreSQL
                    assistant_msg = ChatMessage(
                        session_id=session.id,
                        role=MessageRole.ASSISTANT,
                        content=data["text"],
                    )
                    db.add(assistant_msg)

                    # 4. Auto-update session title if default
                    if session.title == "New Chat":
                        clean_title = message_text.replace("\n", " ")
                        session.title = clean_title[:40] + ("..." if len(clean_title) > 40 else "")

                    db.commit()
                    db.refresh(assistant_msg)

                    final_payload = {
                        "user_message": ChatMessageResponse.model_validate(user_msg).model_dump(mode="json"),
                        "assistant_message": ChatMessageResponse.model_validate(assistant_msg).model_dump(mode="json"),
                        "sources": data["sources"]
                    }
                    yield f"data: {json.dumps(final_payload)}\n\n"
        except Exception as e:
            logger.error("ADK chat execution failed: %s", e, exc_info=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


async def query_documents_controller(
    payload: QueryRequest,
    auth_data: tuple[User, str],
    db: Session,
) -> QueryResponse:
    """
    Executes a scoped semantic search across document chunks stored in ChromaDB.
    Scopes (ALL, DOCUMENT, CHAPTER, FOLDER) are validated against PostgreSQL
    and converted to tenant-isolated ChromaDB metadata filters.
    """
    user, _ = auth_data
    db_user = _get_or_create_db_user(db, user)

    return query_service.query(
        query_text=payload.query,
        scope=payload.scope,
        user_id=db_user.id,
        db=db,
        n_results=payload.n_results or 5,
    )
