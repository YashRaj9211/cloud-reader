from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class ChapterBase(BaseModel):
    title: str
    page_start: int
    page_end: int
    chapter_number: Optional[int] = None


class ChapterCreate(ChapterBase):
    document_id: str


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    chapter_number: Optional[int] = None


class ChapterResponse(ChapterBase):
    id: str
    document_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
