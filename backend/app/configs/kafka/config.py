import os
import json
from typing import Optional, Callable
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer

KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_INTERNAL_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_INTERNAL_BOOTSTRAP_SERVERS", "kafka:29092")
KAFKA_UI_URL: str = os.getenv("KAFKA_UI_URL", "http://localhost:8080")

# Topics
PDF_PROCESSING_TOPIC: str = os.getenv("KAFKA_PDF_PROCESSING_TOPIC", "pdf-processing-events")
PDF_INDEXING_TOPIC: str = os.getenv("KAFKA_PDF_INDEXING_TOPIC", "pdf-indexing-events")
KAFKA_CONSUMER_GROUP: str = os.getenv("KAFKA_CONSUMER_GROUP", "cloud-pdf-reader-group")

_producer: Optional[AIOKafkaProducer] = None


async def get_kafka_producer() -> AIOKafkaProducer:
    """
    Returns an active async Kafka Producer.
    """
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8")
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
    return AIOKafkaConsumer(
        topic,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=group_id,
        auto_offset_reset=auto_offset_reset,
        value_deserializer=lambda v: json.loads(v.decode("utf-8"))
    )
