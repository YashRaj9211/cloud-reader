import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_URL
from app.middlewares import AuthenticationMiddleware, setup_prometheus_and_monitoring
from app.routes import api_router
from app.configs.kafka.config import get_kafka_producer, stop_kafka_producer
from app.pipeline.runner import start_pipeline_workers, stop_pipeline_workers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing Cloud PDF Reader backend...")
    try:
        await get_kafka_producer()
        logger.info("Kafka producer initialized.")
    except Exception as ke:
        logger.warning("Kafka producer could not be started on startup: %s", ke)

    # Optional in-app worker runner (defaults to True for convenient single-process development)
    enable_in_app_workers = os.getenv("ENABLE_IN_APP_PIPELINE_WORKERS", "true").lower() in ("true", "1", "yes")
    if enable_in_app_workers:
        try:
            await start_pipeline_workers(in_background=True)
            logger.info("In-app Kafka pipeline workers started in background.")
        except Exception as we:
            logger.warning("Could not start in-app pipeline workers: %s", we)

    yield

    # Shutdown
    logger.info("Shutting down Cloud PDF Reader backend...")
    if enable_in_app_workers:
        try:
            await stop_pipeline_workers()
        except Exception as we:
            logger.warning("Error stopping pipeline workers: %s", we)

    try:
        await stop_kafka_producer()
    except Exception as ke:
        logger.warning("Error stopping Kafka producer: %s", ke)


app = FastAPI(
    title="Cloud PDF Reader API",
    description="Backend API managing Google Authentication, Google Drive PDF sync, and Kafka indexing pipeline.",
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

# Authentication & OAuth Session Middleware
app.add_middleware(AuthenticationMiddleware)

# Register consolidated API Router (public + private authenticated routes under /api)
app.include_router(api_router)

# Setup Prometheus metrics and request logging middleware (/metrics endpoint)
setup_prometheus_and_monitoring(app)


@app.get("/")
def read_root():
    return {"message": "Cloud PDF Reader Backend API", "status": "running"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
