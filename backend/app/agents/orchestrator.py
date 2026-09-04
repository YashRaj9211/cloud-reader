"""
Multi-Agent Orchestrator & Memory Manager
=========================================
Orchestrates agent execution, memory management, session lifecycle,
and PostgreSQL rehydration across the root agent and specialized sub-agents.
"""

import logging
from typing import List, Optional, Tuple

from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.adk.memory import InMemoryMemoryService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from sqlalchemy.orm import Session

from app.agents.chat_agent.agent import chat_agent
from app.agents.root_agent.agent import root_agent
from app.models.chat import ChatMessage, ChatSession
from app.schema.chat import SourceCitation
from app.schema.enums import MessageRole

logger = logging.getLogger(__name__)

APP_NAME = "cloud_pdf_reader"


class ADKAgentOrchestrator:
    """
    Central Google ADK 2.0 Orchestrator:
    - In-Memory & Distributed Session state management
    - Memory management across interactions
    - PostgreSQL rehydration for session persistence
    - Runner execution and event handling
    """

    def __init__(self, root: Optional[BaseAgent] = None, app_name: str = APP_NAME):
        self.app_name = app_name
        self._root_agent = root or root_agent
        self._chat_agent = chat_agent
        self._session_service = InMemorySessionService()
        self._memory_service = InMemoryMemoryService()
        self._runner: Optional[Runner] = None

    @property
    def root_agent(self) -> BaseAgent:
        return self._root_agent

    @property
    def chat_agent(self) -> BaseAgent:
        return self._chat_agent

    # For backward-compatibility with code expecting orchestrator.agent
    @property
    def agent(self) -> BaseAgent:
        return self._chat_agent

    @property
    def session_service(self) -> InMemorySessionService:
        return self._session_service

    @property
    def memory_service(self) -> InMemoryMemoryService:
        return self._memory_service

    @property
    def runner(self) -> Runner:
        if self._runner is None:
            self._runner = Runner(
                agent=self._chat_agent,
                app_name=self.app_name,
                session_service=self._session_service,
                memory_service=self._memory_service,
            )
        return self._runner

    async def get_or_create_session(
        self,
        session_id: str,
        user_id: str,
        scope_type: str,
        scope_id: Optional[str] = None,
        db: Optional[Session] = None,
    ):
        """
        Retrieves or initializes an ADK session, rehydrating prior PostgreSQL messages if new to cache.
        """
        try:
            adk_session = await self._session_service.get_session(
                app_name=self.app_name,
                user_id=user_id,
                session_id=session_id,
            )
        except Exception:
            adk_session = None

        if adk_session is None:
            adk_session = await self._session_service.create_session(
                app_name=self.app_name,
                user_id=user_id,
                session_id=session_id,
                state={
                    "user_id": user_id,
                    "scope_type": scope_type,
                    "scope_id": scope_id or "",
                    "session_id": session_id,
                    "last_sources": [],
                },
            )

            # Rehydrate previous messages from PostgreSQL if DB session is provided
            if db is not None:
                prior_messages = (
                    db.query(ChatMessage)
                    .filter(ChatMessage.session_id == session_id)
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

        # Keep state parameters synchronized for the current turn
        adk_session.state["user_id"] = user_id
        adk_session.state["scope_type"] = scope_type
        adk_session.state["scope_id"] = scope_id or ""
        adk_session.state["last_sources"] = []

        return adk_session

    async def execute_turn(
        self,
        session: ChatSession,
        user_message: str,
        user_id: str,
        db: Session,
    ) -> Tuple[str, List[SourceCitation]]:
        """
        Orchestrates an agent conversational turn:
        1. Ensures session is loaded & rehydrated.
        2. Executes the ADK Runner asynchronously.
        3. Collects response parts and extracts source citations.
        4. Updates long-term memory with completed turn.
        """
        adk_session = await self.get_or_create_session(
            session_id=session.id,
            user_id=user_id,
            scope_type=session.scope_type.value,
            scope_id=session.scope_id or "",
            db=db,
        )

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
            app_name=self.app_name,
            user_id=user_id,
            session_id=session.id,
        )
        raw_sources = updated_session.state.get("last_sources", [])
        citations = [SourceCitation(**src) for src in raw_sources]

        assistant_text = "".join(assistant_parts).strip()
        if not assistant_text:
            assistant_text = "I could not generate an answer based on the indexed document passages."

        # Memory management: commit session turn to long-term memory
        try:
            await self._memory_service.add_session_to_memory(updated_session)
        except Exception as mem_err:
            logger.debug("Could not add session turn to memory service: %s", mem_err)

        return assistant_text, citations

    async def execute_turn_stream(
        self,
        session: ChatSession,
        user_message: str,
        user_id: str,
        db: Session,
    ):
        """
        Orchestrates an agent conversational turn with streaming output:
        1. Yields JSON chunks containing text as they are generated.
        2. Yields a final JSON chunk containing the full text and citations.
        """
        adk_session = await self.get_or_create_session(
            session_id=session.id,
            user_id=user_id,
            scope_type=session.scope_type.value,
            scope_id=session.scope_id or "",
            db=db,
        )

        assistant_parts: List[str] = []

        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_message)],
            ),
        ):
            # Stream partial chunks as they arrive
            if getattr(event, "partial", False) and event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        yield {"type": "chunk", "text": part.text}

            # Collect the final complete response text for memory and the final payload
            if event.is_final_response() and event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        assistant_parts.append(part.text)

        # Retrieve updated sources from state
        updated_session = await self._session_service.get_session(
            app_name=self.app_name,
            user_id=user_id,
            session_id=session.id,
        )
        raw_sources = updated_session.state.get("last_sources", [])
        citations = [SourceCitation(**src) for src in raw_sources]

        assistant_text = "".join(assistant_parts).strip()
        if not assistant_text:
            assistant_text = "I could not generate an answer based on the indexed document passages."
            yield {"type": "chunk", "text": assistant_text}

        # Memory management: commit session turn to long-term memory
        try:
            await self._memory_service.add_session_to_memory(updated_session)
        except Exception as mem_err:
            logger.debug("Could not add session turn to memory service: %s", mem_err)

        yield {
            "type": "done",
            "text": assistant_text,
            "sources": [c.model_dump() for c in citations]
        }

# Default singleton orchestrator instance
adk_agent = ADKAgentOrchestrator()
