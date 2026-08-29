from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth_router, books_router, sync_router, rag_router
from app.config import FRONTEND_URL
from celery_app import celery_app  # noqa: F401 — binds Celery configuration and Redis broker


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup (idempotent)."""
    from app.db import engine, Base
    import app.models  # noqa: F401 — registers models with Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Cloud PDF Reader API",
    description="Backend API managing Google Authentication and Google Drive PDF sync/storage.",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(books_router, prefix="/api")
app.include_router(sync_router, prefix="/api")
app.include_router(rag_router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Cloud PDF Reader Backend API", "status": "running"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
