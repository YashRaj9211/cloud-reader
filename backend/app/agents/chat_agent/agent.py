"""
Chat Agent Definition
=====================
Defines the specialized LlmAgent for document conversation and research.
"""

import os
from typing import Any, Dict
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from app.config import LLM_MODEL, LLM_URL, NVIDIA_API_KEY
from app.agents.chat_agent.prompts import CHAT_AGENT_INSTRUCTION
from app.agents.chat_agent.tools import retrieve_document_context, search_conversation_memory


def create_llm_model() -> LiteLlm:
    """Configures the LiteLlm model client based on environment settings."""
    model_name = os.getenv("LLM_MODEL") or LLM_MODEL or "nvidia/nemotron-3-ultra-550b-a55b"
    api_base = os.getenv("LLM_URL") or LLM_URL or "https://integrate.api.nvidia.com/v1"
    api_key = os.getenv("LLM_KEY") or os.getenv("NVIDIA_API_KEY") or NVIDIA_API_KEY or ""

    kwargs: Dict[str, Any] = {}
    if api_base:
        kwargs["api_base"] = api_base
    if api_key:
        kwargs["api_key"] = api_key

    if api_base and "integrate.api.nvidia.com" in api_base:
        kwargs["custom_llm_provider"] = "openai"
        if not model_name.startswith("openai/"):
            model_name = f"openai/{model_name}"

    return LiteLlm(model=model_name, **kwargs)


def create_chat_agent() -> LlmAgent:
    """Initializes the chat agent equipped with RAG retrieval and memory search tools."""
    llm = create_llm_model()
    return LlmAgent(
        name="cloud_pdf_rag_agent",
        model=llm,
        instruction=CHAT_AGENT_INSTRUCTION,
        description="Specialist agent that searches and answers questions about user PDF documents and reading content.",
        tools=[retrieve_document_context, search_conversation_memory],
    )


# Default chat agent instance
chat_agent = create_chat_agent()
