"""
Backend Agents Package
======================
Central hub for all Google ADK 2.0 agents.
Folder Structure:
- `root_agent/`: Coordinator managing agent delegation
- `chat_agent/`: Specialized document research & Q&A agent
- (Future agent folders: `summarizer_agent/`, `notes_agent/`, etc.)
"""

from app.agents.chat_agent import (
    CHAT_AGENT_INSTRUCTION,
    chat_agent,
    create_chat_agent,
    retrieve_document_context,
    search_conversation_memory,
)
from app.agents.orchestrator import ADKAgentOrchestrator, adk_agent
from app.agents.root_agent import (
    ROOT_AGENT_INSTRUCTION,
    create_root_agent,
    root_agent,
)

__all__ = [
    "root_agent",
    "create_root_agent",
    "ROOT_AGENT_INSTRUCTION",
    "chat_agent",
    "create_chat_agent",
    "CHAT_AGENT_INSTRUCTION",
    "retrieve_document_context",
    "search_conversation_memory",
    "ADKAgentOrchestrator",
    "adk_agent",
]
