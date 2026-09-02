import logging
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.chapter import Chapter
from app.models.document import Document
from app.models.folder import DocumentFolder, Folder
from app.schema.chat import (
    ChunkMetadataResponse,
    QueryChunkResult,
    QueryResponse,
    QueryScope,
)
from app.schema.enums import ScopeType
from app.services.embedding_service import embedding_service
from app.services.vector_store_service import SearchResult, vector_store_service

logger = logging.getLogger(__name__)


class QueryService:
    """
    Unified query service for scoped document chunk semantic search.
    Translates user query scopes (ALL, DOCUMENT, CHAPTER, FOLDER) into
    strict ChromaDB metadata filters ensuring multi-tenant isolation.
    """

    def _build_scope_filter_and_validate(
        self,
        scope: QueryScope,
        user_id: str,
        db: Session,
    ) -> Optional[Dict[str, Any]]:
        """
        Validates scope ownership against PostgreSQL and builds Chroma metadata filter.
        Returns None if scope contains no searchable documents (e.g. empty folder).
        """
        # Scope 1: ALL
        if scope.type == ScopeType.ALL:
            return {"user_id": {"$eq": user_id}}

        # Scope 2: DOCUMENT
        if scope.type == ScopeType.DOCUMENT:
            if not scope.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="scope.id is required when scope type is DOCUMENT.",
                )
            doc = (
                db.query(Document)
                .filter(
                    (Document.id == scope.id) | (Document.google_drive_file_id == scope.id),
                    Document.user_id == user_id,
                )
                .first()
            )
            if not doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Document with ID '{scope.id}' not found or does not belong to user.",
                )
            return {
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"document_id": {"$eq": doc.id}},
                ]
            }

        # Scope 3: CHAPTER
        if scope.type == ScopeType.CHAPTER:
            if not scope.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="scope.id is required when scope type is CHAPTER.",
                )
            chapter = (
                db.query(Chapter)
                .join(Document, Chapter.document_id == Document.id)
                .filter(Chapter.id == scope.id, Document.user_id == user_id)
                .first()
            )
            if not chapter:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Chapter with ID '{scope.id}' not found or unauthorized.",
                )
            return {
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"document_id": {"$eq": chapter.document_id}},
                    {"chapter_id": {"$eq": chapter.id}},
                ]
            }

        # Scope 4: FOLDER
        if scope.type == ScopeType.FOLDER:
            if not scope.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="scope.id is required when scope type is FOLDER.",
                )
            folder = (
                db.query(Folder)
                .filter(Folder.id == scope.id, Folder.user_id == user_id)
                .first()
            )
            if not folder:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Folder with ID '{scope.id}' not found or does not belong to user.",
                )

            # Query document IDs belonging to this folder from PostgreSQL
            doc_links = (
                db.query(DocumentFolder.document_id)
                .filter(DocumentFolder.folder_id == folder.id)
                .all()
            )
            document_ids = [row[0] for row in doc_links]

            # If folder has no documents, return None to short-circuit search
            if not document_ids:
                logger.info("Folder %s has no documents linked; returning empty results.", folder.id)
                return None

            return {
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"document_id": {"$in": document_ids}},
                ]
            }

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported scope type: {scope.type}",
        )

    def query(
        self,
        query_text: str,
        scope: QueryScope,
        user_id: str,
        db: Session,
        n_results: int = 5,
    ) -> QueryResponse:
        """
        Executes unified query flow:
        1. Validate ownership & build metadata filter
        2. Generate query embedding
        3. Search vector store
        4. Return formatted results
        """
        if not query_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Query text cannot be empty.",
            )

        where_filter = self._build_scope_filter_and_validate(
            scope=scope, user_id=user_id, db=db
        )

        # Empty folder fast path
        if where_filter is None:
            return QueryResponse(query=query_text, scope=scope, results=[])

        # Generate embedding for the search query
        query_embedding = embedding_service.embed_query(query_text)

        # Query single document_chunks collection with metadata filter
        search_results: List[SearchResult] = vector_store_service.search(
            query_embedding=query_embedding,
            where=where_filter,
            n_results=n_results,
        )

        formatted_results = [
            QueryChunkResult(
                id=sr.id,
                document=sr.document,
                metadata=ChunkMetadataResponse(
                    user_id=str(sr.metadata.get("user_id", "")),
                    document_id=str(sr.metadata.get("document_id", "")),
                    chapter_id=str(sr.metadata.get("chapter_id", "")),
                    page_number=int(sr.metadata.get("page_number", 1)),
                    chunk_index=int(sr.metadata.get("chunk_index", 0)),
                ),
                distance=sr.distance,
            )
            for sr in search_results
        ]

        return QueryResponse(
            query=query_text,
            scope=scope,
            results=formatted_results,
        )


query_service = QueryService()
