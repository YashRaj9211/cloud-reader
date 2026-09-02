from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    email: str
    name: Optional[str] = None
    picture_url: Optional[str] = None


class UserCreate(UserBase):
    google_id: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    picture_url: Optional[str] = None


class UserResponse(UserBase):
    id: str
    google_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
