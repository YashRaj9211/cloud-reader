from typing import List
from app.schemas import User


async def list_chat_sessions_controller(auth_data: tuple[User, str]) -> List[dict]:
    """Returns chat sessions for the current authenticated user"""
    user, _ = auth_data
    # ponytail: Return empty list until chat DB persistence is wired.
    # Ceiling: In-memory chat sessions only.
    # Upgrade path: Connect to PostgreSQL chat_sessions and chat_messages tables.
    return []
