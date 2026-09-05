from fastapi import APIRouter, Depends
from app.services.session import get_current_user_and_token
from app.routes.auth_router import public_auth_router, private_auth_router
from app.routes.books_router import books_router
from app.routes.directories_router import directories_router
from app.routes.sync_router import sync_router
from app.routes.user_router import user_router
from app.routes.notes_router import notes_router, public_notes_router
from app.routes.chat_router import chat_router

# 1. Public API Router (No authentication required)
public_router = APIRouter()
public_router.include_router(public_auth_router)
public_router.include_router(public_notes_router)

# 2. Private API Router (Guarded by authentication middleware / dependency)
private_router = APIRouter(dependencies=[Depends(get_current_user_and_token)])
private_router.include_router(private_auth_router)
private_router.include_router(directories_router)
private_router.include_router(books_router)
private_router.include_router(sync_router)
private_router.include_router(user_router)
private_router.include_router(notes_router)
private_router.include_router(chat_router)

# 3. Aggregated API Router
api_router = APIRouter(prefix="/api")
api_router.include_router(public_router)
api_router.include_router(private_router)

__all__ = [
    "public_router",
    "private_router",
    "api_router",
    "public_auth_router",
    "private_auth_router",
    "directories_router",
    "books_router",
    "sync_router",
    "user_router",
    "notes_router",
    "chat_router",
]
