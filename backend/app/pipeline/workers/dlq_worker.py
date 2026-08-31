import asyncio
import logging
from typing import Optional

from app.configs.kafka.config import create_kafka_consumer
from app.configs.db.config import SessionLocal
from app.models.document import Document
from app.models.document_processing import DocumentProcessing
from app.schema.enums import DocumentStatus
from app.pipeline.constants import TOPIC_PDF_DLQ, GROUP_DLQ
from app.pipeline.schemas import PdfDlqEvent

logger = logging.getLogger(__name__)


from datetime import datetime, timezone

async def process_dlq_message(event_data: dict) -> None:
    """Processes a Dead-Letter Queue event by updating DB and logging."""
    try:
        dlq = PdfDlqEvent(**event_data)
        doc_id = dlq.document_id

        logger.error(
            "[DLQWorker] Caught failure in stage [%s] for document [%s]: %s\nTraceback:\n%s",
            dlq.stage, doc_id, dlq.error_message, dlq.traceback or ""
        )

        if SessionLocal and doc_id:
            db = SessionLocal()
            try:
                rec = db.query(DocumentProcessing).filter(DocumentProcessing.document_id == doc_id).first()
                if rec:
                    rec.status = DocumentStatus.FAILED
                    rec.completed_at = datetime.now(timezone.utc)
                    rec.error_message = f"[{dlq.stage}] {dlq.error_message}"
                doc = db.query(Document).filter(Document.id == doc_id).first()
                if doc:
                    doc.status = DocumentStatus.FAILED
                db.commit()
                logger.info("[DLQWorker] Updated DB status to FAILED for document %s", doc_id)
            except Exception as dbe:
                logger.error("[DLQWorker] Failed updating DB error status: %s", dbe)
                db.rollback()
            finally:
                db.close()
    except Exception as e:
        logger.error("[DLQWorker] Error handling DLQ message: %s", e)


async def run_dlq_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    """Kafka Consumer Loop for Dead-Letter Queue."""
    consumer = create_kafka_consumer(
        topic=TOPIC_PDF_DLQ,
        group_id=GROUP_DLQ,
    )
    await consumer.start()
    logger.info("DLQWorker consumer started on topic [%s]", TOPIC_PDF_DLQ)

    try:
        while stop_event is None or not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=1000, max_records=5)
            for topic_partition, messages in msg_batch.items():
                for message in messages:
                    await process_dlq_message(message.value)
    except asyncio.CancelledError:
        logger.info("DLQWorker cancelled.")
    finally:
        await consumer.stop()
        logger.info("DLQWorker consumer stopped.")
