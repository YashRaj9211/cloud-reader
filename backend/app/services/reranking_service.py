"""
Reranking Service
=================
Re-scores a set of retrieved chunks against a query using NVIDIA's
NV-RerankQA-Mistral-4B-v3 model (or whichever RERANK_MODEL is configured).

NVIDIA's reranking API is also OpenAI-compatible and returns a list of
relevance scores. We use these to sort chunks and keep only the top-N.

Falls back gracefully: if the reranking endpoint is not configured or
returns an error, we return the original ranked list unchanged.
"""
from typing import List, Dict, Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import RERANK_API_URL, RERANK_API_KEY, RERANK_MODEL, RAG_RERANK_TOP_N


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reranking_available() -> bool:
    return bool(RERANK_API_URL and RERANK_API_KEY)


@retry(
    retry=retry_if_exception_type(Exception),
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    reraise=False,
)
def _call_rerank_api(query: str, passages: List[str]) -> List[float]:
    """
    Calls NVIDIA's reranking endpoint.
    Returns a list of relevance scores in the same order as `passages`.
    Returns None on failure (caller will fall back).
    """
    url = f"{RERANK_API_URL.rstrip('/')}/ranking"
    headers = {
        "Authorization": f"Bearer {RERANK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": RERANK_MODEL,
        "query": {"text": query},
        "passages": [{"text": p} for p in passages],
    }

    resp = httpx.post(url, json=payload, headers=headers, timeout=30.0)
    resp.raise_for_status()
    data = resp.json()

    # NVIDIA reranking response: {"rankings": [{"index": int, "logit": float}, ...]}
    rankings = data.get("rankings", [])
    scores = [0.0] * len(passages)
    for rank in rankings:
        idx = rank.get("index", 0)
        if idx < len(scores):
            scores[idx] = rank.get("logit", 0.0)

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
    Re-score and filter retrieved chunks.

    Parameters
    ----------
    query  : the user's question
    chunks : list of chunk dicts (as returned by chroma_service.query_collection)
    top_n  : how many chunks to keep after reranking

    Returns
    -------
    Subset of chunks sorted by relevance (most relevant first).
    If reranking is unavailable, returns the original list truncated to top_n.
    """
    if not chunks:
        return []

    if not _reranking_available():
        return chunks[:top_n]

    try:
        passages = [c["text"] for c in chunks]
        scores = _call_rerank_api(query, passages)

        if scores:
            for chunk, score in zip(chunks, scores):
                chunk["rerank_score"] = score
            sorted_chunks = sorted(chunks, key=lambda c: c.get("rerank_score", 0.0), reverse=True)
            return sorted_chunks[:top_n]
        else:
            return chunks[:top_n]

    except Exception:
        # Graceful degradation: return original order
        return chunks[:top_n]
