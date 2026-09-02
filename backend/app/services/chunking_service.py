import re
from typing import List, Dict, Any
import tiktoken

# Initialize tokenizer (cl100k_base used by modern embeddings/LLMs)
try:
    _tokenizer = tiktoken.get_encoding("cl100k_base")
except Exception:
    _tokenizer = tiktoken.encoding_for_model("gpt-4o")


def clean_text(text: str) -> str:
    """
    Cleans up text by stripping Markdown formatting, excess hashes, asterisks,
    HTML tags, and normalizes whitespaces.
    """
    if not text:
        return ""

    # Remove code blocks ```...```
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Remove inline code `...`
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Remove markdown headers (# Header, ## Header, etc.)
    text = re.sub(r'^[ \t]*#+[ \t]*', '', text, flags=re.MULTILINE)
    # Remove bold / italic markers (**text**, *text*, __text__, _text_)
    text = re.sub(r'[*_]{1,3}([^*_]+)[*_]{1,3}', r'\1', text)
    # Remove markdown links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove markdown images ![alt](url) -> ""
    text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', '', text)
    # Remove blockquotes (> quote)
    text = re.sub(r'^[ \t]*>[ \t]*', '', text, flags=re.MULTILINE)
    # Remove bullet/list markers (* item, - item, + item, 1. item)
    text = re.sub(r'^[ \t]*[-*+][ \t]+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[ \t]*\d+\.[ \t]+', '', text, flags=re.MULTILINE)
    # Remove horizontal rules (---, ___, ***)
    text = re.sub(r'^[ \t]*[-*_]{3,}[ \t]*$', '', text, flags=re.MULTILINE)
    # Remove HTML tags (<p>, <br>, etc.)
    text = re.sub(r'<[^>]+>', '', text)
    # Replace multiple newlines with at most 2 newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Clean up redundant spaces within lines
    text = re.sub(r'[ \t]+', ' ', text)
    
    return text.strip()


def get_token_slice(text: str, num_tokens: int, from_start: bool = True) -> str:
    """
    Extracts up to `num_tokens` tokens from either the start or end of the text.
    """
    if not text or num_tokens <= 0:
        return ""
    
    tokens = _tokenizer.encode(text)
    if len(tokens) <= num_tokens:
        return text
    
    if from_start:
        slice_tokens = tokens[:num_tokens]
    else:
        slice_tokens = tokens[-num_tokens:]
        
    return _tokenizer.decode(slice_tokens)


def chunk_text(pages: List[Dict[str, Any]], overlap_tokens: int = 500) -> List[Dict[str, Any]]:
    """
    Creates page-level chunks where each page is a chunk, enriched with up to
    `overlap_tokens` (default 500) from the previous page (tail) and the next page (head).
    Also removes markdown formatting and cleans up noise.
    
    :param pages: List of dicts, e.g. [{"page": 1, "text": "..."}, ...]
    :param overlap_tokens: Number of overlapping tokens to include from prev & next pages.
    :return: List of chunk dicts [{"text": "...", "page": 1, ...}, ...]
    """
    if not pages:
        return []

    # Clean the text of all pages first
    cleaned_pages = []
    for page_data in pages:
        raw_text = page_data.get("text", "")
        cleaned = clean_text(raw_text)
        cleaned_pages.append({
            "page": page_data.get("page", 1),
            "text": cleaned,
            "raw_page_data": page_data
        })

    chunks = []
    total_pages = len(cleaned_pages)

    for i, curr in enumerate(cleaned_pages):
        curr_text = curr["text"]
        page_num = curr["page"]

        # If current page text is empty, check if we still want to skip or make a minimal chunk
        if not curr_text.strip():
            continue

        parts = []

        # Previous page overlap (trailing tokens from previous page)
        if i > 0 and overlap_tokens > 0:
            prev_text = cleaned_pages[i - 1]["text"]
            prev_overlap = get_token_slice(prev_text, overlap_tokens, from_start=False)
            if prev_overlap.strip():
                parts.append(f"[Previous Page Context]:\n{prev_overlap.strip()}")

        # Current page content (main chunk body)
        parts.append(curr_text.strip())

        # Next page overlap (leading tokens from next page)
        if i < total_pages - 1 and overlap_tokens > 0:
            next_text = cleaned_pages[i + 1]["text"]
            next_overlap = get_token_slice(next_text, overlap_tokens, from_start=True)
            if next_overlap.strip():
                parts.append(f"[Next Page Context]:\n{next_overlap.strip()}")

        combined_chunk_text = "\n\n".join(parts)

        chunks.append({
            "text": combined_chunk_text,
            "page": page_num
        })

    return chunks
