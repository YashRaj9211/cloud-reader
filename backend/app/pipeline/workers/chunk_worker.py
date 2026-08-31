import asyncio
import logging
import uuid
from pathlib import Path
from typing import List, Optional

from app.configs.kafka.config import create_kafka_consumer
from app.configs.db.config import SessionLocal
from app.models.chapter import Chapter
from app.models.document_processing import DocumentProcessing
from app.pipeline.constants import (
    TOPIC_PDF_PARSED,
    TOPIC_PDF_CHUNKED,
    GROUP_CHUNK,
    CHUNK_BATCH_SIZE,
)
from app.pipeline.schemas import PdfParsedEvent, PdfChunkedEvent, ChunkPayload
from app.pipeline.producer import publish_event, publish_to_dlq
from app.functions.text_splitter import markdown_splitter

import re

logger = logging.getLogger(__name__)

PAGE_MARKER_PATTERN = re.compile(r"<!--\s*PAGE:\s*(\d+)\s*-->")


async def process_chunk_message(event_data: dict) -> None:
    """Processes a parsed Markdown event (Stage 3: Chunking)."""
    doc_id = event_data.get("document_id", "unknown")
    user_id = event_data.get("user_id")

    try:
        parsed = PdfParsedEvent(**event_data)
        user_id = parsed.user_id
        doc_id = parsed.document_id
        md_path = Path(parsed.markdown_path)

        logger.info("[ChunkWorker] Starting chunking for doc=%s from %s", doc_id, md_path)

        if not md_path.exists():
            raise FileNotFoundError(f"Markdown file not found at {md_path}")

        markdown_text = md_path.read_text(encoding="utf-8")

        # 1. Retrieve chapters for mapping if DB session is available
        chapters = []
        if SessionLocal:
            db = SessionLocal()
            try:
                chapters = db.query(Chapter).filter(Chapter.document_id == doc_id).all()
            except Exception as dbe:
                logger.warning("[ChunkWorker] Could not query chapters: %s", dbe)
            finally:
                db.close()

        def find_chapter_id(page_num: int) -> str:
            for chap in chapters:
                if chap.page_start <= page_num <= chap.page_end:
                    return str(chap.id)
            return ""

        # 2. Extract sections per page or as full text
        page_sections: List[tuple[int, str]] = []
        parts = PAGE_MARKER_PATTERN.split(markdown_text)

        if len(parts) > 1:
            # First part (before first <!-- PAGE: N --> marker) if non-empty
            if parts[0].strip():
                page_sections.append((1, parts[0].strip()))
            for i in range(1, len(parts), 2):
                p_num = int(parts[i])
                p_text = parts[i + 1].strip()
                if p_text:
                    page_sections.append((p_num, p_text))
        else:
            page_sections.append((1, markdown_text.strip() or "Empty document"))

        # 3. Split each page section and attach metadata
        chunk_payloads: List[ChunkPayload] = []
        chunk_idx = 0

        for page_num, section_text in page_sections:
            raw_chunks = markdown_splitter(section_text)
            chap_id = find_chapter_id(page_num)

            for text in raw_chunks:
                if not text.strip():
                    continue
                cid = str(uuid.uuid4())
                chunk_payloads.append(
                    ChunkPayload(
                        chunk_id=cid,
                        document=text,
                        chunk_index=chunk_idx,
                        page_number=page_num,
                        chapter_id=chap_id,
                        metadata={
                            "user_id": user_id,
                            "document_id": doc_id,
                            "chunk_index": chunk_idx,
                            "page_number": page_num,
                            "chapter_id": chap_id,
                        }
                    )
                )
                chunk_idx += 1

        if not chunk_payloads:
            logger.warning("[ChunkWorker] Document %s yielded 0 chunks. Creating 1 fallback chunk.", doc_id)
            chunk_payloads.append(
                ChunkPayload(
                    chunk_id=str(uuid.uuid4()),
                    document=markdown_text.strip() or "Empty document",
                    chunk_index=0,
                    page_number=1,
                    chapter_id="",
                    metadata={
                        "user_id": user_id,
                        "document_id": doc_id,
                        "chunk_index": 0,
                        "page_number": 1,
                        "chapter_id": "",
                    }
                )
            )

        total_chunks = len(chunk_payloads)
        logger.info("[ChunkWorker] Split document %s into %d chunks", doc_id, total_chunks)

        # 4. Update DocumentProcessing record with total_chunks
        if SessionLocal:
            db = SessionLocal()
            try:
                rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc_id).first()
                if rec:
                    rec.total_chunks = total_chunks
                    db.commit()
            except Exception as dbe:
                logger.warning("[ChunkWorker] Failed updating total_chunks in DB: %s", dbe)
            finally:
                db.close()

        # 5. Batch and emit to PDF_CHUNKED topic
        batches = [
            chunk_payloads[i : i + CHUNK_BATCH_SIZE]
            for i in range(0, total_chunks, CHUNK_BATCH_SIZE)
        ]
        total_batches = len(batches)

        for b_idx, batch in enumerate(batches):
            chunk_event = PdfChunkedEvent(
                document_id=doc_id,
                user_id=user_id,
                chunks=batch,
                batch_index=b_idx,
                total_batches=total_batches,
                total_chunks=total_chunks,
            )
            await publish_event(TOPIC_PDF_CHUNKED, chunk_event, key=doc_id)

        logger.info(
            "[ChunkWorker] Successfully queued %d chunk batches (%d total chunks) for doc %s to [%s]",
            total_batches, total_chunks, doc_id, TOPIC_PDF_CHUNKED
        )

    except Exception as e:
        logger.error("[ChunkWorker] Error chunking document %s: %s", doc_id, e)
        await publish_to_dlq(
            stage="CHUNK",
            document_id=doc_id,
            error=e,
            user_id=user_id,
            original_event=event_data,
        )


async def run_chunk_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    """Kafka Consumer Loop for Stage 3 (Chunk)."""
    consumer = create_kafka_consumer(
        topic=TOPIC_PDF_PARSED,
        group_id=GROUP_CHUNK,
    )
    await consumer.start()
    logger.info("ChunkWorker consumer started on topic [%s]", TOPIC_PDF_PARSED)

    try:
        while stop_event is None or not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=1000, max_records=5)
            for topic_partition, messages in msg_batch.items():
                for message in messages:
                    await process_chunk_message(message.value)
    except asyncio.CancelledError:
        logger.info("ChunkWorker cancelled.")
    finally:
        await consumer.stop()
        logger.info("ChunkWorker consumer stopped.")
