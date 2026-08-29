"""
CLI Utility to inspect and manage Cloud PDF Reader pipelines, ChromaDB collections, and Redis queues.

Usage:
  python inspect_pipeline.py status      # View all current status (DB, Redis, Chroma)
  python inspect_pipeline.py chroma      # Detailed view of ChromaDB collections and chunks
  python inspect_pipeline.py clear       # Clear all queues, chroma collections, and RAG statuses
  python inspect_pipeline.py query "..." # Test semantic query against indexed collections
"""

import sys
import os
import argparse
import asyncio

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import redis
import chromadb
from sqlalchemy import select, delete
from app.config import REDIS_URL, CHROMA_HOST, CHROMA_PORT
from app.db import AsyncSessionLocal
from app.models import BookRagStatus
from app.services.embedding_service import embed_query


def get_chroma_client():
    return chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)


def get_redis_client():
    return redis.from_url(REDIS_URL)


async def show_db_status():
    print("\n--- [Neon Database: BookRagStatus] ---")
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(BookRagStatus))
        records = res.scalars().all()
        if not records:
            print("  (No processing pipeline records found)")
        for r in records:
            print(f"  • Book ID: {r.book_id}")
            print(f"    Status   : {r.status.value if hasattr(r.status, 'value') else r.status}")
            print(f"    Chunks   : {r.total_chunks}")
            print(f"    User ID  : {r.user_id}")
            if r.error_message:
                print(f"    Error    : {r.error_message}")


def show_redis_status():
    print("\n--- [Redis Task Queues] ---")
    try:
        r = get_redis_client()
        keys = r.keys("*")
        if not keys:
            print("  (Queue is empty)")
        for k in keys:
            k_name = k.decode("utf-8", errors="ignore")
            k_type = r.type(k).decode("utf-8", errors="ignore")
            extra = f" (items: {r.llen(k)})" if k_type == "list" else ""
            print(f"  • Key: {k_name} [{k_type}]{extra}")
    except Exception as e:
        print(f"  Error inspecting Redis: {e}")


def show_chroma_status(detailed=False):
    print("\n--- [ChromaDB Collections] ---")
    try:
        client = get_chroma_client()
        colls = client.list_collections()
        if not colls:
            print("  (No collections in ChromaDB)")
            return
        for c in colls:
            print(f"  • Collection: {c.name}")
            print(f"    Count     : {c.count()} chunks")
            print(f"    Metadata  : {c.metadata}")
            if detailed and c.count() > 0:
                data = c.peek(limit=3)
                print(f"    Sample docs (first {len(data['documents'])}):")
                for doc, meta in zip(data["documents"], data["metadatas"]):
                    preview = doc.replace("\n", " ")[:90]
                    print(f"      - [Page {meta.get('page')}] {preview}...")
    except Exception as e:
        print(f"  Error inspecting ChromaDB: {e}")


async def clear_all():
    print("\n[Clearing Pipelines and Storage]")
    # 1. Redis
    try:
        r = get_redis_client()
        r.flushdb()
        print("  ✓ Redis task queue cleared.")
    except Exception as e:
        print(f"  ✗ Redis error: {e}")

    # 2. Chroma
    try:
        client = get_chroma_client()
        for c in client.list_collections():
            client.delete_collection(c.name)
            print(f"  ✓ Deleted Chroma collection: {c.name}")
    except Exception as e:
        print(f"  ✗ Chroma error: {e}")

    # 3. Database
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(BookRagStatus))
            await db.commit()
        print("  ✓ Cleared all BookRagStatus rows in DB.")
    except Exception as e:
        print(f"  ✗ DB error: {e}")


def query_chroma(query_text: str):
    print(f"\n--- [Querying ChromaDB with: '{query_text}'] ---")
    try:
        client = get_chroma_client()
        colls = client.list_collections()
        if not colls:
            print("  No collections found to query.")
            return
        
        q_emb = embed_query(query_text)
        for c in colls:
            print(f"\nResults in collection '{c.name}' ({c.metadata.get('book_id', 'unknown')}):")
            res = c.query(query_embeddings=[q_emb], n_results=3, include=["documents", "metadatas", "distances"])
            for doc, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
                preview = doc.replace("\n", " ")[:120]
                print(f"  • [Score/Dist: {dist:.4f} | Page {meta.get('page')}]: {preview}...")
    except Exception as e:
        print(f"  Error during Chroma query: {e}")


def main():
    parser = argparse.ArgumentParser(description="Inspect & Manage RAG Pipeline components")
    parser.add_argument("action", choices=["status", "chroma", "clear", "query"], default="status", nargs="?", help="Action to run")
    parser.add_argument("query_str", nargs="?", default="", help="Query string when action is 'query'")
    args = parser.parse_args()

    if args.action == "status":
        asyncio.run(show_db_status())
        show_redis_status()
        show_chroma_status(detailed=False)
    elif args.action == "chroma":
        show_chroma_status(detailed=True)
    elif args.action == "clear":
        asyncio.run(clear_all())
    elif args.action == "query":
        if not args.query_str:
            print("Please provide a query string. Example: python inspect_pipeline.py query \"what is attention\"")
        else:
            query_chroma(args.query_str)


if __name__ == "__main__":
    main()
