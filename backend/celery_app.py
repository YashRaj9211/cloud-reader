from celery import Celery
from app.config import REDIS_URL

celery_app = Celery(
    "cloud_pdf_reader",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks.processing",
        "app.tasks.notes",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Task routing: all heavy tasks go to the default queue
    task_routes={
        "app.tasks.processing.*": {"queue": "processing"},
        "app.tasks.notes.*": {"queue": "notes"},
    },
    # Retry config for transient failures
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)
