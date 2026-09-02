import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from app.configs.chroma import get_document_chunks_collection

logger = logging.getLogger(__name__)


@dataclass
class ChunkMetadata:
    user_id: str
    document_id: str
    chapter_id: str = ""
    page_number: int = 1
    chunk_index: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": str(self.user_id),
            "document_id": str(self.document_id),
            "chapter_id": str(self.chapter_id or ""),
            "page_number": int(self.page_number),
            "chunk_index": int(self.chunk_index),
        }


@dataclass
class ChunkDocument:
    id: str
    document: str
    metadata: ChunkMetadata
    embedding: Optional[List[float]] = None


@dataclass
class SearchResult:
    id: str
    document: str
    metadata: Dict[str, Any]
    distance: Optional[float] = None


class VectorStoreService:
    """
    Service managing vector storage in a single ChromaDB collection: 'document_chunks'.
    Tenant isolation and scoped queries are strictly enforced using metadata filters.
    """

    def __init__(self):
        self._collection = None

    @property
    def collection(self):
        if self._collection is None:
            self._collection = get_document_chunks_collection()
        return self._collection

    def upsert_chunks(self, chunks: List[ChunkDocument], batch_size: int = 250) -> None:
        """
        Upserts a list of document chunks with embeddings and metadata
        into the shared 'document_chunks' collection.
        """
        if not chunks:
            return

        col = self.collection
        total = len(chunks)

        for i in range(0, total, batch_size):
            batch = chunks[i : i + batch_size]
            ids = [chunk.id for chunk in batch]
            documents = [chunk.document for chunk in batch]
            metadatas = [chunk.metadata.to_dict() for chunk in batch]
            embeddings = [chunk.embedding for chunk in batch if chunk.embedding is not None]

            kwargs: Dict[str, Any] = {
                "ids": ids,
                "documents": documents,
                "metadatas": metadatas,
            }
            if len(embeddings) == len(batch):
                kwargs["embeddings"] = embeddings

            col.upsert(**kwargs)
            logger.info("Upserted %d/%d chunks into document_chunks collection", min(i + batch_size, total), total)

    def delete_chunks_by_document(self, document_id: str, user_id: str) -> None:
        """
        Deletes all chunks belonging to a document under a specific user (tenant isolation).
        """
        col = self.collection
        where = {
            "$and": [
                {"user_id": {"$eq": user_id}},
                {"document_id": {"$eq": document_id}},
            ]
        }
        try:
            col.delete(where=where)
            logger.info("Deleted chunks for document_id=%s, user_id=%s", document_id, user_id)
        except Exception as e:
            logger.error("Error deleting chunks for document_id=%s: %s", document_id, e)
            raise

    def delete_chunks_by_user(self, user_id: str) -> None:
        """
        Deletes all chunks belonging to a user (e.g. account wipe).
        """
        col = self.collection
        where = {"user_id": {"$eq": user_id}}
        try:
            col.delete(where=where)
            logger.info("Deleted all chunks for user_id=%s", user_id)
        except Exception as e:
            logger.error("Error deleting chunks for user_id=%s: %s", user_id, e)
            raise

    def count_chunks_for_document(self, document_id: str, user_id: str) -> int:
        """
        Returns the number of chunks present in ChromaDB for a specific document and user.
        Returns 0 if no chunks exist or if ChromaDB is unreachable.
        """
        try:
            col = self.collection
            where = {
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"document_id": {"$eq": document_id}},
                ]
            }
            res = col.get(where=where, include=[])
            if res and "ids" in res:
                return len(res["ids"])
            return 0
        except Exception as e:
            logger.warning("Failed to count chunks in ChromaDB for document_id=%s, user_id=%s: %s", document_id, user_id, e)
            return 0

    def has_chunks_for_document(self, document_id: str, user_id: str) -> bool:
        """
        Checks whether at least one chunk exists in ChromaDB for the given document and user.
        """
        return self.count_chunks_for_document(document_id, user_id) > 0

    def search(
        self,
        query_embedding: List[float],
        where: Optional[Dict[str, Any]] = None,
        n_results: int = 10,
    ) -> List[SearchResult]:
        """
        Executes a similarity search against the document_chunks collection
        filtered by the provided where clause.
        """
        col = self.collection
        query_params: Dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            query_params["where"] = where

        res = col.query(**query_params)

        results: List[SearchResult] = []
        ids_list = res.get("ids", [[]])[0]
        docs_list = res.get("documents", [[]])[0]
        metas_list = res.get("metadatas", [[]])[0]
        dists_list = res.get("distances", [[]])[0] if res.get("distances") else [None] * len(ids_list)

        for cid, doc, meta, dist in zip(ids_list, docs_list, metas_list, dists_list):
            results.append(
                SearchResult(
                    id=cid,
                    document=doc,
                    metadata=meta or {},
                    distance=dist,
                )
            )

        return results


vector_store_service = VectorStoreService()

