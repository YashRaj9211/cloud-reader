import asyncio
from celery import shared_task
from celery_app import celery_app  # noqa: F401
from app.db import AsyncSessionLocal
from sqlalchemy import select
from app.models import BookNote, NoteStatus, NoteScope
from app.services.notes_service import generate_chapter_note, generate_full_book_note, detect_chapters


@shared_task(name="generate_chapter_notes_task", queue="notes", bind=True)
def generate_chapter_notes_task(self, note_id: str, book_id: str, chapter_title: str):
    """Generate notes for a single chapter."""
    async def run():
        async with AsyncSessionLocal() as db:
            stmt = select(BookNote).where(BookNote.id == note_id)
            result = await db.execute(stmt)
            note = result.scalar_one_or_none()
            if not note: return
            
            note.status = NoteStatus.GENERATING
            await db.commit()
            
            try:
                content = generate_chapter_note(book_id, chapter_title)
                note.content = content
                note.status = NoteStatus.COMPLETED
                await db.commit()
            except Exception as e:
                import traceback
                note.status = NoteStatus.FAILED
                note.error_message = f"{str(e)}\n{traceback.format_exc()}"
                await db.commit()

    asyncio.run(run())


@shared_task(name="generate_full_notes_task", queue="notes", bind=True)
def generate_full_notes_task(self, note_id: str, book_id: str, book_title: str):
    """Generate a holistic overview note for the full book."""
    async def run():
        async with AsyncSessionLocal() as db:
            stmt = select(BookNote).where(BookNote.id == note_id)
            result = await db.execute(stmt)
            note = result.scalar_one_or_none()
            if not note: return
            
            note.status = NoteStatus.GENERATING
            await db.commit()
            
            try:
                content = generate_full_book_note(book_id, book_title)
                note.content = content
                note.status = NoteStatus.COMPLETED
                await db.commit()
            except Exception as e:
                import traceback
                note.status = NoteStatus.FAILED
                note.error_message = f"{str(e)}\n{traceback.format_exc()}"
                await db.commit()

    asyncio.run(run())


@shared_task(name="orchestrate_notes_task", queue="notes")
def orchestrate_notes_task(book_id: str, user_id: str, scope: str, book_title: str = None):
    """
    Detects chapters (if scope is 'chapter') and dispatches a Celery task for each.
    If scope is 'full', dispatches a single full-book task.
    """
    async def run():
        async with AsyncSessionLocal() as db:
            if scope == NoteScope.CHAPTER.value:
                chapters = detect_chapters(book_id)
                for i, title in enumerate(chapters):
                    note = BookNote(
                        book_id=book_id,
                        user_id=user_id,
                        scope=NoteScope.CHAPTER,
                        chapter_title=title,
                        chapter_index=i,
                        status=NoteStatus.PENDING
                    )
                    db.add(note)
                    await db.commit() # commit to get ID
                    
                    generate_chapter_notes_task.delay(str(note.id), book_id, title)
            else:
                note = BookNote(
                    book_id=book_id,
                    user_id=user_id,
                    scope=NoteScope.FULL,
                    status=NoteStatus.PENDING
                )
                db.add(note)
                await db.commit()
                
                generate_full_notes_task.delay(str(note.id), book_id, book_title or "this book")

    asyncio.run(run())
