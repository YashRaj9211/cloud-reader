from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class NoteBase(BaseModel):
    content: str
    document_id: Optional[str] = None
    chapter_id: Optional[str] = None


class NoteCreate(NoteBase):
    user_id: str


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    chapter_id: Optional[str] = None


class NoteResponse(NoteBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
