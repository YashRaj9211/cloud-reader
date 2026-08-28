"""
ChromaDB Service
================
Manages a single ChromaDB HTTP client and provides helpers to:
  - get or create a per-book collection
  - upsert chunks (with embeddings pre-computed)
  - query for nearest neighbours
  - delete a book's collection (on book deletion)

Collection naming convention:
    "book_{user_id}_{book_id}"
    (ChromaDB collection names must be alphanumeric + underscores, 3-63 chars)

Note: Embeddings are computed OUTSIDE this service (in embedding_service.py)
and passed in as lists so that this service stays stateless.
"""
import re
import hashlib
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.config import Settings

from app.config import CHROMA_HOST, CHROMA_PORT


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client: Optional[chromadb.HttpClient] = None


def get_chroma_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(
            host=CHROMA_HOST,
            port=CHROMA_PORT,
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


# ---------------------------------------------------------------------------
# Collection helpers
# ---------------------------------------------------------------------------

def _collection_name(user_id: str, book_id: str) -> str:
    """
    Derive a stable, ChromaDB-safe collection name from user_id + book_id.
    ChromaDB names: 3-63 chars, alphanumeric + hyphens, no consecutive hyphens,
    can't start/end with hyphen.
    We SHA256-hash the concatenation to guarantee uniqueness and length.
    """
    raw = f"{user_id}_{book_id}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:40]
    return f"book-{digest}"


def get_or_create_collection(user_id: str, book_id: str) -> chromadb.Collection:
    client = get_chroma_client()
    name = _collection_name(user_id, book_id)
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},  # cosine similarity
    )


def delete_collection(user_id: str, book_id: str) -> None:
    """Remove a book's entire vector collection from ChromaDB."""
    client = get_chroma_client()
    name = _collection_name(user_id, book_id)
    try:
        client.delete_collection(name)
    except Exception:
        pass  # collection may not exist yet; ignore


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

def upsert_chunks(
    user_id: str,
    book_id: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
) -> None:
    """
    Store pre-computed embeddings alongside chunk text and metadata.

    Parameters
    ----------
    chunks      : list returned by chunking_service.chunk_markdown()
    embeddings  : parallel list of embedding vectors (same order as chunks)
    """
    if not chunks:
        return

    collection = get_or_create_collection(user_id, book_id)

    ids = [f"{book_id}_chunk_{c['chunk_index']}" for c in chunks]
    documents = [c["text"] for c in chunks]
    metadatas = [
        {
            "book_id": c["book_id"],
            "user_id": c["user_id"],
            "page": c["page"],
            "chunk_index": c["chunk_index"],
        }
        for c in chunks
    ]

    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def query_collection(
    user_id: str,
    book_id: str,
    query_embedding: List[float],
    top_k: int,
) -> List[Dict[str, Any]]:
    """
    Retrieve the top_k most similar chunks for a query embedding.

    Returns a list of dicts:
        {
            "id":           str,
            "text":         str,
            "page":         int,
            "chunk_index":  int,
            "distance":     float,  # lower = more similar (cosine)
        }
    """
    collection = get_or_create_collection(user_id, book_id)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    for doc, meta, dist, cid in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
        results["ids"][0],
    ):
        hits.append({
            "id": cid,
            "text": doc,
            "page": meta.get("page", 0),
            "chunk_index": meta.get("chunk_index", 0),
            "distance": dist,
        })

    return hits


def collection_exists(user_id: str, book_id: str) -> bool:
    """Check whether a book has been indexed into ChromaDB."""
    client = get_chroma_client()
    name = _collection_name(user_id, book_id)
    try:
        client.get_collection(name)
        return True
    except Exception:
        return False
