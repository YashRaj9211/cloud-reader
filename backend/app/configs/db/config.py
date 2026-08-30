import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL: str = os.getenv("DB")

DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE"))
DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW"))

# Lazy/Safe SQLAlchemy Engine & Session
try:
    engine = create_engine(
        DATABASE_URL,
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
        pool_pre_ping=True
    ) if DATABASE_URL else None
except Exception:
    engine = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
Base = declarative_base()

def get_db():
    """
    FastAPI dependency that yields a SQLAlchemy database session.
    """
    if not SessionLocal:
        raise RuntimeError("Database engine not initialized. Please verify DB connection string.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
