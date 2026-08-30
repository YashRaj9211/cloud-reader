import os
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

PROMETHEUS_PORT: int = int(os.getenv("PROMETHEUS_PORT", "9090"))
PROMETHEUS_ENABLED: bool = os.getenv("PROMETHEUS_ENABLED", "true").lower() in ("true", "1", "yes")

ZIPKIN_ENDPOINT: str = os.getenv("ZIPKIN_ENDPOINT", "http://localhost:9411/api/v2/spans")
OTEL_EXPORTER_OTLP_ENDPOINT: str = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
OTEL_EXPORTER_OTLP_HTTP_ENDPOINT: str = os.getenv("OTEL_EXPORTER_OTLP_HTTP_ENDPOINT", "http://localhost:4318")
OTEL_SERVICE_NAME: str = os.getenv("OTEL_SERVICE_NAME", "cloud-pdf-reader-backend")


def setup_prometheus(app: FastAPI):
    """
    Instruments FastAPI app with Prometheus metrics and exposes `/metrics`.
    """
    if PROMETHEUS_ENABLED:
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")
