import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import json
import logging
import re
import socket
import urllib.request
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

import app.configs.env_loader

DATABASE_URL: str = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL") or os.getenv("DB", "")
DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "5"))
DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))


def _resolve_ip(hostname: str) -> str | None:
    """Resolves hostname via system DNS or Google/Cloudflare DoH if ISP blocks domain."""
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        pass

    doh_endpoints = [
        f"https://dns.google/resolve?name={hostname}&type=A",
        f"https://cloudflare-dns.com/dns-query?name={hostname}&type=A",
    ]
    for doh_url in doh_endpoints:
        try:
            req = urllib.request.Request(
                doh_url,
                headers={"Accept": "application/dns-json", "User-Agent": "FastAPI-DNS-Fallback"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                for ans in data.get("Answer", []):
                    if ans.get("type") == 1:
                        return ans.get("data")
        except Exception:
            pass
    return None


def _create_database_engine(raw_url: str):
    if not raw_url:
        return None

    # Strip sslmode and channel_binding query params for clean parsing
    clean_url = re.sub(
        r"([?&])(sslmode|channel_binding)=[^&]+",
        "",
        raw_url,
    ).rstrip("?&")

    parsed = urlparse(clean_url)
    hostname = parsed.hostname
    connect_args = {}

    if hostname:
        resolved_ip = _resolve_ip(hostname)
        if resolved_ip:
            if "neon.tech" in hostname:
                endpoint = hostname.split(".")[0]
                connect_args["sslmode"] = "require"
                connect_args["options"] = f"endpoint={endpoint}"
            port_str = f":{parsed.port}" if parsed.port else ":5432"
            auth = f"{parsed.username}:{parsed.password}@" if parsed.username else ""
            clean_url = urlunparse(parsed._replace(netloc=f"{auth}{resolved_ip}{port_str}"))

    # TCP keepalives to prevent idle SSL drops by Neon / NAT gateways
    connect_args.setdefault("keepalives", 1)
    connect_args.setdefault("keepalives_idle", 30)
    connect_args.setdefault("keepalives_interval", 10)
    connect_args.setdefault("keepalives_count", 5)

    # ponytail: Synchronous psycopg2 engine with pre-ping and recycle.
    # Ceiling: Max 15 concurrent pooled DB connections.
    # Upgrade path: Migrate all routers to asyncpg + AsyncSession when high concurrency is required.
    return create_engine(
        clean_url,
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "180")),
        connect_args=connect_args,
    )


try:
    engine = _create_database_engine(DATABASE_URL)
except Exception as e:
    logger.warning("Database engine initialization failed: %s", e)
    engine = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
Base = declarative_base()

def get_db():
    """
    FastAPI dependency that yields a SQLAlchemy database session.
    """
    if not SessionLocal:
        raise RuntimeError("Database engine not initialized. Please verify DB connection string.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
