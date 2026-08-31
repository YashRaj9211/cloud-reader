"""
Constants for the Kafka PDF Indexing Pipeline.
Defines topic names, consumer group names, batch sizes, and timeout settings.
"""

from app.configs.kafka.config import (
    PDF_INDEX_REQUEST_TOPIC,
    PDF_FETCHED_TOPIC,
    PDF_PARSED_TOPIC,
    PDF_CHUNKED_TOPIC,
    PDF_EMBEDDED_TOPIC,
    PDF_INDEXING_DLQ_TOPIC,
)

# Topics
TOPIC_PDF_INDEX_REQUEST = PDF_INDEX_REQUEST_TOPIC
TOPIC_PDF_FETCHED = PDF_FETCHED_TOPIC
TOPIC_PDF_PARSED = PDF_PARSED_TOPIC
TOPIC_PDF_CHUNKED = PDF_CHUNKED_TOPIC
TOPIC_PDF_EMBEDDED = PDF_EMBEDDED_TOPIC
TOPIC_PDF_DLQ = PDF_INDEXING_DLQ_TOPIC

# Dedicated Consumer Groups per stage for decoupled scaling
GROUP_FETCH = "pdf-fetch-group"
GROUP_PARSE = "pdf-parse-group"
GROUP_CHUNK = "pdf-chunk-group"
GROUP_EMBED = "pdf-embed-group"
GROUP_STORE = "pdf-store-group"
GROUP_DLQ = "pdf-dlq-group"

# Processing configuration
CHUNK_BATCH_SIZE = 50          # Number of chunks per Kafka message to avoid oversized payloads
EMBEDDING_BATCH_SIZE = 25      # Batch size passed to NVIDIA embedding endpoint
DEFAULT_CHUNK_SIZE = 1000      # Target character length per text chunk
DEFAULT_CHUNK_OVERLAP = 150    # Character overlap between adjacent chunks
