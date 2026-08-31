from typing import List
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter


def markdown_splitter(
    document: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 150
) -> List[str]:
    """
    Splits a Markdown document into semantic, manageable text chunks.
    Uses MarkdownHeaderTextSplitter to respect document hierarchy, followed by
    RecursiveCharacterTextSplitter for sections that exceed chunk_size.
    """
    if not document or not document.strip():
        return []

    headers_to_split_on = [
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
        ("####", "Header 4"),
    ]

    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=False,
    )

    try:
        header_docs = header_splitter.split_text(document)
    except Exception:
        header_docs = []

    recursive_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    final_chunks: List[str] = []

    if header_docs:
        for doc in header_docs:
            content = doc.page_content.strip()
            if len(content) <= chunk_size:
                final_chunks.append(content)
            else:
                sub_chunks = recursive_splitter.split_text(content)
                final_chunks.extend(sub_chunks)
    else:
        # Fallback if markdown has no recognized headers
        final_chunks = recursive_splitter.split_text(document)

    return [c.strip() for c in final_chunks if c.strip()]
