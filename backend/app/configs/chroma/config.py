import os
from typing import Optional

CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", "8001"))
CHROMA_SERVER_HOST: str = os.getenv("CHROMA_SERVER_HOST", "chromadb")
CHROMA_SERVER_PORT: int = int(os.getenv("CHROMA_SERVER_PORT", "8000"))

_chroma_client = None

def get_chroma_client():
    """
    Returns a singleton ChromaDB HttpClient connected to the container.
    """
    global _chroma_client
    if _chroma_client is None:
        import chromadb
        _chroma_client = chromadb.HttpClient(
            host=CHROMA_HOST,
            port=CHROMA_PORT
        )
    return _chroma_client
