import logging
import traceback
from typing import Any, Dict, Optional, Union
from pydantic import BaseModel

from app.configs.kafka.config import get_kafka_producer
from app.pipeline.constants import TOPIC_PDF_DLQ
from app.pipeline.schemas import PdfDlqEvent

logger = logging.getLogger(__name__)


async def publish_event(
    topic: str,
    event: Union[BaseModel, Dict[str, Any]],
    key: Optional[str] = None,
) -> None:
    """
    Publishes a Pydantic model or dict payload to a Kafka topic.
    Key defaults to document_id if present in event.
    """
    producer = await get_kafka_producer()
    payload = event.model_dump() if isinstance(event, BaseModel) else event

    message_key = key
    if message_key is None and isinstance(payload, dict):
        message_key = payload.get("document_id")

    key_bytes = str(message_key).encode("utf-8") if message_key else None
    await producer.send_and_wait(topic, value=payload, key=key_bytes)
    logger.info("Published event to [%s] with key=%s (event_id=%s)", topic, message_key, payload.get("event_id"))


async def publish_to_dlq(
    stage: str,
    document_id: str,
    error: Exception,
    user_id: Optional[str] = None,
    original_event: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Constructs and dispatches a Dead-Letter Queue event to TOPIC_PDF_DLQ.
    """
    dlq_event = PdfDlqEvent(
        stage=stage,
        document_id=document_id,
        user_id=user_id,
        error_message=str(error),
        traceback=traceback.format_exc(),
        original_event=original_event,
    )
    try:
        await publish_event(TOPIC_PDF_DLQ, dlq_event, key=document_id)
        logger.warning("Dispatched DLQ event for stage [%s], document [%s]: %s", stage, document_id, error)
    except Exception as pub_err:
        logger.error("Failed to publish DLQ event for stage [%s]: %s", stage, pub_err)
