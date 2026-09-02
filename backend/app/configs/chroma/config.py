import os
from typing import Optional

CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", "8001"))
CHROMA_SERVER_HOST: str = os.getenv("CHROMA_SERVER_HOST", "chromadb")
CHROMA_SERVER_PORT: int = int(os.getenv("CHROMA_SERVER_PORT", "8000"))
DOCUMENT_CHUNKS_COLLECTION: str = "document_chunks"

_chroma_client = None
_document_chunks_collection = None


def get_chroma_client():
    """
    Returns a singleton ChromaDB HttpClient connected to the container.
    """
    global _chroma_client
    if _chroma_client is None:
        import chromadb
        from chromadb.config import Settings
        _chroma_client = chromadb.HttpClient(
            host=CHROMA_HOST,
            port=CHROMA_PORT,
            settings=Settings(
                chroma_server_host=CHROMA_HOST,
                chroma_server_http_port=CHROMA_PORT,
            ),
        )
    return _chroma_client


def get_document_chunks_collection():
    """
    Returns the single logical Chroma collection for document chunks.
    All document chunks across all users and documents live in this collection
    and are filtered using metadata attributes (user_id, document_id, etc.).
    """
    global _document_chunks_collection
    if _document_chunks_collection is None:
        client = get_chroma_client()
        _document_chunks_collection = client.get_or_create_collection(
            name=DOCUMENT_CHUNKS_COLLECTION,
            metadata={"hnsw:space": "cosine"}
        )
    return _document_chunks_collection

