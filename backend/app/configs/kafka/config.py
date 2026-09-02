import os
import json
from typing import Optional

try:
    from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
except ImportError:
    AIOKafkaProducer = None
    AIOKafkaConsumer = None

KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_INTERNAL_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_INTERNAL_BOOTSTRAP_SERVERS", "kafka:29092")
KAFKA_UI_URL: str = os.getenv("KAFKA_UI_URL", "http://localhost:8080")

# Topics
PDF_PROCESSING_TOPIC: str = os.getenv("KAFKA_PDF_PROCESSING_TOPIC", "pdf-processing-events")
PDF_INDEXING_TOPIC: str = os.getenv("KAFKA_PDF_INDEXING_TOPIC", "pdf-indexing-events")

# Multi-Stage Indexing Pipeline Topics
PDF_INDEX_REQUEST_TOPIC: str = os.getenv("KAFKA_PDF_INDEX_REQUEST_TOPIC", "pdf.index.requested")
PDF_FETCHED_TOPIC: str = os.getenv("KAFKA_PDF_FETCHED_TOPIC", "pdf.fetched")
PDF_PARSED_TOPIC: str = os.getenv("KAFKA_PDF_PARSED_TOPIC", "pdf.parsed")
PDF_CHUNKED_TOPIC: str = os.getenv("KAFKA_PDF_CHUNKED_TOPIC", "pdf.chunked")
PDF_EMBEDDED_TOPIC: str = os.getenv("KAFKA_PDF_EMBEDDED_TOPIC", "pdf.embedded")
PDF_INDEXING_DLQ_TOPIC: str = os.getenv("KAFKA_PDF_INDEXING_DLQ_TOPIC", "pdf.indexing.dlq")

# Default consumer group
KAFKA_CONSUMER_GROUP: str = os.getenv("KAFKA_CONSUMER_GROUP", "cloud-pdf-reader-group")

_producer: Optional[AIOKafkaProducer] = None


async def get_kafka_producer() -> AIOKafkaProducer:
    """
    Returns an active async Kafka Producer singleton.
    """
    global _producer
    if _producer is None:
        if AIOKafkaProducer is None:
            raise RuntimeError("aiokafka is not installed or available.")
        _producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            max_request_size=20971520,  # 20MB to support large embedding payload vectors
        )
        await _producer.start()
    return _producer


async def stop_kafka_producer():
    """
    Gracefully stops the Kafka Producer on app shutdown.
    """
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None


def create_kafka_consumer(
    topic: str,
    group_id: str = KAFKA_CONSUMER_GROUP,
    auto_offset_reset: str = "earliest"
) -> AIOKafkaConsumer:
    """
    Creates an AIOKafkaConsumer for a given topic.
    """
    if AIOKafkaConsumer is None:
        raise RuntimeError("aiokafka is not installed or available.")
    return AIOKafkaConsumer(
        topic,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=group_id,
        auto_offset_reset=auto_offset_reset,
        enable_auto_commit=True,
        max_partition_fetch_bytes=20971520,  # 20MB fetch capacity
        value_deserializer=lambda v: json.loads(v.decode("utf-8"))
    )
