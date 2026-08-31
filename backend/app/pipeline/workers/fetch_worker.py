import asyncio
import logging
from typing import Optional

from app.configs.kafka.config import create_kafka_consumer
from app.configs.db.config import SessionLocal
from app.models.document_processing import DocumentProcessing
from app.schema.enums import DocumentStatus
from app.pipeline.constants import (
    TOPIC_PDF_INDEX_REQUEST,
    TOPIC_PDF_FETCHED,
    GROUP_FETCH,
)
from app.pipeline.schemas import PdfIndexRequestEvent, PdfFetchedEvent
from app.pipeline.producer import publish_event, publish_to_dlq
from app.services.google_drive_service import google_drive_service
from app.services.document_storage_service import document_storage_service

logger = logging.getLogger(__name__)


async def process_fetch_message(event_data: dict) -> None:
    """Processes a single PDF index request event (Stage 1: Fetch)."""
    doc_id = event_data.get("document_id", "unknown")
    user_id = event_data.get("user_id")

    try:
        req = PdfIndexRequestEvent(**event_data)
        user_id = req.user_id
        doc_id = req.document_id
        file_id = req.google_drive_file_id
        token = req.access_token

        logger.info("[FetchWorker] Starting fetch for doc=%s, file_id=%s, user=%s", doc_id, file_id, user_id)

        # Check if already cached in persistent document storage
        if document_storage_service.has_pdf(user_id, doc_id):
            logger.info("[FetchWorker] Document %s already cached in storage. Reusing local copy.", doc_id)
            pdf_path = document_storage_service.get_pdf_path(user_id, doc_id)
            file_size = pdf_path.stat().st_size
        else:
            # Download PDF bytes from Google Drive
            pdf_bytes = await google_drive_service.download_pdf_content(token, file_id)
            pdf_path = document_storage_service.save_pdf(user_id, doc_id, pdf_bytes)
            file_size = len(pdf_bytes)
            logger.info("[FetchWorker] Downloaded %d bytes and saved to %s", file_size, pdf_path)

        # Update DB processing record
        if SessionLocal:
            db = SessionLocal()
            try:
                rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc_id).first()
                if rec:
                    rec.status = DocumentStatus.PROCESSING
                    db.commit()
            finally:
                db.close()

        # Emit next event in pipeline: PDF_FETCHED
        next_event = PdfFetchedEvent(
            document_id=doc_id,
            google_drive_file_id=file_id,
            user_id=user_id,
            pdf_path=str(pdf_path.resolve()),
            file_size=file_size,
            filename=req.filename,
        )
        await publish_event(TOPIC_PDF_FETCHED, next_event, key=doc_id)
        logger.info("[FetchWorker] Successfully queued doc %s to [%s]", doc_id, TOPIC_PDF_FETCHED)

    except Exception as e:
        logger.error("[FetchWorker] Error fetching document %s: %s", doc_id, e)
        await publish_to_dlq(
            stage="FETCH",
            document_id=doc_id,
            error=e,
            user_id=user_id,
            original_event=event_data,
        )


async def run_fetch_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    """Kafka Consumer Loop for Stage 1 (Fetch)."""
    consumer = create_kafka_consumer(
        topic=TOPIC_PDF_INDEX_REQUEST,
        group_id=GROUP_FETCH,
    )
    await consumer.start()
    logger.info("FetchWorker consumer started on topic [%s]", TOPIC_PDF_INDEX_REQUEST)

    try:
        while stop_event is None or not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=1000, max_records=5)
            for topic_partition, messages in msg_batch.items():
                for message in messages:
                    await process_fetch_message(message.value)
    except asyncio.CancelledError:
        logger.info("FetchWorker cancelled.")
    finally:
        await consumer.stop()
        logger.info("FetchWorker consumer stopped.")
