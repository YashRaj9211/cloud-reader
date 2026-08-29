import asyncio
from celery import shared_task
from celery_app import celery_app  # noqa: F401
from app.db import AsyncSessionLocal
from sqlalchemy import select
from app.models import BookRagStatus, IndexStatus
from app.services.parse_pdf import parse_pdf_from_drive
from app.services.chunking_service import chunk_text
from app.services.embedding_service import embed_texts
from app.services.chroma_service import add_chunks_to_chroma

@shared_task(name="process_book_task", queue="processing", bind=True, max_retries=3)
def process_book_task(self, book_id: str, user_id: str, token: str = None):
    """
    Background task to process a book:
    1. Parse PDF from Google Drive
    2. Chunk text
    3. Generate embeddings
    4. Store in ChromaDB
    """
    async def run_processing():
        async with AsyncSessionLocal() as db:
            # 1. Get status record and mark as PROCESSING
            stmt = select(BookRagStatus).where(BookRagStatus.book_id == book_id, BookRagStatus.user_id == user_id)
            result = await db.execute(stmt)
            status_record = result.scalar_one_or_none()
            
            if not status_record:
                return
                
            status_record.status = IndexStatus.PROCESSING
            await db.commit()
            
            try:
                # 2. Parse PDF
                print(f"[{book_id}] Parsing PDF...")
                pages = await parse_pdf_from_drive(book_id, user_id, token=token)
                
                # 3. Chunk text
                print(f"[{book_id}] Chunking text...")
                chunks = chunk_text(pages)
                total_chunks = len(chunks)
                status_record.total_chunks = total_chunks
                await db.commit()
                
                if total_chunks == 0:
                    print(f"[{book_id}] No extractable text found in PDF.")
                    status_record.status = IndexStatus.FAILED
                    status_record.error_message = "No extractable text found in PDF. The document may be scanned or empty."
                    await db.commit()
                    return

                # 4. Embed chunks (batching logic would go here for large lists)
                print(f"[{book_id}] Embedding {total_chunks} chunks...")
                texts = [c["text"] for c in chunks]
                # Embed in batches of 100 to avoid API limits
                embeddings = []
                batch_size = 100
                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i + batch_size]
                    embeddings.extend(embed_texts(batch))
                
                # 5. Store in ChromaDB
                print(f"[{book_id}] Storing in ChromaDB...")
                add_chunks_to_chroma(book_id, chunks, embeddings)
                
                # 6. Mark as COMPLETED
                status_record.status = IndexStatus.COMPLETED
                await db.commit()
                print(f"[{book_id}] Processing complete.")
                
            except Exception as e:
                import traceback
                error_msg = f"{str(e)}\n{traceback.format_exc()}"
                status_record.status = IndexStatus.FAILED
                status_record.error_message = error_msg
                await db.commit()
                raise self.retry(exc=e, countdown=60)

    # Run the async function synchronously within the Celery worker thread
    asyncio.run(run_processing())
