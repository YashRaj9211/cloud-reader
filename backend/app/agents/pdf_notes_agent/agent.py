"""
PDF Notes Agent Definition
==========================
Specialized LlmAgent that synthesizes structured revision/study notes
from user prompts and document context, then compiles them to a PDF.
"""

import logging
from google.adk.agents import LlmAgent

from app.agents.chat_agent.agent import create_llm_model
from app.agents.chat_agent.tools import retrieve_document_context, search_conversation_memory
from app.agents.pdf_notes_agent.prompts import PDF_NOTES_AGENT_INSTRUCTION
from app.agents.pdf_notes_agent.tools import create_pdf_note

logger = logging.getLogger(__name__)


def create_pdf_notes_agent() -> LlmAgent:
    """Creates the PDF Notes specialist agent."""
    llm = create_llm_model()
    return LlmAgent(
        name="pdf_notes_agent",
        model=llm,
        instruction=PDF_NOTES_AGENT_INSTRUCTION,
        description=(
            "Specialist agent that generates comprehensive, beautifully formatted PDF study/revision notes "
            "from user requests or document context, rendered via Playwright to a downloadable A4 PDF."
        ),
        tools=[
            retrieve_document_context,
            search_conversation_memory,
            create_pdf_note,
        ],
    )


# Default instance
pdf_notes_agent = create_pdf_notes_agent()
