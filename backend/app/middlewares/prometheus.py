import time
import logging
from typing import Callable
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import Counter, Histogram, Gauge
try:
    from prometheus_fastapi_instrumentator import Instrumentator
except ImportError:
    Instrumentator = None

logger = logging.getLogger("api.monitoring")

# Standard Prometheus Metrics
HTTP_REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total count of HTTP requests",
    ["method", "endpoint", "status_code"]
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint", "status_code"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently in flight",
    ["method", "endpoint"]
)

HTTP_EXCEPTIONS_TOTAL = Counter(
    "http_exceptions_total",
    "Total count of unhandled exceptions in HTTP requests",
    ["method", "endpoint", "exception_type"]
)


class PrometheusLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Measures request latency, request counts, errors, and in-progress requests via Prometheus.
    2. Logs structured HTTP request/response information (method, path, status_code, processing time, client IP).
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Ignore prometheus scrape endpoint in tracking to avoid metric pollution
        path = request.url.path
        if path == "/metrics":
            return await call_next(request)

        method = request.method
        # Try to resolve route pattern (e.g. /api/books/{book_id}) to prevent high cardinality
        endpoint = path
        for route in request.app.routes:
            if hasattr(route, "matches"):
                match, _ = route.matches(request.scope)
                if getattr(match, "name", "") == "FULL" and hasattr(route, "path"):
                    endpoint = getattr(route, "path_format", route.path)
                    break

        client_ip = request.client.host if request.client else "unknown"
        start_time = time.perf_counter()

        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).inc()

        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception as exc:
            HTTP_EXCEPTIONS_TOTAL.labels(
                method=method,
                endpoint=endpoint,
                exception_type=type(exc).__name__
            ).inc()
            logger.error(
                f"Unhandled exception on {method} {path}: {exc}",
                exc_info=True,
                extra={"method": method, "path": path, "client_ip": client_ip}
            )
            raise exc
        finally:
            duration = time.perf_counter() - start_time

            # Update Prometheus metrics
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).dec()
            HTTP_REQUEST_COUNT.labels(
                method=method,
                endpoint=endpoint,
                status_code=str(status_code)
            ).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=method,
                endpoint=endpoint,
                status_code=str(status_code)
            ).observe(duration)

            # Log request details
            duration_ms = round(duration * 1000, 2)
            log_msg = f"{method} {path} - {status_code} ({duration_ms}ms) [Client: {client_ip}]"

            if status_code >= 500:
                logger.error(log_msg)
            elif status_code >= 400:
                logger.warning(log_msg)
            else:
                logger.info(log_msg)


def setup_prometheus_and_monitoring(app: FastAPI, endpoint: str = "/metrics") -> Instrumentator:
    """
    Sets up custom Prometheus logging/monitoring middleware and exposes the /metrics endpoint.
    """
    # Add custom logging and metrics middleware
    app.add_middleware(PrometheusLoggingMiddleware)

    # Initialize Instrumentator and expose endpoint if available
    if Instrumentator:
        instrumentator = Instrumentator(
            should_group_status_codes=False,
            should_ignore_untemplated=True,
            should_respect_env_var=True,
            excluded_handlers=["/metrics", "/docs", "/openapi.json", "/redoc"]
        )
        instrumentator.instrument(app).expose(app, endpoint=endpoint, include_in_schema=True)
        return instrumentator
    return None
