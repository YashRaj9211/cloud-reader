import os
import sys
from pathlib import Path
from typing import Optional, Union


def _configure_ocr_runtimes():
    """
    Automatically detects and sets PDFIUM_LIB_PATH and ORT_DYLIB_PATH
    across Windows, Linux (Docker/Cloud), and macOS environments
    so pdf-inspector OCR works out of the box anywhere.
    """
    # 1. Resolve PDFium
    if "PDFIUM_LIB_PATH" not in os.environ:
        try:
            import pypdfium2_raw
            base_dir = os.path.dirname(pypdfium2_raw.__file__)
            for candidate in ["pdfium.dll", "libpdfium.so", "libpdfium.dylib"]:
                cand_path = os.path.join(base_dir, candidate)
                if os.path.exists(cand_path):
                    os.environ["PDFIUM_LIB_PATH"] = cand_path
                    break
        except ImportError:
            pass

    # 2. Resolve ONNX Runtime
    if "ORT_DYLIB_PATH" not in os.environ:
        try:
            import onnxruntime
            base_dir = os.path.dirname(onnxruntime.__file__)
            capi_dir = os.path.join(base_dir, "capi")
            search_dirs = [capi_dir, base_dir]
            for sdir in search_dirs:
                for candidate in ["onnxruntime.dll", "libonnxruntime.so", "libonnxruntime.dylib"]:
                    cand_path = os.path.join(sdir, candidate)
                    if os.path.exists(cand_path):
                        os.environ["ORT_DYLIB_PATH"] = cand_path
                        break
                if "ORT_DYLIB_PATH" in os.environ:
                    break
        except ImportError:
            pass


# Run setup before importing pdf_inspector
_configure_ocr_runtimes()

import pdf_inspector
from pdf_inspector import OcrPdfResult, PdfResult


def parse_pdf(
    source: Union[str, bytes, Path],
    *,
    ocr_mode: str = "auto",
    dpi: float = 150.0,
    minimum_confidence: float = 0.0
) -> OcrPdfResult:
    """
    Parse text-based, scanned, image-based, or mixed PDFs into structured Markdown.

    :param source: File path (str/Path) or raw PDF bytes (bytes).
    :param ocr_mode: 'auto' (selective OCR on scanned pages), 'force' (all pages OCR), or 'off'.
    :param dpi: Rendering DPI for OCR (default 150.0).
    :param minimum_confidence: Minimum OCR confidence threshold.
    :return: OcrPdfResult containing .markdown, .pages_routed_to_ocr, .page_count, etc.
    """
    _configure_ocr_runtimes()

    if isinstance(source, bytes):
        return pdf_inspector.process_pdf_with_ocr_bytes(
            source,
            mode=ocr_mode,
            dpi=dpi,
            minimum_confidence=minimum_confidence
        )
    else:
        return pdf_inspector.process_pdf_with_ocr(
            str(source),
            mode=ocr_mode,
            dpi=dpi,
            minimum_confidence=minimum_confidence
        )


def classify_pdf(source: Union[str, bytes, Path]):
    """
    Fast PDF classification (~10-50ms) returning pdf_type and pages needing OCR.
    """
    if isinstance(source, bytes):
        return pdf_inspector.classify_pdf_bytes(source)
    else:
        return pdf_inspector.classify_pdf(str(source))


def extract_pages_from_pdf(source: Union[str, bytes, Path]) -> list[dict]:
    """
    Extracts text per page from PDF bytes or filepath using pypdfium2.
    Returns list of dicts: [{'page': 1, 'text': '...'}, ...]
    """
    import pypdfium2 as pdfium
    if isinstance(source, bytes):
        pdf = pdfium.PdfDocument(source)
    else:
        pdf = pdfium.PdfDocument(str(source))
        
    pages = []
    for i, page in enumerate(pdf):
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        pages.append({
            "page": i + 1,
            "text": text
        })
    return pages


async def parse_pdf_from_drive(book_id: str, user_id: str = None, token: str = None) -> list[dict]:
    """
    Extracts text per page from a Google Drive PDF file or local file.
    """
    if token:
        from app.services.google_drive_service import google_drive_service
        pdf_bytes = await google_drive_service.download_pdf_content(token, book_id)
        return extract_pages_from_pdf(pdf_bytes)
    
    if os.path.exists(book_id):
        return extract_pages_from_pdf(book_id)
        
    return []


if __name__ == "__main__":
    # Test path
    test_path = "C:/Users/yashr/Downloads/How To Prepare For Quantitative Aptitude For The Cat 8 E (Author Unknown) (z-library.sk, 1lib.sk, z-lib.sk).pdf"
    if not os.path.exists(test_path):
        test_path = "C:/Users/yashr/Downloads/Yash_Raj_Prasad_CV.pdf"

    if os.path.exists(test_path):
        print(f"Processing: {os.path.basename(test_path)}")
        cls_info = classify_pdf(test_path)
        print(f"PDF Type: {cls_info.pdf_type}")
        print(f"Pages needing OCR: {cls_info.pages_needing_ocr[:10]} (showing up to 10)")

        print("\nRunning parsing with auto OCR routing...")
        result = parse_pdf(test_path, ocr_mode="auto")
        print(f"Total Pages: {result.page_count}")
        print(f"Pages routed to OCR: {result.pages_routed_to_ocr[:10]}")
        print(f"Markdown preview (first 250 characters):\n{result.markdown[:250] if result.markdown else 'No text'}")
    else:
        print("Test file not found.")