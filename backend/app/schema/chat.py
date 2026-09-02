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


class QueryScope(BaseModel):
    type: ScopeType
    id: Optional[str] = None


class QueryRequest(BaseModel):
    query: str
    scope: QueryScope
    n_results: Optional[int] = 5


class ChunkMetadataResponse(BaseModel):
    user_id: str
    document_id: str
    chapter_id: Optional[str] = ""
    page_number: int
    chunk_index: int


class QueryChunkResult(BaseModel):
    id: str
    document: str
    metadata: ChunkMetadataResponse
    distance: Optional[float] = None


class QueryResponse(BaseModel):
    query: str
    scope: QueryScope
    results: List[QueryChunkResult]


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    scope_type: ScopeType = ScopeType.ALL
    scope_id: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    title: str


class SendMessageRequest(BaseModel):
    message: str


class SourceCitation(BaseModel):
    document_id: str
    document_name: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    page_number: int
    chunk_index: int
    content: str
    relevance_score: Optional[float] = None


class SendMessageResponse(BaseModel):
    session_id: str
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
    sources: List[SourceCitation] = []

