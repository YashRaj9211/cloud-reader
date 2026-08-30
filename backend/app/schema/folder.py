from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class FolderBase(BaseModel):
    name: str
    parent_folder_id: Optional[str] = None


class FolderCreate(FolderBase):
    user_id: str


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_folder_id: Optional[str] = None


class DocumentFolderLink(BaseModel):
    folder_id: str
    document_id: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class FolderResponse(FolderBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
