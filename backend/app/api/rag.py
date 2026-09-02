from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi.responses import StreamingResponse

from app.db import get_db
from app.models import BookRagStatus, IndexStatus, BookNote, NoteScope, NoteStatus, ChatMessage
from app.services.session import get_current_user_and_token, get_current_user
from app.schemas import (
    ProcessBookResponse,
    RagStatusResponse,
    ChatRequest,
    ChatResponse,
    GenerateNotesRequest,
    GenerateNotesResponse,
    NoteResponse
)
from app.services.rag_service import chat_stream

# We need to trigger celery tasks
from app.tasks.processing import process_book_task
from app.tasks.notes import orchestrate_notes_task, generate_chapter_notes_task, generate_full_notes_task

router = APIRouter(tags=["RAG"])


@router.post("/rag/{book_id}/process", response_model=ProcessBookResponse)
async def process_book(
    book_id: str,
    auth_data=Depends(get_current_user_and_token),
    db: AsyncSession = Depends(get_db)
):
    user, token = auth_data
    # Check if already processing
    stmt = select(BookRagStatus).where(BookRagStatus.book_id == book_id, BookRagStatus.user_id == user.id)
    result = await db.execute(stmt)
    status_record = result.scalar_one_or_none()
    
    if not status_record:
        status_record = BookRagStatus(book_id=book_id, user_id=user.id, status=IndexStatus.PENDING)
        db.add(status_record)
    else:
        if status_record.status == IndexStatus.PROCESSING:
            raise HTTPException(status_code=400, detail="Book is already being processed.")
        status_record.status = IndexStatus.PENDING
        status_record.error_message = None
        
    await db.commit()
    
    # Trigger celery task with token
    task = process_book_task.delay(book_id, user.id, token)
    
    status_record.celery_task_id = task.id
    await db.commit()
    
    return ProcessBookResponse(book_id=book_id, task_id=task.id, message="Processing started.")


@router.get("/rag/{book_id}/status", response_model=RagStatusResponse)
async def get_rag_status(
    book_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BookRagStatus).where(BookRagStatus.book_id == book_id, BookRagStatus.user_id == user.id)
    result = await db.execute(stmt)
    status_record = result.scalar_one_or_none()
    
    if not status_record:
        raise HTTPException(status_code=404, detail="RAG status not found for this book.")
        
    # Verify vector store integrity if status claims completed
    if status_record.status == IndexStatus.COMPLETED:
        from app.services.chroma_service import count_book_chunks
        chunk_count = count_book_chunks(book_id)
        if chunk_count == 0:
            status_record.status = IndexStatus.FAILED
            status_record.error_message = "Vector index is missing from database. Please click Re-index."
            await db.commit()

    return RagStatusResponse(
        book_id=status_record.book_id,
        status=status_record.status.value,
        total_chunks=status_record.total_chunks,
        error_message=status_record.error_message,
        updated_at=status_record.updated_at.isoformat() if status_record.updated_at else None
    )



@router.post("/rag/{book_id}/chat")
async def chat_with_book(
    book_id: str,
    request: ChatRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BookRagStatus).where(BookRagStatus.book_id == book_id, BookRagStatus.user_id == user.id)
    result = await db.execute(stmt)
    status_record = result.scalar_one_or_none()
    
    if not status_record or status_record.status != IndexStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Book is not fully indexed yet.")
        
    if request.stream:
        async def event_generator():
            try:
                for token in chat_stream(book_id, request.query):
                    # Replace newlines with spaces or proper SSE formatting
                    safe_token = token.replace("\n", "\\n")
                    yield f"data: {safe_token}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                yield f"data: ERROR: {str(e)}\n\n"
                
        return StreamingResponse(event_generator(), media_type="text/event-stream")
    else:
        # Non-streaming not implemented for brevity, would just collect the tokens
        raise HTTPException(status_code=501, detail="Non-streaming chat not implemented.")


@router.post("/rag/{book_id}/notes/generate", response_model=GenerateNotesResponse)
async def generate_notes(
    book_id: str,
    request: GenerateNotesRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BookRagStatus).where(BookRagStatus.book_id == book_id, BookRagStatus.user_id == user.id)
    result = await db.execute(stmt)
    status_record = result.scalar_one_or_none()
    
    if not status_record or status_record.status != IndexStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Book is not fully indexed yet.")
        
    scope_enum = NoteScope(request.scope)
    
    task = orchestrate_notes_task.delay(book_id, user.id, scope_enum.value, request.book_title)
    
    return GenerateNotesResponse(
        book_id=book_id,
        scope=request.scope,
        orchestrator_task_id=task.id,
        message=f"Started {request.scope} note generation."
    )


@router.get("/rag/{book_id}/notes")
async def get_notes(
    book_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BookNote).where(BookNote.book_id == book_id, BookNote.user_id == user.id).order_by(BookNote.chapter_index)
    result = await db.execute(stmt)
    notes = result.scalars().all()
    
    return [
        NoteResponse(
            id=str(n.id),
            book_id=n.book_id,
            scope=n.scope.value,
            chapter_title=n.chapter_title,
            chapter_index=n.chapter_index,
            content=n.content,
            status=n.status.value,
            error_message=n.error_message,
            updated_at=n.updated_at.isoformat() if n.updated_at else None
        )
        for n in notes
    ]


@router.post("/rag/{book_id}/notes/{note_id}/retry")
async def retry_note(
    book_id: str,
    note_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BookNote).where(
        BookNote.id == note_id,
        BookNote.book_id == book_id,
        BookNote.user_id == user.id
    )
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    note.status = NoteStatus.PENDING
    note.error_message = None
    await db.commit()
    
    if note.scope == NoteScope.CHAPTER:
        generate_chapter_notes_task.delay(str(note.id), book_id, note.chapter_title or "Chapter")
    else:
        generate_full_notes_task.delay(str(note.id), book_id, "this book")
        
    return {"message": "Retrying note generation", "note_id": note_id}


@router.delete("/rag/{book_id}/notes")
async def clear_notes(
    book_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import delete
    await db.execute(
        delete(BookNote).where(
            BookNote.book_id == book_id,
            BookNote.user_id == user.id
        )
    )
    await db.commit()
    return {"message": "All notes cleared for this book"}
