"""
Chunking Service
================
Splits book Markdown (output of parse_pdf) into overlapping text chunks,
attaching page-level metadata to each chunk for later attribution.

Strategy
--------
- Use LangChain's MarkdownTextSplitter for structure-aware splitting.
- Fall back to RecursiveCharacterTextSplitter if Markdown headers are absent.
- Each chunk carries metadata: book_id, user_id, page_number (best-effort),
  chunk_index, and a human-readable source label.
"""
import re
from typing import List, Dict, Any

from langchain_text_splitters import (
    MarkdownTextSplitter,
    RecursiveCharacterTextSplitter,
)

from app.config import CHUNK_SIZE, CHUNK_OVERLAP


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_PAGE_MARKER_RE = re.compile(r"<!--\s*page[:\s]*(\d+)\s*-->", re.IGNORECASE)


def _estimate_page_numbers(text: str) -> Dict[int, int]:
    """
    Builds a char-offset → page_number map by scanning for PDF-inspector's
    embedded page markers in the Markdown (e.g., <!-- page: 3 -->).
    Falls back to a simple character-offset estimate if none are found.
    """
    markers: Dict[int, int] = {}
    for m in _PAGE_MARKER_RE.finditer(text):
        markers[m.start()] = int(m.group(1))

    if not markers:
        # No markers — estimate: 2000 chars ≈ 1 page (rough guess)
        chars_per_page = 2000
        total_pages = max(1, len(text) // chars_per_page + 1)
        for i in range(total_pages):
            markers[i * chars_per_page] = i + 1

    return markers


def _page_at_offset(offset: int, page_map: Dict[int, int]) -> int:
    """Returns the page number for a given character offset."""
    page = 1
    for char_pos, pg in sorted(page_map.items()):
        if char_pos <= offset:
            page = pg
        else:
            break
    return page


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def chunk_markdown(
    markdown_text: str,
    book_id: str,
    user_id: str,
) -> List[Dict[str, Any]]:
    """
    Split a book's Markdown into overlapping chunks.

    Parameters
    ----------
    markdown_text : str
        Full Markdown output from parse_pdf.
    book_id : str
        Google Drive file ID — used as metadata on each chunk.
    user_id : str
        Google user ID — used as metadata on each chunk.

    Returns
    -------
    List of dicts, each with:
        {
            "text":        str,   # the chunk text
            "chunk_index": int,   # 0-based ordering
            "page":        int,   # estimated page number
            "book_id":     str,
            "user_id":     str,
        }
    """
    if not markdown_text or not markdown_text.strip():
        return []

    page_map = _estimate_page_numbers(markdown_text)

    # Try Markdown-aware splitter first (preserves header context)
    md_splitter = MarkdownTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    raw_chunks = md_splitter.split_text(markdown_text)

    # If Markdown splitter produces too few chunks, fall back to recursive
    if len(raw_chunks) <= 1 and len(markdown_text) > CHUNK_SIZE * 2:
        fallback_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=["\n\n", "\n", " ", ""],
        )
        raw_chunks = fallback_splitter.split_text(markdown_text)

    # Build chunk dicts with metadata
    chunks: List[Dict[str, Any]] = []
    search_start = 0
    for idx, chunk_text in enumerate(raw_chunks):
        # Locate this chunk in the original text (approximate)
        pos = markdown_text.find(chunk_text[:60], search_start)
        if pos == -1:
            pos = search_start  # fallback if text was modified by splitter

        page = _page_at_offset(pos, page_map)
        chunks.append({
            "text": chunk_text,
            "chunk_index": idx,
            "page": page,
            "book_id": book_id,
            "user_id": user_id,
        })

        # Advance search_start, keeping some overlap window
        search_start = max(0, pos + len(chunk_text) - CHUNK_OVERLAP)

    return chunks
