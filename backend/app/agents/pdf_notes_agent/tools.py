"""
PDF Notes Agent Tools
=====================
Provides the `create_pdf_note` tool that takes structured HTML from the LLM,
renders it via Playwright, saves the PDF, and returns metadata + download URL.
"""

import asyncio
import logging
from google.adk.tools import ToolContext

from app.agents.chat_agent.tools import retrieve_document_context  # reuse RAG retrieval

logger = logging.getLogger(__name__)

_DOWNLOAD_BASE_URL = "/api/notes/generated"


def create_pdf_note(
    title: str,
    html_content: str,
    summary: str,
    tool_context: ToolContext,
) -> dict:
    """Compiles the provided structured HTML notes into a downloadable PDF document.

    Args:
        title:        The title of the notes document (e.g. 'Neural Networks — Revision Notes').
        html_content: Complete semantic HTML body content (no <html>/<head> tags).
                      Must include structured sections: summary, key concepts, callouts, review questions.
        summary:      A 1-2 sentence plain-text summary of what the notes cover.

    Returns:
        dict with status, filename, download_url, title, and summary.
    """
    from app.services.pdf_generator import generate_pdf_notes

    if not title or not title.strip():
        return {"status": "error", "message": "A non-empty title is required."}

    if not html_content or len(html_content.strip()) < 100:
        return {"status": "error", "message": "html_content is too short — provide complete structured HTML notes."}

    try:
        # Run the async Playwright generator in the current event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context (ADK runner) — schedule coroutine
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, generate_pdf_notes(title=title, html_body=html_content))
                pdf_bytes, filename = future.result(timeout=60)
        else:
            pdf_bytes, filename = loop.run_until_complete(
                generate_pdf_notes(title=title, html_body=html_content)
            )

        import base64
        b64_pdf = base64.b64encode(pdf_bytes).decode("utf-8")

        # Store the in-memory PDF in session state so orchestrator forwards it directly to the frontend
        pdf_payload = {
            "title": title,
            "filename": filename,
            "data": b64_pdf,
            "size_bytes": len(pdf_bytes),
            "summary": summary,
        }
        tool_context.state["generated_pdf"] = pdf_payload

        logger.info("[PDFNotesTool] Created in-memory note '%s' -> %s (%d bytes)", title, filename, len(pdf_bytes))

        return {
            "status": "success",
            "title": title,
            "filename": filename,
            "size_bytes": len(pdf_bytes),
            "summary": summary,
            "message": (
                f"PDF notes '{title}' ({len(pdf_bytes)} bytes) have been generated in memory and attached "
                f"to this message. The frontend will present an immediate download button."
            ),
        }

    except Exception as e:
        logger.error("[PDFNotesTool] PDF generation failed: %s", e, exc_info=True)
        return {
            "status": "error",
            "message": f"PDF generation failed: {str(e)}",
        }
