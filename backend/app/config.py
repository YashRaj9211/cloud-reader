import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend root or parent if present
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SESSION_SECRET = os.getenv("SESSION_SECRET", "cloud-pdf-reader-secure-session-key-39281")
TOKEN_STORAGE_COOKIE = "cloud_pdf_session"

# Scopes needed for Google Drive and User profile
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.file",
]

# ---------------------------------------------------------------------------
# Task Queue (Celery + Redis)
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# ---------------------------------------------------------------------------
# Vector Database (ChromaDB)
# ---------------------------------------------------------------------------
CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8001"))

# ---------------------------------------------------------------------------
# Relational Database (NeonDB / PostgreSQL)
# ---------------------------------------------------------------------------
# Set NEON_DATABASE_URL in your .env — never commit the real value
NEON_DATABASE_URL: str = os.getenv("NEON_DATABASE_URL", "")

# ---------------------------------------------------------------------------
# NVIDIA Cloud (Embeddings + LLM)
# NVIDIA endpoints use the OpenAI-compatible API
# ---------------------------------------------------------------------------
NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL: str = os.getenv(
    "NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"
)
NVIDIA_EMBED_MODEL: str = os.getenv(
    "NVIDIA_EMBED_MODEL", "nvidia/nv-embedqa-e5-v5"  # nemotron-3-embed-1b alias
)
NVIDIA_LLM_MODEL: str = os.getenv(
    "NVIDIA_LLM_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct"
)

# ---------------------------------------------------------------------------
# Reranking
# ---------------------------------------------------------------------------
RERANK_API_URL: str = os.getenv("RERANK_API_URL", "")
RERANK_API_KEY: str = os.getenv("RERANK_API_KEY", "")
RERANK_MODEL: str = os.getenv("RERANK_MODEL", "nvidia/nv-rerankqa-mistral-4b-v3")

# ---------------------------------------------------------------------------
# RAG Settings
# ---------------------------------------------------------------------------
CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "1500"))
CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "400"))
RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "10"))    # retrieve K chunks
RAG_RERANK_TOP_N: int = int(os.getenv("RAG_RERANK_TOP_N", "5"))  # keep top N after rerank
