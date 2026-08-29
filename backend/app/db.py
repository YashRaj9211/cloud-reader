import json
import logging
import re
import socket
import ssl
import urllib.request
from typing import AsyncGenerator
from urllib.parse import urlparse, urlunparse

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import NEON_DATABASE_URL

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _resolve_ip(hostname: str) -> str | None:
    # 1. Try standard system DNS
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        pass

    # 2. Fallback to Google / Cloudflare DNS-over-HTTPS if ISP DNS blocks/refuses the domain
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
                if "Answer" in data:
                    for ans in data["Answer"]:
                        if ans.get("type") == 1:  # Type A
                            return ans.get("data")
        except Exception as e:
            logger.warning("DoH resolution error for %s on %s: %s", hostname, doh_url, e)
    return None


url = re.sub(
    r"([?&])(sslmode|channel_binding)=[^&]+",
    "",
    NEON_DATABASE_URL,
).rstrip("?&")

url = url.replace(
    "postgresql://",
    "postgresql+asyncpg://",
    1,
)

connect_args = {}
ssl_context = ssl.create_default_context()

if NEON_DATABASE_URL:
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if hostname:
            resolved_ip = _resolve_ip(hostname)
            if resolved_ip:
                # If resolved via direct IP or Neon hostname
                if "neon.tech" in hostname:
                    endpoint = hostname.split(".")[0]
                    connect_args["server_settings"] = {"options": f"endpoint={endpoint}"}
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE
                port_str = f":{parsed.port}" if parsed.port else ":5432"
                auth = f"{parsed.username}:{parsed.password}@" if parsed.username else ""
                netloc = f"{auth}{resolved_ip}{port_str}"
                url = urlunparse(parsed._replace(netloc=netloc))
    except Exception as exc:
        logger.warning("Failed to parse or resolve database URL: %s", exc)

connect_args["ssl"] = ssl_context

engine = create_async_engine(
    url,
    connect_args=connect_args,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session