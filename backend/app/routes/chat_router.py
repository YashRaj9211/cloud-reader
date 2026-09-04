from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.configs.db.config import get_db
from app.schemas import User
from app.schema.chat import (
    ChatSessionResponse,
    CreateSessionRequest,
    QueryRequest,
    QueryResponse,
    SendMessageRequest,
    SendMessageResponse,
    UpdateSessionRequest,
)
from app.services.session import get_current_user_and_token
from app.controllers.chat import (
    create_chat_session_controller,
    delete_chat_session_controller,
    get_chat_session_controller,
    list_chat_sessions_controller,
    query_documents_controller,
    send_chat_message_controller,
    update_chat_session_controller,
)

chat_router = APIRouter(prefix="/chat", tags=["chat"])


@chat_router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_chat_sessions(
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """Lists all chat sessions for the authenticated user."""
    return await list_chat_sessions_controller(auth_data=auth_data, db=db)


@chat_router.post("/sessions", response_model=ChatSessionResponse)
async def create_chat_session(
    payload: CreateSessionRequest,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """Creates a new scoped chat session (ALL, FOLDER, DOCUMENT, or CHAPTER)."""
    return await create_chat_session_controller(payload=payload, auth_data=auth_data, db=db)


@chat_router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """Retrieves a specific chat session with its full message history."""
    return await get_chat_session_controller(session_id=session_id, auth_data=auth_data, db=db)


@chat_router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_chat_session(
    session_id: str,
    payload: UpdateSessionRequest,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """Updates a chat session title."""
    return await update_chat_session_controller(
        session_id=session_id, payload=payload, auth_data=auth_data, db=db
    )


@chat_router.delete("/sessions/{session_id}", response_model=dict)
async def delete_chat_session(
    session_id: str,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """Deletes a chat session and all associated messages."""
    return await delete_chat_session_controller(
        session_id=session_id, auth_data=auth_data, db=db
    )


@chat_router.post("/sessions/{session_id}/message")
async def send_chat_message(
    session_id: str,
    payload: SendMessageRequest,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """
    Sends a message to the scoped Google ADK RAG agent.
    Saves user and assistant messages to the database and returns response with citations.
    """
    return await send_chat_message_controller(
        session_id=session_id, payload=payload, auth_data=auth_data, db=db
    )


@chat_router.post("/query", response_model=QueryResponse)
async def query_documents(
    payload: QueryRequest,
    auth_data: tuple[User, str] = Depends(get_current_user_and_token),
    db: Session = Depends(get_db),
):
    """
    Unified scoped semantic search over document chunks stored in ChromaDB.
    Supports ALL, DOCUMENT, CHAPTER, and FOLDER query scopes with PostgreSQL ownership validation.
    """
    return await query_documents_controller(payload=payload, auth_data=auth_data, db=db)
