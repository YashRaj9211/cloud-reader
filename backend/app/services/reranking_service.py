"""
Reranking Service
=================
Re-scores retrieved text chunks against a user query using NVIDIA's
llama-nemotron-rerank-vl-1b-v2 model.

API Reference (from NVIDIA):
  POST https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking
  
  Payload:
    {
      "model": "nvidia/llama-nemotron-rerank-vl-1b-v2",
      "query": {"text": "<query string>"},
      "passages": [
        {"text": "<passage text>"},
        ...
      ]
    }

  Response:
    {
      "rankings": [
        {"index": 0, "logit": 1.5},
        {"index": 1, "logit": -0.3},
        ...
      ]
    }

Falls back gracefully if the reranking endpoint is not configured or
returns an error — returns the original ChromaDB-ranked list truncated to top_n.
"""
from typing import List, Dict, Any, Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import (
    RERANK_API_KEY,
    RERANK_MODEL,
    RERANK_INVOKE_URL,
    RAG_RERANK_TOP_N,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reranking_available() -> bool:
    """Return True only if we have both an API key and a valid invoke URL."""
    return bool(RERANK_API_KEY and RERANK_INVOKE_URL)


@retry(
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    reraise=True,
)
def _call_nvidia_rerank(query: str, passages: List[str]) -> List[float]:
    """
    Calls the NVIDIA reranking endpoint with the exact payload format
    specified in the NVIDIA API documentation.

    Returns a list of relevance logit scores in the same order as `passages`.
    Raises on HTTP error (will be retried up to 2 times by tenacity).
    """
    headers = {
        "Authorization": f"Bearer {RERANK_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    payload = {
        "model": RERANK_MODEL,
        "query": {"text": query},
        "passages": [{"text": p} for p in passages],
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.post(RERANK_INVOKE_URL, headers=headers, json=payload)
        response.raise_for_status()

    data = response.json()

    # Response format: {"rankings": [{"index": int, "logit": float}, ...]}
    rankings: List[Dict[str, Any]] = data.get("rankings", [])

    # Map rankings back to original passage order
    scores = [0.0] * len(passages)
    for rank in rankings:
        idx: int = rank.get("index", 0)
        if 0 <= idx < len(scores):
            scores[idx] = float(rank.get("logit", 0.0))

    return scores


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    top_n: int = RAG_RERANK_TOP_N,
) -> List[Dict[str, Any]]:
    """
    Re-score and filter retrieved text chunks.

    Parameters
    ----------
    query  : the user's question (or chapter title for note generation)
    chunks : list of chunk dicts as returned by chroma_service.query_collection(),
             each with at minimum a "text" key.
    top_n  : how many chunks to keep after reranking

    Returns
    -------
    Subset of chunks sorted by relevance score (highest first),
    with a "rerank_score" field added to each for traceability.

    Graceful degradation: if the reranking endpoint is not configured or
    an error occurs, returns the original list truncated to top_n.
    """
    if not chunks:
        return []

    # No API key / URL configured → skip reranking
    if not _reranking_available():
        return chunks[:top_n]

    try:
        passages = [c["text"] for c in chunks]
        scores = _call_nvidia_rerank(query, passages)

        # Attach scores and sort
        for chunk, score in zip(chunks, scores):
            chunk["rerank_score"] = score

        sorted_chunks = sorted(
            chunks,
            key=lambda c: c.get("rerank_score", 0.0),
            reverse=True,
        )
        return sorted_chunks[:top_n]

    except Exception:
        # Graceful fallback: original ChromaDB ranking, truncated
        return chunks[:top_n]
