"""
Embedding Service
=================
Generates text embeddings using NVIDIA's cloud API
(nemotron-3-embed-1b / nv-embedqa-e5-v5 via the OpenAI-compatible endpoint).

The NVIDIA embedding API is identical to the OpenAI embedding API, so we use
the `openai` Python SDK pointed at the NVIDIA base URL.

Key behaviours
--------------
- Batches chunks to respect the API's 2048 token-per-input limit.
- Retries on transient HTTP errors using `tenacity`.
- Returns embeddings in the same order as the input texts.
"""
import time
from typing import List

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_EMBED_MODEL

# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

_client = OpenAI(
    api_key=NVIDIA_API_KEY,
    base_url=NVIDIA_BASE_URL,
)

# NVIDIA nemotron-3-embed-1b input token limit per batch request
_MAX_BATCH_SIZE = 32          # number of texts per API call
_EMBED_INPUT_TYPE = "passage"  # "passage" for indexing, "query" for retrieval


# ---------------------------------------------------------------------------
# Retry decorator
# ---------------------------------------------------------------------------

@retry(
    retry=retry_if_exception_type(Exception),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def _embed_batch(texts: List[str], input_type: str) -> List[List[float]]:
    """Single API call for a batch of texts."""
    response = _client.embeddings.create(
        model=NVIDIA_EMBED_MODEL,
        input=texts,
        encoding_format="float",
        extra_body={"input_type": input_type, "truncate": "END"},
    )
    # Sort by index in case the API returns out-of-order
    sorted_data = sorted(response.data, key=lambda d: d.index)
    return [item.embedding for item in sorted_data]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_texts(
    texts: List[str],
    input_type: str = _EMBED_INPUT_TYPE,
) -> List[List[float]]:
    """
    Embed a list of texts and return the corresponding embedding vectors.

    Parameters
    ----------
    texts      : list of strings to embed
    input_type : "passage" (for indexing) or "query" (for retrieval)

    Returns
    -------
    List of float vectors, same order as `texts`.
    """
    if not texts:
        return []

    all_embeddings: List[List[float]] = []

    for start in range(0, len(texts), _MAX_BATCH_SIZE):
        batch = texts[start : start + _MAX_BATCH_SIZE]
        embeddings = _embed_batch(batch, input_type)
        all_embeddings.extend(embeddings)

    return all_embeddings


def embed_query(query: str) -> List[float]:
    """
    Embed a single query string with the 'query' input_type.
    Use this for retrieval, not for indexing.
    """
    results = embed_texts([query], input_type="query")
    return results[0]
