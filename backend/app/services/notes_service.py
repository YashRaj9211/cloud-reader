"""
Notes Service
=============
Generates comprehensive Markdown notes from book content.

Two modes:
  1. CHAPTER mode  — LLM identifies chapters, then notes are generated
                     per chapter as individual Celery tasks.
  2. FULL mode     — A single notes document is generated for the entire book.

The service:
  a) Uses the vector store to retrieve relevant chunks per chapter/topic.
  b) Calls the NVIDIA LLM to generate structured Markdown notes.
  c) Returns the note content to be persisted in NeonDB by the calling task.
"""
import re
from typing import List, Dict, Any, Optional

from openai import OpenAI

from app.config import NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_LLM_MODEL, RAG_TOP_K
from app.services.embedding_service import embed_query
from app.services.chroma_service import query_collection
from app.services.reranking_service import rerank_chunks


# ---------------------------------------------------------------------------
# Sync LLM client (used inside Celery tasks which are sync by default)
# ---------------------------------------------------------------------------

_llm = OpenAI(
    api_key=NVIDIA_API_KEY,
    base_url=NVIDIA_BASE_URL,
)


# ---------------------------------------------------------------------------
# Chapter detection
# ---------------------------------------------------------------------------

_CHAPTER_RE = re.compile(
    r"^#{1,3}\s*(chapter\s+\d+|part\s+\d+|section\s+\d+|unit\s+\d+|[\d]+\.?\s+\w+.*)",
    re.IGNORECASE | re.MULTILINE,
)


def detect_chapters(markdown_text: str) -> List[Dict[str, Any]]:
    """
    Scan the book's Markdown for chapter/section headings.

    Returns
    -------
    List of dicts:
        {
            "title":       str,   # cleaned heading text
            "index":       int,   # 0-based order
            "start_char":  int,   # character offset in markdown_text
            "excerpt":     str,   # first 500 chars of the chapter
        }
    """
    matches = list(_CHAPTER_RE.finditer(markdown_text))

    if not matches:
        # No detectable chapters — treat entire book as one unit
        return [{
            "title": "Full Book",
            "index": 0,
            "start_char": 0,
            "excerpt": markdown_text[:500],
        }]

    chapters = []
    for i, match in enumerate(matches):
        title = re.sub(r"^#+\s*", "", match.group(0)).strip()
        start = match.start()
        # Excerpt: text from this heading to the next (or end), up to 500 chars
        end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown_text)
        excerpt = markdown_text[start:end][:500]

        chapters.append({
            "title": title,
            "index": i,
            "start_char": start,
            "excerpt": excerpt,
        })

    return chapters


# ---------------------------------------------------------------------------
# Note generation prompts
# ---------------------------------------------------------------------------

_NOTES_SYSTEM_PROMPT = """\
You are an expert study note writer. Given excerpts from a book chapter, 
generate comprehensive, well-structured study notes in Markdown.

Your notes should include:
- A brief chapter summary (2-3 sentences)
- Key concepts and definitions (as a bullet list or definition list)
- Important facts, arguments, or examples
- Key takeaways / things to remember

Use clear Markdown formatting: headings (##, ###), bullet points, bold for
key terms, and code blocks if there is code. Be thorough but concise.
Do not add information that is not in the provided excerpts.
"""


def _generate_notes_for_context(
    chapter_title: str,
    context_chunks: List[Dict[str, Any]],
) -> str:
    """
    Call the LLM to generate notes for a single chapter given its context chunks.
    """
    if not context_chunks:
        return f"## {chapter_title}\n\n*No content found for this chapter.*"

    context_parts = []
    for i, chunk in enumerate(context_chunks, 1):
        page_info = f"[Page {chunk['page']}]" if chunk.get("page") else ""
        context_parts.append(f"Excerpt {i} {page_info}:\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)

    user_message = (
        f"Generate comprehensive study notes for the chapter: **{chapter_title}**\n\n"
        f"Book excerpts:\n\n{context}"
    )

    response = _llm.chat.completions.create(
        model=NVIDIA_LLM_MODEL,
        messages=[
            {"role": "system", "content": _NOTES_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
        max_tokens=2048,
    )

    return response.choices[0].message.content or f"## {chapter_title}\n\n*Generation failed.*"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_chapter_notes(
    book_id: str,
    user_id: str,
    chapter_title: str,
    chapter_excerpt: str,
) -> str:
    """
    Generate Markdown notes for a single chapter.

    Uses the chapter title + excerpt as a query to retrieve relevant
    chunks from ChromaDB, then calls the LLM.

    Parameters
    ----------
    chapter_title   : heading text (used as query)
    chapter_excerpt : first ~500 chars of the chapter (for richer query)

    Returns
    -------
    Markdown string with the generated notes.
    """
    query = f"{chapter_title}: {chapter_excerpt}"
    query_vector = embed_query(query)

    retrieved = query_collection(
        user_id=user_id,
        book_id=book_id,
        query_embedding=query_vector,
        top_k=RAG_TOP_K,
    )

    reranked = rerank_chunks(query=chapter_title, chunks=retrieved)

    return _generate_notes_for_context(chapter_title, reranked)


def generate_full_book_notes(
    book_id: str,
    user_id: str,
    book_title: str = "This Book",
) -> str:
    """
    Generate a holistic summary/notes document for the entire book.
    Uses a broad query to pull a wide variety of chunks.
    """
    query = f"main themes, key concepts, and important ideas in {book_title}"
    query_vector = embed_query(query)

    # Retrieve more chunks for a full-book overview
    retrieved = query_collection(
        user_id=user_id,
        book_id=book_id,
        query_embedding=query_vector,
        top_k=min(RAG_TOP_K * 2, 20),
    )
    reranked = rerank_chunks(query=query, chunks=retrieved, top_n=10)

    return _generate_notes_for_context(f"Full Book Overview: {book_title}", reranked)
