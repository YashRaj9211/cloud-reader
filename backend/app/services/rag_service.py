"""
RAG Service
===========
Orchestrates the full retrieval-augmented generation pipeline:
  1. Embed the user's query
  2. Retrieve top-K chunks from ChromaDB
  3. Rerank with NVIDIA NV-RerankQA
  4. Build a prompt and call the NVIDIA LLM
  5. Return the answer + source citations

This service is used by the synchronous /chat endpoint.
It does NOT queue background tasks; it runs in the FastAPI request/response cycle.
"""
from typing import List, Dict, Any, AsyncGenerator

from openai import AsyncOpenAI

from app.config import (
    NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_LLM_MODEL,
    RAG_TOP_K,
)
from app.services.embedding_service import embed_query
from app.services.chroma_service import query_collection
from app.services.reranking_service import rerank_chunks


# ---------------------------------------------------------------------------
# LLM client (async for streaming support)
# ---------------------------------------------------------------------------

_llm = AsyncOpenAI(
    api_key=NVIDIA_API_KEY,
    base_url=NVIDIA_BASE_URL,
)

# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a knowledgeable reading assistant. You answer questions about a book
based strictly on the provided excerpts. Always cite the page numbers when
referencing specific information. If the answer cannot be found in the
provided excerpts, say so honestly — do not hallucinate.
"""


def _build_prompt(query: str, chunks: List[Dict[str, Any]]) -> str:
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        page_info = f"[Page {chunk['page']}]" if chunk.get("page") else ""
        context_parts.append(f"Excerpt {i} {page_info}:\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)
    return f"Context from the book:\n\n{context}\n\n---\n\nQuestion: {query}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def answer_question(
    query: str,
    book_id: str,
    user_id: str,
    top_k: int = RAG_TOP_K,
) -> Dict[str, Any]:
    """
    Full RAG pipeline: embed → retrieve → rerank → generate.

    Returns
    -------
    {
        "answer":   str,                  # LLM response
        "sources":  List[Dict[str, Any]], # reranked chunks used
    }
    """
    # 1. Embed the query
    query_vector = embed_query(query)

    # 2. Retrieve from ChromaDB
    retrieved = query_collection(
        user_id=user_id,
        book_id=book_id,
        query_embedding=query_vector,
        top_k=top_k,
    )

    if not retrieved:
        return {
            "answer": "I couldn't find any relevant content in this book for your question.",
            "sources": [],
        }

    # 3. Rerank
    reranked = rerank_chunks(query=query, chunks=retrieved)

    # 4. Build prompt and call LLM
    user_message = _build_prompt(query, reranked)

    response = await _llm.chat.completions.create(
        model=NVIDIA_LLM_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    answer = response.choices[0].message.content or ""

    return {
        "answer": answer,
        "sources": reranked,
    }


async def stream_answer(
    query: str,
    book_id: str,
    user_id: str,
    top_k: int = RAG_TOP_K,
) -> AsyncGenerator[str, None]:
    """
    Streaming version of answer_question.
    Yields LLM response tokens as they arrive (SSE-ready).

    Usage:
        async for token in stream_answer(...):
            yield f"data: {token}\n\n"
    """
    query_vector = embed_query(query)
    retrieved = query_collection(
        user_id=user_id,
        book_id=book_id,
        query_embedding=query_vector,
        top_k=top_k,
    )
    reranked = rerank_chunks(query=query, chunks=retrieved)
    user_message = _build_prompt(query, reranked)

    stream = await _llm.chat.completions.create(
        model=NVIDIA_LLM_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
        max_tokens=1024,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
