"""
Async SQLAlchemy engine and session factory connected to NeonDB (PostgreSQL).

NeonDB + asyncpg requires SSL. We strip the ?ssl=require query param
and pass ssl=True via connect_args instead, which asyncpg understands.
"""
import ssl
import re
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import NEON_DATABASE_URL

if not NEON_DATABASE_URL:
    raise RuntimeError(
        "NEON_DATABASE_URL is not set. "
        "Please add it to your .env file."
    )

# Strip ssl/channel_binding params — asyncpg handles them via connect_args
_clean_url = re.sub(r"[?&](ssl|channel_binding)=[^&]+", "", NEON_DATABASE_URL)
_clean_url = _clean_url.rstrip("?&")

# Ensure the URL uses the asyncpg dialect
if _clean_url.startswith("postgresql://"):
    _clean_url = _clean_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Build SSL context for NeonDB
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = True
_ssl_ctx.verify_mode = ssl.CERT_REQUIRED

engine = create_async_engine(
    _clean_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args={"ssl": _ssl_ctx},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency: yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
