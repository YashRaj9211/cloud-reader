import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


def _current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class PipelineBaseEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=_current_timestamp)


class PdfIndexRequestEvent(PipelineBaseEvent):
    """Event emitted when a user triggers PDF indexing."""
    document_id: str
    google_drive_file_id: str
    user_id: str
    access_token: str
    filename: str = "Document.pdf"


class PdfFetchedEvent(PipelineBaseEvent):
    """Event emitted after Stage 1 (Fetch) saves the PDF locally."""
    document_id: str
    google_drive_file_id: str
    user_id: str
    pdf_path: str
    file_size: int
    filename: str = "Document.pdf"


class PdfParsedEvent(PipelineBaseEvent):
    """Event emitted after Stage 2 (Parse) converts the PDF into Markdown."""
    document_id: str
    user_id: str
    markdown_path: str
    character_count: int = 0
    total_pages: int = 1
    filename: str = "Document.pdf"


class ChunkPayload(BaseModel):
    chunk_id: str
    document: str
    page_number: int = 1
    chunk_index: int = 0
    chapter_id: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PdfChunkedEvent(PipelineBaseEvent):
    """Event emitted after Stage 3 (Chunk) partitions the Markdown."""
    document_id: str
    user_id: str
    chunks: List[ChunkPayload]
    batch_index: int = 0
    total_batches: int = 1
    total_chunks: int = 0


class EmbeddedChunkPayload(BaseModel):
    chunk_id: str
    document: str
    page_number: int = 1
    chunk_index: int = 0
    chapter_id: str = ""
    embedding: List[float]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PdfEmbeddedEvent(PipelineBaseEvent):
    """Event emitted after Stage 4 (Embed) attaches vector embeddings."""
    document_id: str
    user_id: str
    embedded_chunks: List[EmbeddedChunkPayload]
    batch_index: int = 0
    total_batches: int = 1
    total_chunks: int = 0


class PdfDlqEvent(PipelineBaseEvent):
    """Dead-Letter Queue event dispatched when a worker stage fails."""
    stage: str
    document_id: str
    user_id: Optional[str] = None
    error_message: str
    traceback: Optional[str] = None
    original_event: Optional[Dict[str, Any]] = None
