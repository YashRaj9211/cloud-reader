import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from google.adk.agents import LlmAgent
from google.adk.events import Event
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.genai import types
from sqlalchemy.orm import Session

from app.config import LLM_MODEL, LLM_URL, NVIDIA_API_KEY
from app.configs.db.config import SessionLocal
from app.models.chapter import Chapter
from app.models.chat import ChatMessage, ChatSession
from app.models.document import Document
from app.schema.chat import QueryScope, SourceCitation
from app.schema.enums import MessageRole, ScopeType
from app.services.query_service import query_service

logger = logging.getLogger(__name__)

RAG_INSTRUCTION = """You are an intelligent, accurate document research and reading assistant for Cloud PDF Reader.
Your primary role is to answer questions based on the user's indexed PDF documents.

CRITICAL OPERATIONAL RULES:
1. Always call the `retrieve_document_context` tool before answering any questions about the content of documents.
2. Ground all answers strictly in the retrieved snippets. Do not make up facts or assumptions.
3. Cite your sources clearly in your response, including the Document Name, Chapter (if available), and Page Number.
4. If the retrieved context is empty or does not contain enough information to answer the question, explicitly state that the information was not found in the selected scope.
5. Provide concise, clear, and well-structured responses using markdown headings and bullet points when appropriate.
"""


def retrieve_document_context(query: str, tool_context: ToolContext) -> dict:
    """Searches indexed document chunks for relevant information matching the query.

    Args:
        query: The semantic search query to find relevant content in indexed documents.

    Returns:
        dict containing status, count, and results with document text, page numbers, chapter, and document IDs.
    """
    user_id = tool_context.state.get("user_id", "")
    scope_type_str = tool_context.state.get("scope_type", "ALL")
    scope_id = tool_context.state.get("scope_id")

    if not user_id:
        return {"status": "error", "message": "user_id is missing from session state", "results": []}

    try:
        scope_type = ScopeType(scope_type_str)
    except ValueError:
        scope_type = ScopeType.ALL

    scope = QueryScope(type=scope_type, id=scope_id)

    with SessionLocal() as db:
        try:
            query_response = query_service.query(
                query_text=query,
                scope=scope,
                user_id=user_id,
                db=db,
                n_results=5,
            )
        except Exception as e:
            logger.warning("Vector store query failed: %s", e)
            return {"status": "error", "message": str(e), "results": []}

        if not query_response.results:
            tool_context.state["last_sources"] = []
            return {
                "status": "empty",
                "message": "No relevant document passages found for the given query in the active scope.",
                "results": [],
            }

        # Cache document names and chapter titles to avoid redundant DB queries
        doc_cache: Dict[str, str] = {}
        chapter_cache: Dict[str, str] = {}

        formatted_sources: List[Dict[str, Any]] = []
        for r in query_response.results:
            doc_id = r.metadata.document_id
            chap_id = r.metadata.chapter_id or ""

            if doc_id not in doc_cache:
                doc = db.query(Document).filter(Document.id == doc_id).first()
                doc_cache[doc_id] = doc.filename if doc else "Document"

            chap_title = None
            if chap_id and chap_id not in chapter_cache:
                chap = db.query(Chapter).filter(Chapter.id == chap_id).first()
                chapter_cache[chap_id] = chap.title if chap else ""
                chap_title = chapter_cache.get(chap_id)
            elif chap_id:
                chap_title = chapter_cache.get(chap_id)

            relevance = round(1.0 - (r.distance or 0.0), 3) if r.distance is not None else None

            formatted_sources.append({
                "document_id": doc_id,
                "document_name": doc_cache[doc_id],
                "chapter_id": chap_id or None,
                "chapter_title": chap_title,
                "page_number": r.metadata.page_number,
                "chunk_index": r.metadata.chunk_index,
                "content": r.document,
                "relevance_score": relevance,
            })

        # Save structured citations into tool_context.state for the API response
        tool_context.state["last_sources"] = formatted_sources

        return {
            "status": "success",
            "query": query,
            "count": len(formatted_sources),
            "results": [
                {
                    "document_name": s["document_name"],
                    "chapter_title": s["chapter_title"],
                    "page_number": s["page_number"],
                    "snippet": s["content"],
                }
                for s in formatted_sources
            ],
        }


def create_lite_llm_model() -> LiteLlm:
    """Configures the LiteLlm model client based on environment settings."""
    model_name = os.getenv("LLM_MODEL") or LLM_MODEL or "nvidia/nemotron-3-super-120b-a12b"
    api_base = os.getenv("LLM_URL") or LLM_URL or "https://integrate.api.nvidia.com/v1"
    api_key = os.getenv("LLM_KEY") or os.getenv("NVIDIA_API_KEY") or NVIDIA_API_KEY or ""

    kwargs: Dict[str, Any] = {}
    if api_base:
        kwargs["api_base"] = api_base
    if api_key:
        kwargs["api_key"] = api_key

    # Custom provider for OpenAI-compatible endpoints like NVIDIA NIM
    if api_base and "integrate.api.nvidia.com" in api_base:
        kwargs["custom_llm_provider"] = "openai"

    return LiteLlm(model=model_name, **kwargs)


def create_rag_agent() -> LlmAgent:
    """Initializes the Google ADK LlmAgent equipped with document retrieval."""
    llm = create_lite_llm_model()
    return LlmAgent(
        name="cloud_pdf_rag_agent",
        model=llm,
        instruction=RAG_INSTRUCTION,
        tools=[retrieve_document_context],
    )


class ADKChatService:
    """
    Orchestrates the Google ADK Runner, in-memory session sync, and PostgreSQL persistence.
    """

    def __init__(self):
        # ponytail: In-memory ADK runner session service rehydrated on demand from PostgreSQL.
        # Ceiling: Single-process runner cache.
        # Upgrade path: Connect DatabaseSessionService with asyncpg engine for distributed multi-worker runners.
        self._session_service = InMemorySessionService()
        self._agent: Optional[LlmAgent] = None
        self._runner: Optional[Runner] = None

    @property
    def agent(self) -> LlmAgent:
        if self._agent is None:
            self._agent = create_rag_agent()
        return self._agent

    @property
    def runner(self) -> Runner:
        if self._runner is None:
            self._runner = Runner(
                agent=self.agent,
                app_name="cloud_pdf_reader",
                session_service=self._session_service,
            )
        return self._runner

    async def execute_chat(
        self,
        session: ChatSession,
        user_message: str,
        user_id: str,
        db: Session,
    ) -> Tuple[str, List[SourceCitation]]:
        """
        Executes a multi-turn conversation turn:
        1. Ensures ADK session exists and is rehydrated with prior DB messages.
        2. Sets active scope parameters in session state.
        3. Executes the ADK runner and collects the assistant's final response and citations.
        """
        app_name = "cloud_pdf_reader"

        try:
            adk_session = await self._session_service.get_session(
                app_name=app_name,
                user_id=user_id,
                session_id=session.id,
            )
        except Exception:
            adk_session = None

        if adk_session is None:
            adk_session = await self._session_service.create_session(
                app_name=app_name,
                user_id=user_id,
                session_id=session.id,
                state={
                    "user_id": user_id,
                    "scope_type": session.scope_type.value,
                    "scope_id": session.scope_id or "",
                    "session_id": session.id,
                    "last_sources": [],
                },
            )
            # Rehydrate previous messages from PostgreSQL
            prior_messages = (
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == session.id)
                .order_by(ChatMessage.created_at.asc())
                .all()
            )
            for msg in prior_messages:
                role = "user" if msg.role == MessageRole.USER else "model"
                evt = Event(
                    content=types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=msg.content)],
                    )
                )
                await self._session_service.append_event(session=adk_session, event=evt)

        # Update scope info for current turn
        adk_session.state["user_id"] = user_id
        adk_session.state["scope_type"] = session.scope_type.value
        adk_session.state["scope_id"] = session.scope_id or ""
        adk_session.state["last_sources"] = []

        assistant_parts: List[str] = []

        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_message)],
            ),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        assistant_parts.append(part.text)

        # Retrieve updated sources from state
        updated_session = await self._session_service.get_session(
            app_name=app_name,
            user_id=user_id,
            session_id=session.id,
        )
        raw_sources = updated_session.state.get("last_sources", [])
        citations = [SourceCitation(**src) for src in raw_sources]

        assistant_text = "".join(assistant_parts).strip()
        if not assistant_text:
            assistant_text = "I could not generate an answer based on the indexed document passages."

        return assistant_text, citations


adk_chat_service = ADKChatService()
