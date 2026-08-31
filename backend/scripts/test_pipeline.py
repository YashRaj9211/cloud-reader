"""
Integration and End-to-End Test for the Kafka PDF Indexing Pipeline.

Tests:
1. DocumentStorageService (source.pdf and parsed.md filesystem persistence)
2. Markdown text splitting (header-aware + recursive chunking)
3. Direct worker function execution (Fetch -> Parse -> Chunk -> Embed -> Store)
4. ChromaDB vector insertion verification
"""

import os
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone

# Ensure backend root is in sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from dotenv import load_dotenv
load_dotenv(backend_root / ".env")

import asyncio
from app.services.document_storage_service import document_storage_service
from app.functions.text_splitter import markdown_splitter
from app.pipeline.schemas import (
    PdfIndexRequestEvent,
    PdfFetchedEvent,
    PdfParsedEvent,
    PdfChunkedEvent,
    ChunkPayload,
    EmbeddedChunkPayload,
    PdfEmbeddedEvent,
)
from app.services.vector_store_service import vector_store_service, ChunkDocument, ChunkMetadata
from app.configs.chroma import get_document_chunks_collection


async def test_document_storage():
    print("\n--- [1/4] Testing DocumentStorageService ---")
    test_user_id = "test-user-" + str(uuid.uuid4())[:8]
    test_doc_id = "test-doc-" + str(uuid.uuid4())[:8]

    # Save PDF
    dummy_pdf_bytes = b"%PDF-1.4 Dummy PDF Content for Testing Kafka Pipeline"
    saved_pdf_path = document_storage_service.save_pdf(test_user_id, test_doc_id, dummy_pdf_bytes)
    assert saved_pdf_path.exists(), "source.pdf should exist"
    assert document_storage_service.has_pdf(test_user_id, test_doc_id) is True, "has_pdf should return True"
    print(f"  [OK] Saved PDF to {saved_pdf_path}")

    # Save Markdown
    dummy_markdown = (
        "# Sample Document Title\n\n"
        "## Chapter 1: Cloud Architecture\n"
        "This chapter explains asynchronous event-driven streaming with Apache Kafka.\n\n"
        "### Section 1.1: Decoupled Stages\n"
        "Each processing stage operates as an isolated consumer group: fetch, parse, chunk, embed, and store.\n\n"
        "## Chapter 2: Vector Search\n"
        "Vector databases like ChromaDB store high-dimensional embeddings for semantic retrieval."
    )
    saved_md_path = document_storage_service.save_markdown(test_user_id, test_doc_id, dummy_markdown)
    assert saved_md_path.exists(), "parsed.md should exist"
    assert document_storage_service.has_markdown(test_user_id, test_doc_id) is True, "has_markdown should return True"
    read_back = document_storage_service.read_markdown(test_user_id, test_doc_id)
    assert read_back == dummy_markdown, "Read-back Markdown must match original"
    print(f"  [OK] Saved and verified Markdown at {saved_md_path}")

    # Cleanup test data
    document_storage_service.cleanup_document(test_user_id, test_doc_id)
    print("  [OK] Cleaned up temporary test document folder.")


def test_markdown_splitter():
    print("\n--- [2/4] Testing Markdown Text Splitter ---")
    sample_doc = (
        "# Introduction to Distributed Systems\n\n"
        "A distributed system is a computing environment in which various components are spread across multiple computers.\n\n"
        "## 1. Fault Tolerance\n"
        "Fault tolerance is the property that enables a system to continue operating properly in the event of failure.\n\n"
        "### 1.1 Replication\n"
        "Data replication ensures high availability by copying data across multiple nodes.\n\n"
        "## 2. Event Streaming with Kafka\n"
        "Kafka provides durable, append-only logs for fast message distribution."
    )
    chunks = markdown_splitter(sample_doc, chunk_size=300, chunk_overlap=50)
    assert len(chunks) >= 3, f"Expected at least 3 chunks, got {len(chunks)}"
    for i, c in enumerate(chunks):
        assert len(c.strip()) > 0, "Chunks must not be empty"
        print(f"  Chunk {i+1} ({len(c)} chars): {c[:60]}...")
    print(f"  [OK] Successfully split markdown into {len(chunks)} chunks.")


async def test_chroma_storage():
    print("\n--- [3/4] Testing ChromaDB Vector Store Integration ---")
    test_user_id = "test-user-chroma"
    test_doc_id = "test-doc-chroma"

    chunks = [
        ChunkDocument(
            id=str(uuid.uuid4()),
            document="Kafka decouples producers and consumers using distributed event logs.",
            metadata=ChunkMetadata(user_id=test_user_id, document_id=test_doc_id, chunk_index=0),
            embedding=[0.05] * 1024,
        ),
        ChunkDocument(
            id=str(uuid.uuid4()),
            document="ChromaDB executes cosine similarity search over vector spaces.",
            metadata=ChunkMetadata(user_id=test_user_id, document_id=test_doc_id, chunk_index=1),
            embedding=[0.1] * 1024,
        ),
    ]

    # Upsert
    vector_store_service.upsert_chunks(chunks)
    print("  [OK] Upserted 2 chunks into document_chunks collection.")

    # Search
    results = vector_store_service.search(
        query_embedding=[0.1] * 1024,
        where={"$and": [{"user_id": {"$eq": test_user_id}}, {"document_id": {"$eq": test_doc_id}}]},
        n_results=2,
    )
    assert len(results) >= 1, "Expected search results from ChromaDB"
    print(f"  [OK] Search retrieved {len(results)} chunks. Top result: {results[0].document}")

    # Delete chunks for test document
    vector_store_service.delete_chunks_by_document(document_id=test_doc_id, user_id=test_user_id)
    print("  [OK] Deleted test chunks from ChromaDB.")


async def test_end_to_end_worker_chain():
    print("\n--- [4/4] Testing Worker Pipeline Logic Chain ---")
    test_user_id = "test-e2e-user"
    test_doc_id = "test-e2e-doc"

    # 1. Simulate Stage 1 (Fetch): Save mock PDF
    pdf_bytes = b"%PDF-1.4 Mock document for pipeline worker test"
    pdf_path = document_storage_service.save_pdf(test_user_id, test_doc_id, pdf_bytes)
    print(f"  [Stage 1 Mock] Saved PDF to {pdf_path}")

    # 2. Simulate Stage 2 (Parse): Create markdown text and save to parsed.md
    markdown_text = (
        "# Artificial Intelligence in Document Systems\n\n"
        "## Neural Embeddings\n"
        "Embeddings project high-dimensional sparse textual data into dense continuous vector spaces.\n\n"
        "## Scoped Semantic Search\n"
        "Scoped search allows multi-tenant retrieval partitioned by user and document."
    )
    md_path = document_storage_service.save_markdown(test_user_id, test_doc_id, markdown_text)
    print(f"  [Stage 2 Mock] Saved Markdown to {md_path}")

    # 3. Simulate Stage 3 (Chunk): Split markdown
    raw_chunks = markdown_splitter(markdown_text)
    chunk_payloads = [
        ChunkPayload(
            chunk_id=str(uuid.uuid4()),
            document=txt,
            chunk_index=i,
            page_number=1,
            chapter_id="",
            metadata={"user_id": test_user_id, "document_id": test_doc_id, "chunk_index": i},
        )
        for i, txt in enumerate(raw_chunks)
    ]
    print(f"  [Stage 3 Mock] Produced {len(chunk_payloads)} chunks from Markdown.")

    # 4. Simulate Stage 4 (Embed): Attach mock/real embeddings
    embedded_chunks = [
        EmbeddedChunkPayload(
            chunk_id=cp.chunk_id,
            document=cp.document,
            page_number=cp.page_number,
            chunk_index=cp.chunk_index,
            chapter_id=cp.chapter_id,
            embedding=[0.02 * (i + 1)] * 1024,
            metadata=cp.metadata,
        )
        for i, cp in enumerate(chunk_payloads)
    ]
    print(f"  [Stage 4 Mock] Attached {len(embedded_chunks)} vector embeddings.")

    # 5. Simulate Stage 5 (Store): Upsert into ChromaDB
    from app.pipeline.workers.store_worker import process_store_message
    event = PdfEmbeddedEvent(
        document_id=test_doc_id,
        user_id=test_user_id,
        embedded_chunks=embedded_chunks,
        batch_index=0,
        total_batches=1,
        total_chunks=len(embedded_chunks),
    )
    await process_store_message(event.model_dump())
    print("  [Stage 5 Mock] Successfully processed store message in ChromaDB.")

    # Verify search
    search_results = vector_store_service.search(
        query_embedding=[0.02] * 1024,
        where={"$and": [{"user_id": {"$eq": test_user_id}}, {"document_id": {"$eq": test_doc_id}}]},
        n_results=5,
    )
    assert len(search_results) == len(chunk_payloads), f"Expected {len(chunk_payloads)} results, got {len(search_results)}"
    print(f"  [Verification] Confirmed {len(search_results)} chunks indexed in ChromaDB.")

    # Clean up
    vector_store_service.delete_chunks_by_document(document_id=test_doc_id, user_id=test_user_id)
    document_storage_service.cleanup_document(test_user_id, test_doc_id)
    print("  [Cleanup] Cleaned up test document vectors and storage files.")


async def main():
    print("==================================================")
    print(" Running Kafka Pipeline Verification Suite")
    print("==================================================")
    await test_document_storage()
    test_markdown_splitter()
    await test_chroma_storage()
    await test_end_to_end_worker_chain()
    print("\n==================================================")
    print(" ALL TESTS PASSED SUCCESSFULLY! ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
