from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field


class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None


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
