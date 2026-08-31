import logging
from typing import List
from app.config import (
    EMBEDDING_MODEL,
    EMBEDDING_KEY,
    EMBEDDING_URL,
    NVIDIA_API_KEY,
)
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Service generating vector embeddings using NVIDIA AI Endpoints.
    """

    def __init__(self):
        self._embeddings = None

    @property
    def embeddings(self) -> NVIDIAEmbeddings:
        if self._embeddings is None:
            api_key = EMBEDDING_KEY or NVIDIA_API_KEY
            model = EMBEDDING_MODEL or "nvidia/nemotron-3-embed-1b"
            kwargs = {"model": model}
            if api_key:
                kwargs["api_key"] = api_key
            if EMBEDDING_URL:
                kwargs["base_url"] = EMBEDDING_URL

            self._embeddings = NVIDIAEmbeddings(**kwargs)
            logger.info("Initialized NVIDIAEmbeddings with model: %s", model)
        return self._embeddings

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Generates embeddings for a list of document chunk texts.
        """
        if not texts:
            return []
        try:
            return self.embeddings.embed_documents(texts)
        except Exception as e:
            logger.error("Failed to generate document embeddings: %s", e)
            raise

    def embed_query(self, text: str) -> List[float]:
        """
        Generates embedding for a search query string.
        """
        if not text:
            raise ValueError("Query text cannot be empty.")
        try:
            return self.embeddings.embed_query(text)
        except Exception as e:
            logger.error("Failed to generate query embedding: %s", e)
            raise


embedding_service = EmbeddingService()
