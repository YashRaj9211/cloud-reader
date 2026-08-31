import logging
import uuid
from datetime import datetime, timezone
from typing import List, Tuple
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pdf_inspector
from sqlalchemy.orm import Session
from app.models.chapter import Chapter
from app.models.document import Document
from app.schema.enums import DocumentStatus
from app.services.embedding_service import embedding_service
from app.services.vector_store_service import (
    ChunkDocument,
    ChunkMetadata,
    vector_store_service,
)

logger = logging.getLogger(__name__)


class BookIndexer:
    """
    Indexes PDF documents into the single ChromaDB document_chunks collection.
    - Extracts page texts
    - Partitions into chunks
    - Maps chapter IDs to chunks based on page ranges
    - Generates embeddings with NVIDIA AI
    - Upserts chunks to Chroma with strict tenant & relational metadata
    - Updates document status in PostgreSQL
    """

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 150):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def extract_page_texts(self, pdf_bytes: bytes) -> List[Tuple[int, str]]:
        """
        Extracts text from PDF bytes returning a list of (page_number, text).
        Page numbers are 1-indexed.
        """
        pages_data: List[Tuple[int, str]] = []
        try:
            results = pdf_inspector.extract_pages_markdown_bytes(pdf_bytes)
            for item in results:
                page_no = getattr(item, "page", None)
                md_text = getattr(item, "markdown", "") or ""
                if page_no is not None and md_text.strip():
                    pages_data.append((int(page_no), md_text.strip()))
        except Exception as e:
            logger.warning("pdf_inspector markdown extraction failed: %s; trying raw text", e)
            try:
                text_result = pdf_inspector.extract_text_bytes(pdf_bytes)
                if isinstance(text_result, str) and text_result.strip():
                    pages_data.append((1, text_result.strip()))
            except Exception as e2:
                logger.error("All text extraction methods failed: %s", e2)

        return pages_data

    def index_document(
        self,
        document: Document,
        pdf_bytes: bytes,
        db: Session,
    ) -> int:
        """
        Processes PDF bytes for a document, extracts text, chunks it,
        attaches chapter and page metadata, generates embeddings,
        upserts into ChromaDB's single document_chunks collection,
        and marks the document as INDEXED in PostgreSQL.

        Returns total number of chunks indexed.
        """
        user_id = document.user_id
        doc_id = document.id

        # Mark document as PROCESSING
        document.status = DocumentStatus.PROCESSING
        db.commit()

        try:
            # 1. Extract text per page
            page_items = self.extract_page_texts(pdf_bytes)
            if not page_items:
                logger.warning("No text extracted for document %s", doc_id)
                document.status = DocumentStatus.FAILED
                db.commit()
                return 0

            # 2. Get chapters mapped to document to assign chapter_id per page
            chapters = db.query(Chapter).filter(Chapter.document_id == doc_id).all()

            def find_chapter_id(page_num: int) -> str:
                for chap in chapters:
                    if chap.page_start <= page_num <= chap.page_end:
                        return chap.id
                return ""

            # 3. Create chunks with metadata
            chunks: List[ChunkDocument] = []
            chunk_idx = 0

            for page_no, page_text in page_items:
                chap_id = find_chapter_id(page_no)
                split_chunks = self.text_splitter.split_text(page_text)

                for chunk_content in split_chunks:
                    if not chunk_content.strip():
                        continue

                    chunk_id = str(uuid.uuid4())
                    metadata = ChunkMetadata(
                        user_id=user_id,
                        document_id=doc_id,
                        chapter_id=chap_id,
                        page_number=page_no,
                        chunk_index=chunk_idx,
                    )
                    chunks.append(
                        ChunkDocument(
                            id=chunk_id,
                            document=chunk_content,
                            metadata=metadata,
                        )
                    )
                    chunk_idx += 1

            if not chunks:
                document.status = DocumentStatus.FAILED
                db.commit()
                return 0

            # 4. Generate embeddings in batches
            texts = [c.document for c in chunks]
            embeddings = embedding_service.embed_documents(texts)
            for c, emb in zip(chunks, embeddings):
                c.embedding = emb

            # 5. Upsert into ChromaDB document_chunks collection
            vector_store_service.upsert_chunks(chunks)

            # 6. Update document in PostgreSQL
            document.status = DocumentStatus.INDEXED
            document.indexed_at = datetime.now(timezone.utc)
            db.commit()

            logger.info("Successfully indexed %d chunks for document %s", len(chunks), doc_id)
            return len(chunks)

        except Exception as e:
            logger.error("Failed indexing document %s: %s", doc_id, e)
            document.status = DocumentStatus.FAILED
            db.commit()
            raise


book_indexer = BookIndexer()
