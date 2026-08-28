"""
One-time database migration script.
Run this to create all RAG-related tables in NeonDB:

    python -m app.migrate

Or directly:
    cd backend && python -m app.migrate
"""
import asyncio
import sys
from pathlib import Path

# Ensure the backend directory is on the path when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import engine, Base
# Import models so SQLAlchemy registers them with Base.metadata
import app.models  # noqa: F401


async def create_tables():
    print("Connecting to NeonDB…")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅  All tables created successfully.")


if __name__ == "__main__":
    asyncio.run(create_tables())
