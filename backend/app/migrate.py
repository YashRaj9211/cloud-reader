"""One-shot migration: run once to create all RAG tables in NeonDB.
Usage: cd backend && python -m app.migrate
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import engine, Base
import app.models  # noqa: F401


async def create_tables():
    print("Connecting to NeonDB...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[SUCCESS] All tables created successfully.")


if __name__ == "__main__":
    asyncio.run(create_tables())
