from enum import Enum


class DocumentStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    INDEXED = "INDEXED"
    FAILED = "FAILED"
    NEEDS_REINDEX = "NEEDS_REINDEX"


class ScopeType(str, Enum):
    ALL = "ALL"
    FOLDER = "FOLDER"
    DOCUMENT = "DOCUMENT"
    CHAPTER = "CHAPTER"


class MessageRole(str, Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"


class ProcessingStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
