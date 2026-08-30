from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.schema.enums import ScopeType, MessageRole


class ChatMessageBase(BaseModel):
    role: MessageRole
    content: str


class ChatMessageCreate(ChatMessageBase):
    session_id: str


class ChatMessageResponse(ChatMessageBase):
    id: str
    session_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatSessionBase(BaseModel):
    title: str = "New Chat"
    scope_type: ScopeType = ScopeType.ALL
    scope_id: Optional[str] = None


class ChatSessionCreate(ChatSessionBase):
    user_id: str


class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None


class ChatSessionResponse(ChatSessionBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    messages: Optional[List[ChatMessageResponse]] = None

    model_config = ConfigDict(from_attributes=True)
