from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schema.enums import DocumentStatus


class DocumentBase(BaseModel):
    filename: str
    mime_type: str = "application/pdf"
    file_size: Optional[int] = None
    google_drive_file_id: Optional[str] = None


class DocumentCreate(DocumentBase):
    user_id: str
    content_hash: Optional[str] = None
    status: DocumentStatus = DocumentStatus.UPLOADED


class DocumentUpdate(BaseModel):
    filename: Optional[str] = None
    status: Optional[DocumentStatus] = None
    content_hash: Optional[str] = None
    indexed_at: Optional[datetime] = None


class DocumentResponse(DocumentBase):
    id: str
    user_id: str
    status: DocumentStatus
    content_hash: Optional[str] = None
    indexed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
