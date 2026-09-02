from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, Field
from app.schemas import Book


class FolderBase(BaseModel):
    name: str
    parent_folder_id: Optional[str] = None


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_folder_id: Optional[str] = None


class DocumentFolderLink(BaseModel):
    folder_id: str
    document_id: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class FolderResponse(BaseModel):
    id: str
    name: str
    parent_folder_id: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None
    book_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class FolderDetailResponse(BaseModel):
    id: str
    name: str
    parent_folder_id: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None
    subdirectories: List[FolderResponse] = Field(default_factory=list)
    books: List[Book] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
