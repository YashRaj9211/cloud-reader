import asyncio
import logging
from pathlib import Path
from typing import Optional

from app.configs.kafka.config import create_kafka_consumer
from app.pipeline.constants import (
    TOPIC_PDF_FETCHED,
    TOPIC_PDF_PARSED,
    GROUP_PARSE,
)
from app.pipeline.schemas import PdfFetchedEvent, PdfParsedEvent
from app.pipeline.producer import publish_event, publish_to_dlq
from app.configs.db.config import SessionLocal
from app.models.document_processing import DocumentProcessing
from app.functions.parser import pdf_parser, get_pdf_page_count
from app.services.document_storage_service import document_storage_service

logger = logging.getLogger(__name__)


async def process_parse_message(event_data: dict) -> None:
    """Processes a fetched PDF event (Stage 2: Parse to Markdown)."""
    doc_id = event_data.get("document_id", "unknown")
    user_id = event_data.get("user_id")

    try:
        fetched = PdfFetchedEvent(**event_data)
        user_id = fetched.user_id
        doc_id = fetched.document_id
        pdf_path = Path(fetched.pdf_path)

        logger.info("[ParseWorker] Starting parse for doc=%s at %s", doc_id, pdf_path)

        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")

        # Check page count
        total_pages = get_pdf_page_count(str(pdf_path))

        # Check if already parsed and valid (not corrupt legacy repr)
        cached_valid = False
        markdown_content = ""
        if document_storage_service.has_markdown(user_id, doc_id):
            md_path = document_storage_service.get_markdown_path(user_id, doc_id)
            existing_text = md_path.read_text(encoding="utf-8")
            if existing_text and not existing_text.startswith("PdfResult(") and not existing_text.startswith("<PdfResult"):
                markdown_content = existing_text
                cached_valid = True
                logger.info("[ParseWorker] Valid cached markdown found for doc %s. Reusing.", doc_id)

        if not cached_valid:
            # Run PDF parser in threadpool to avoid blocking event loop
            loop = asyncio.get_running_loop()
            markdown_content = await loop.run_in_executor(None, pdf_parser, str(pdf_path))

            if not markdown_content or not markdown_content.strip():
                logger.warning("[ParseWorker] Empty markdown produced for %s, saving basic fallback", doc_id)
                markdown_content = f"# {fetched.filename}\n\n(No textual content could be extracted from this PDF.)"

            # Save parsed Markdown to persistent document storage
            md_path = document_storage_service.save_markdown(user_id, doc_id, markdown_content)
            logger.info("[ParseWorker] Saved parsed markdown to %s (%d chars)", md_path, len(markdown_content))
        else:
            md_path = document_storage_service.get_markdown_path(user_id, doc_id)

        # Update DocumentProcessing.total_pages in PostgreSQL
        if SessionLocal:
            db = SessionLocal()
            try:
                rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc_id).first()
                if rec:
                    rec.total_pages = total_pages
                    db.commit()
            except Exception as dbe:
                logger.warning("[ParseWorker] Could not update total_pages in DB: %s", dbe)
            finally:
                db.close()

        # Emit next event in pipeline: PDF_PARSED
        next_event = PdfParsedEvent(
            document_id=doc_id,
            user_id=user_id,
            markdown_path=str(md_path.resolve()),
            character_count=len(markdown_content),
            total_pages=total_pages,
            filename=fetched.filename,
        )
        await publish_event(TOPIC_PDF_PARSED, next_event, key=doc_id)
        logger.info("[ParseWorker] Successfully queued doc %s to [%s] (%d pages)", doc_id, TOPIC_PDF_PARSED, total_pages)

    except Exception as e:
        logger.error("[ParseWorker] Error parsing document %s: %s", doc_id, e)
        await publish_to_dlq(
            stage="PARSE",
            document_id=doc_id,
            error=e,
            user_id=user_id,
            original_event=event_data,
        )


async def run_parse_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    """Kafka Consumer Loop for Stage 2 (Parse)."""
    consumer = create_kafka_consumer(
        topic=TOPIC_PDF_FETCHED,
        group_id=GROUP_PARSE,
    )
    await consumer.start()
    logger.info("ParseWorker consumer started on topic [%s]", TOPIC_PDF_FETCHED)

    try:
        while stop_event is None or not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=1000, max_records=5)
            for topic_partition, messages in msg_batch.items():
                for message in messages:
                    await process_parse_message(message.value)
    except asyncio.CancelledError:
        logger.info("ParseWorker cancelled.")
    finally:
        await consumer.stop()
        logger.info("ParseWorker consumer stopped.")
