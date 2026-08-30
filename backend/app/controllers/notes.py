from typing import List
from app.schemas import User


async def list_notes_controller(auth_data: tuple[User, str]) -> List[dict]:
    """Returns notes for the current authenticated user"""
    user, _ = auth_data
    # ponytail: Return empty list until database persistence model is wired.
    # Ceiling: In-memory/sync-file notes handled via books progress sync.
    # Upgrade path: Connect to PostgreSQL notes table via SQLAlchemy session.
    return []
