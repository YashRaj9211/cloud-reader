from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schema.enums import DocumentStatus


class DocumentProcessingBase(BaseModel):
    document_id: str
    status: DocumentStatus = DocumentStatus.PROCESSING
    total_pages: int = 0
    total_chunks: int = 0
    processed_chunks: int = 0
    error_message: Optional[str] = None


class DocumentProcessingCreate(DocumentProcessingBase):
    started_at: Optional[datetime] = None


class DocumentProcessingUpdate(BaseModel):
    status: Optional[DocumentStatus] = None
    total_pages: Optional[int] = None
    total_chunks: Optional[int] = None
    processed_chunks: Optional[int] = None
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None


class DocumentProcessingResponse(DocumentProcessingBase):
    id: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
