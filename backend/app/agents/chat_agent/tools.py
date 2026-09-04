"""
Chat Agent Tools
================
Includes scoped document context retrieval from ChromaDB and memory lookup.
"""

import logging
from typing import Any, Dict, List
from google.adk.tools import ToolContext

from app.configs.db.config import SessionLocal
from app.models.chapter import Chapter
from app.models.document import Document
from app.schema.chat import QueryScope
from app.schema.enums import ScopeType
from app.services.query_service import query_service

logger = logging.getLogger(__name__)


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


async def search_conversation_memory(query: str, tool_context: ToolContext) -> dict:
    """Searches agent long-term conversation memory for past discussions, notes, and preferences.

    Args:
        query: The topic or statement to search in prior conversation history.

    Returns:
        dict containing memory search results.
    """
    user_id = tool_context.state.get("user_id", "")
    if not user_id:
        return {"status": "error", "message": "user_id is missing from session state", "memories": []}

    try:
        results = await tool_context.search_memory(query)
        memories = [m.text for m in getattr(results, "memories", []) if hasattr(m, "text")]
        return {"status": "success", "query": query, "count": len(memories), "memories": memories}
    except Exception as e:
        logger.warning("Memory search failed: %s", e)
        return {"status": "empty", "message": "No relevant memories found.", "memories": []}
