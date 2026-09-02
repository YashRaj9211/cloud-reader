import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# Core App Settings
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SESSION_SECRET = os.getenv("SESSION_SECRET", "cloud-pdf-reader-secure-session-key-39281")
TOKEN_STORAGE_COOKIE = "cloud_pdf_session"

# NVIDIA AI & Embeddings
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b")
LLM_URL = os.getenv("LLM_URL", "https://integrate.api.nvidia.com/v1")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nvidia/nemotron-3-embed-1b")
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "https://integrate.api.nvidia.com/v1")
EMBEDDING_KEY = os.getenv("EMBEDDING_KEY", NVIDIA_API_KEY)

# Service Configs from app.configs
from app.configs import (
    CHROMA_HOST,
    CHROMA_PORT,
    CHROMA_SERVER_HOST,
    CHROMA_SERVER_PORT,
    DOCUMENT_CHUNKS_COLLECTION,
    get_chroma_client,
    get_document_chunks_collection,
    DATABASE_URL,
    DB_POOL_SIZE,
    DB_MAX_OVERFLOW,
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_INTERNAL_BOOTSTRAP_SERVERS,
    KAFKA_UI_URL,
    PDF_PROCESSING_TOPIC,
    PDF_INDEXING_TOPIC,
    KAFKA_CONSUMER_GROUP,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_URL,
    DEFAULT_CACHE_TTL,
    SESSION_CACHE_TTL,
    PROMETHEUS_PORT,
    PROMETHEUS_ENABLED,
    ZIPKIN_ENDPOINT,
    OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_EXPORTER_OTLP_HTTP_ENDPOINT,
    OTEL_SERVICE_NAME,
)

# Scopes needed for Google Drive and User profile
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.file",
]
