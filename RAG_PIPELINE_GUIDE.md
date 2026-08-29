# RAG Pipeline & ChromaDB Management Guide

This guide explains how to test, inspect, manage, and clear the **Chunking, Embedding, Indexing, and Vector Retrieval** pipeline in Cloud PDF Reader.

---

## 1. Quick CLI Management Tool

A utility CLI script is available at `backend/inspect_pipeline.py`.

Navigate to your backend directory:
```powershell
cd d:\Codes\cloud-pdf-reader\backend
```

### Commands

| Command | Purpose |
| :--- | :--- |
| `python inspect_pipeline.py status` | View the status of **Database (NeonDB)**, **Celery/Redis queues**, and **ChromaDB collections**. |
| `python inspect_pipeline.py chroma` | Inspect Chroma collections in detail, see total chunk counts and document samples. |
| `python inspect_pipeline.py query "<question>"` | Test semantic vector search across all indexed collections. |
| `python inspect_pipeline.py clear` | **Clear all** background task queues, ChromaDB collections, and DB processing statuses. |

---

## 2. Testing End-to-End Pipeline on Local PDFs

A full pipeline test script is located at `backend/test_pipeline.py`.

It executes the complete lifecycle:
1. **PDF Text Extraction** (`app.services.parse_pdf`)
2. **Text Chunking** (`app.services.chunking_service`)
3. **NVIDIA Embedding Generation** (`app.services.embedding_service`)
4. **ChromaDB Vector Upsert** (`app.services.chroma_service`)
5. **Semantic Retrieval / Verification**

### Run Test:
```powershell
cd d:\Codes\cloud-pdf-reader\backend
python test_pipeline.py
```

---

## 3. Manual Inspection with Python / Code

### Inspect ChromaDB
```python
import chromadb

client = chromadb.HttpClient(host="localhost", port=8001)

# List all collections
collections = client.list_collections()
for c in collections:
    print(f"Collection: {c.name} | Items: {c.count()} | Metadata: {c.metadata}")

# Peek at documents inside a collection
if collections:
    sample_coll = collections[0]
    print(sample_coll.peek(limit=3))
```

### Inspect Redis Celery Task Queue
```python
import redis

r = redis.from_url("redis://localhost:6379/0")

# Check queued items in the 'processing' queue
queue_len = r.llen("processing")
print(f"Pending tasks in 'processing' queue: {queue_len}")

# List all Redis keys
print("All Redis keys:", r.keys("*"))
```

### Inspect Database RAG Status (Neon PostgreSQL)
```python
import asyncio
from app.db import AsyncSessionLocal
from sqlalchemy import select
from app.models import BookRagStatus

async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(BookRagStatus))
        for item in result.scalars().all():
            print(f"Book: {item.book_id} | Status: {item.status} | Chunks: {item.total_chunks} | Error: {item.error_message}")

asyncio.run(check())
```

---

## 4. Architecture & Configuration Reference

- **Vector Database**: ChromaDB running on port `8001` (`http://localhost:8001`)
- **Queue / Broker**: Redis running on port `6379` (`redis://localhost:6379/0`)
- **Embeddings**: NVIDIA API using `nvidia/nemotron-3-embed-1b` (2048-dim vectors)
- **Reranker**: `nvidia/llama-nemotron-rerank-vl-1b-v2`
- **Default Chunking Config**:
  - `CHUNK_SIZE`: `1500` characters
  - `CHUNK_OVERLAP`: `400` characters
  - `RAG_TOP_K`: `10`
