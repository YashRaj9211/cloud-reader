import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from app.configs.kafka.config import create_kafka_consumer
from app.configs.db.config import SessionLocal
from app.models.document import Document
from app.models.document_processing import DocumentProcessing
from app.schema.enums import DocumentStatus
from app.pipeline.constants import (
    TOPIC_PDF_EMBEDDED,
    GROUP_STORE,
)
from app.pipeline.schemas import PdfEmbeddedEvent
from app.pipeline.producer import publish_to_dlq
from app.services.vector_store_service import (
    ChunkDocument,
    ChunkMetadata,
    vector_store_service,
)

logger = logging.getLogger(__name__)


async def process_store_message(event_data: dict) -> None:
    """Processes an embedded chunks batch event (Stage 5: ChromaDB Storage & Final Status Update)."""
    doc_id = event_data.get("document_id", "unknown")
    user_id = event_data.get("user_id")

    try:
        embed_event = PdfEmbeddedEvent(**event_data)
        user_id = embed_event.user_id
        doc_id = embed_event.document_id
        embedded_chunks = embed_event.embedded_chunks
        batch_idx = embed_event.batch_index
        total_batches = embed_event.total_batches

        logger.info(
            "[StoreWorker] Upserting batch %d/%d (%d chunks) for doc=%s to ChromaDB",
            batch_idx + 1, total_batches, len(embedded_chunks), doc_id
        )

        # 1. Map into ChunkDocument objects for ChromaDB
        chunk_docs: List[ChunkDocument] = []
        for ec in embedded_chunks:
            meta = ChunkMetadata(
                user_id=user_id,
                document_id=doc_id,
                chapter_id=ec.chapter_id or "",
                page_number=ec.page_number,
                chunk_index=ec.chunk_index,
            )
            chunk_docs.append(
                ChunkDocument(
                    id=ec.chunk_id,
                    document=ec.document,
                    metadata=meta,
                    embedding=ec.embedding,
                )
            )

        # 2. Upsert chunks into ChromaDB document_chunks collection
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, vector_store_service.upsert_chunks, chunk_docs)

        # 3. Update PostgreSQL status
        is_final_batch = (batch_idx + 1 >= total_batches)
        if SessionLocal:
            db = SessionLocal()
            try:
                rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc_id).first()
                if rec:
                    rec.processed_chunks = (rec.processed_chunks or 0) + len(chunk_docs)
                    if is_final_batch:
                        rec.status = DocumentStatus.INDEXED
                        rec.completed_at = datetime.now(timezone.utc)
                doc = db.query(Document).filter(Document.id == doc_id).first()
                if doc and is_final_batch:
                    doc.status = DocumentStatus.INDEXED
                    doc.indexed_at = datetime.now(timezone.utc)
                db.commit()
            except Exception as dbe:
                logger.error("[StoreWorker] Failed DB update for doc %s: %s", doc_id, dbe)
                db.rollback()
            finally:
                db.close()

        logger.info(
            "[StoreWorker] Stored batch %d/%d for doc %s in ChromaDB. Final batch: %s",
            batch_idx + 1, total_batches, doc_id, is_final_batch
        )

    except Exception as e:
        logger.error("[StoreWorker] Error storing chunks for doc %s: %s", doc_id, e)
        await publish_to_dlq(
            stage="STORE",
            document_id=doc_id,
            error=e,
            user_id=user_id,
            original_event=event_data,
        )


async def run_store_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    """Kafka Consumer Loop for Stage 5 (Store in ChromaDB)."""
    consumer = create_kafka_consumer(
        topic=TOPIC_PDF_EMBEDDED,
        group_id=GROUP_STORE,
    )
    await consumer.start()
    logger.info("StoreWorker consumer started on topic [%s]", TOPIC_PDF_EMBEDDED)

    try:
        while stop_event is None or not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=1000, max_records=5)
            for topic_partition, messages in msg_batch.items():
                for message in messages:
                    await process_store_message(message.value)
    except asyncio.CancelledError:
        logger.info("StoreWorker cancelled.")
    finally:
        await consumer.stop()
        logger.info("StoreWorker consumer stopped.")
