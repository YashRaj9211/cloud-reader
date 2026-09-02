import asyncio
import logging
from typing import List, Optional

from app.configs.kafka.config import create_kafka_consumer
from app.pipeline.constants import (
    TOPIC_PDF_CHUNKED,
    TOPIC_PDF_EMBEDDED,
    GROUP_EMBED,
    EMBEDDING_BATCH_SIZE,
)
from app.pipeline.schemas import (
    PdfChunkedEvent,
    PdfEmbeddedEvent,
    EmbeddedChunkPayload,
)
from app.pipeline.producer import publish_event, publish_to_dlq
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


async def process_embed_message(event_data: dict) -> None:
    """Processes a chunk batch event (Stage 4: Embedding Generation)."""
    doc_id = event_data.get("document_id", "unknown")
    user_id = event_data.get("user_id")

    try:
        chunk_event = PdfChunkedEvent(**event_data)
        user_id = chunk_event.user_id
        doc_id = chunk_event.document_id
        chunks = chunk_event.chunks

        logger.info(
            "[EmbedWorker] Generating embeddings for doc=%s, batch %d/%d (%d chunks)",
            doc_id, chunk_event.batch_index + 1, chunk_event.total_batches, len(chunks)
        )

        texts = [c.document for c in chunks]

        # Generate embeddings in threadpool to keep asyncio loop responsive
        loop = asyncio.get_running_loop()
        embeddings: List[List[float]] = []

        # Sub-batch embeddings if larger than EMBEDDING_BATCH_SIZE
        for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
            sub_texts = texts[i : i + EMBEDDING_BATCH_SIZE]
            sub_embeddings = await loop.run_in_executor(
                None, embedding_service.embed_documents, sub_texts
            )
            embeddings.extend(sub_embeddings)

        if len(embeddings) != len(chunks):
            raise ValueError(
                f"Embedding count mismatch: expected {len(chunks)}, got {len(embeddings)}"
            )

        # Pair chunks with embeddings
        embedded_chunks: List[EmbeddedChunkPayload] = []
        for chunk, emb in zip(chunks, embeddings):
            embedded_chunks.append(
                EmbeddedChunkPayload(
                    chunk_id=chunk.chunk_id,
                    document=chunk.document,
                    page_number=chunk.page_number,
                    chunk_index=chunk.chunk_index,
                    chapter_id=chunk.chapter_id,
                    embedding=emb,
                    metadata=chunk.metadata,
                )
            )

        # Emit next event in pipeline: PDF_EMBEDDED
        next_event = PdfEmbeddedEvent(
            document_id=doc_id,
            user_id=user_id,
            embedded_chunks=embedded_chunks,
            batch_index=chunk_event.batch_index,
            total_batches=chunk_event.total_batches,
            total_chunks=chunk_event.total_chunks,
        )
        await publish_event(TOPIC_PDF_EMBEDDED, next_event, key=doc_id)
        logger.info(
            "[EmbedWorker] Successfully queued embedded batch %d/%d for doc %s to [%s]",
            chunk_event.batch_index + 1, chunk_event.total_batches, doc_id, TOPIC_PDF_EMBEDDED
        )

    except Exception as e:
        logger.error("[EmbedWorker] Error embedding document %s: %s", doc_id, e)
        await publish_to_dlq(
            stage="EMBED",
            document_id=doc_id,
            error=e,
            user_id=user_id,
            original_event=event_data,
        )


async def run_embed_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    """Kafka Consumer Loop for Stage 4 (Embed)."""
    consumer = create_kafka_consumer(
        topic=TOPIC_PDF_CHUNKED,
        group_id=GROUP_EMBED,
    )
    await consumer.start()
    logger.info("EmbedWorker consumer started on topic [%s]", TOPIC_PDF_CHUNKED)

    try:
        while stop_event is None or not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=1000, max_records=5)
            for topic_partition, messages in msg_batch.items():
                for message in messages:
                    await process_embed_message(message.value)
    except asyncio.CancelledError:
        logger.info("EmbedWorker cancelled.")
    finally:
        await consumer.stop()
        logger.info("EmbedWorker consumer stopped.")
