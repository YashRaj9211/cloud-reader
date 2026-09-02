import logging
from typing import Tuple
import pdf_inspector

logger = logging.getLogger(__name__)

def pdf_parser(path_of_pdf: str) -> str:
    """
    Parses a PDF into Markdown text with explicit page markers (<!-- PAGE: N -->).
    Extracts text per page when available, falling back to full-document processing
    or OCR as needed.
    """
    # 1. Prefer per-page extraction for page-number tracking
    try:
        pages_res = pdf_inspector.extract_pages_markdown(path_of_pdf)
        if pages_res and pages_res.pages:
            page_blocks = []
            for p in pages_res.pages:
                text = (getattr(p, "markdown", "") or "").strip()
                if text:
                    page_blocks.append(f"<!-- PAGE: {p.page + 1} -->\n\n{text}")
            if page_blocks:
                return "\n\n".join(page_blocks)
    except Exception as e:
        logger.debug("extract_pages_markdown fallback: %s", e)

    # 2. Fallback to full document process_pdf
    try:
        res = pdf_inspector.process_pdf(path_of_pdf)
        md = getattr(res, "markdown", None)
        if isinstance(md, str) and md.strip():
            return md.strip()
    except Exception as e:
        logger.debug("process_pdf fallback: %s", e)

    # 3. Fallback to process_pdf_with_ocr if scanned
    try:
        res_ocr = pdf_inspector.process_pdf_with_ocr(path_of_pdf)
        md_ocr = getattr(res_ocr, "markdown", None)
        if isinstance(md_ocr, str) and md_ocr.strip():
            return md_ocr.strip()
    except Exception as e:
        logger.debug("process_pdf_with_ocr fallback: %s", e)

    # 4. Fallback to raw text extraction
    try:
        text = pdf_inspector.extract_text(path_of_pdf)
        if isinstance(text, str) and text.strip():
            return text.strip()
    except Exception as e:
        logger.debug("extract_text fallback: %s", e)

    # ponytail: Return empty string on unextractable PDFs; caller handles fallback placeholder.
    # Ceiling: Basic text/OCR only.
    # Upgrade path: Integrate multimodal vision model for rich diagram/figure understanding.
    return ""


def get_pdf_page_count(path_of_pdf: str) -> int:
    """Returns the total number of pages in a PDF file."""
    try:
        cls = pdf_inspector.classify_pdf(path_of_pdf)
        return max(getattr(cls, "pages", 1), 1)
    except Exception:
        return 1
