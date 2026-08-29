from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth_router, books_router, sync_router
from app.config import FRONTEND_URL

app = FastAPI(
    title="Cloud PDF Reader API",
    description="Backend API managing Google Authentication and Google Drive PDF sync/storage.",
    version="1.0.0"
)

# Configure CORS
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under /api
app.include_router(auth_router, prefix="/api")
app.include_router(books_router, prefix="/api")
app.include_router(sync_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Cloud PDF Reader Backend API", "status": "running"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}