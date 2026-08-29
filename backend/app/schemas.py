from typing import List, Optional, Dict, Literal, Any
from pydantic import BaseModel, Field


# ── Core Application Schemas ──────────────────────────────────────────────────

class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)


class Highlight(BaseModel):
    id: str
    page: int
    x: float
    y: float
    width: float
    height: float
    color: str
    text: Optional[str] = None
    note: Optional[str] = None
    createdAt: str


class StickyNote(BaseModel):
    id: str
    page: int
    x: float
    y: float
    color: str
    text: str
    createdAt: str


class InkPoint(BaseModel):
    x: float
    y: float


class InkStroke(BaseModel):
    id: str
    page: int
    points: List[InkPoint]
    color: str
    width: float
    opacity: Optional[float] = 1.0
    isHighlight: Optional[bool] = False
    createdAt: str


ShapeKind = Literal['rect', 'circle', 'line', 'arrow']


class ShapeAnnotation(BaseModel):
    id: str
    page: int
    kind: ShapeKind
    x: float
    y: float
    width: float
    height: float
    color: str
    strokeWidth: float
    createdAt: str


class TextBox(BaseModel):
    id: str
    page: int
    x: float
    y: float
    text: str
    color: str
    fontSize: float
    createdAt: str


class BookProgress(BaseModel):
    currentPage: int = 1
    totalPages: int = 1
    lastReadTime: str = ""
    highlights: List[Highlight] = Field(default_factory=list)
    notes: List[StickyNote] = Field(default_factory=list)
    inkStrokes: List[InkStroke] = Field(default_factory=list)
    shapes: List[ShapeAnnotation] = Field(default_factory=list)
    textBoxes: List[TextBox] = Field(default_factory=list)


class SyncData(BaseModel):
    books: Dict[str, BookProgress] = Field(default_factory=dict)


class Book(BaseModel):
    id: str
    name: str
    size: Optional[int] = None
    createdTime: Optional[str] = None
    currentPage: int = 1
    totalPages: int = 1
    lastReadTime: Optional[str] = None


class AuthStatus(BaseModel):
    authenticated: bool
    user: Optional[User] = None


class GoogleTokenRequest(BaseModel):
    code: Optional[str] = None
    access_token: Optional[str] = None
    id_token: Optional[str] = None
    redirect_uri: Optional[str] = None


class LibraryResponse(BaseModel):
    books: List[Book] = Field(default_factory=list)
    syncData: SyncData = Field(default_factory=SyncData)
    syncFileId: Optional[str] = None


# ── RAG Processing Schemas ────────────────────────────────────────────────────

class ProcessBookResponse(BaseModel):
    book_id: str
    task_id: str
    message: str


class RagStatusResponse(BaseModel):
    book_id: str
    status: str
    total_chunks: Optional[int] = None
    error_message: Optional[str] = None
    updated_at: Optional[str] = None


# ── Chat Schemas ──────────────────────────────────────────────────────────────

class ChatSource(BaseModel):
    page: int
    chunk_index: int
    text_preview: str


class ChatSourceChunk(ChatSource):
    pass


class ChatRequest(BaseModel):
    query: str
    stream: bool = True


class ChatResponse(BaseModel):
    answer: str
    sources: List[ChatSource] = []


# ── Notes Schemas ─────────────────────────────────────────────────────────────

class GenerateNotesRequest(BaseModel):
    scope: str = "chapter"          # "chapter" | "full"
    book_title: Optional[str] = None


class GenerateNotesResponse(BaseModel):
    book_id: str
    scope: str
    orchestrator_task_id: str
    message: str


class NoteResponse(BaseModel):
    id: str
    book_id: str
    scope: str
    chapter_title: Optional[str] = None
    chapter_index: Optional[int] = None
    content: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    updated_at: Optional[str] = None
