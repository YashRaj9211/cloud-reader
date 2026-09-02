import os
from typing import List
from app.services.embedding_service import embedding_service


def get_embedd_vectors(query: str) -> List[float]:
    """Generates embedding for a single text string."""
    return embedding_service.embed_query(query)


def get_batch_embeddings(texts: List[str]) -> List[List[float]]:
    """Generates embeddings for a batch of text chunks."""
    return embedding_service.embed_documents(texts)