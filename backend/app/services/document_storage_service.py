import os
from pathlib import Path
from typing import Optional

# Base storage directory for documents: backend/storage/documents/
BASE_STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage" / "documents"


class DocumentStorageService:
    """
    Manages persistent filesystem storage for user documents.
    Directory structure:
        backend/storage/documents/{user_id}/{document_id}/
            ├── source.pdf      # Downloaded PDF from Google Drive
            └── parsed.md       # Extracted Markdown text
    """

    def __init__(self, base_dir: Path = BASE_STORAGE_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_document_dir(self, user_id: str, document_id: str) -> Path:
        """Returns the document directory Path, ensuring it exists."""
        doc_dir = self.base_dir / str(user_id) / str(document_id)
        doc_dir.mkdir(parents=True, exist_ok=True)
        return doc_dir

    def get_pdf_path(self, user_id: str, document_id: str) -> Path:
        """Returns the absolute path to the document's source.pdf."""
        return self.get_document_dir(user_id, document_id) / "source.pdf"

    def get_markdown_path(self, user_id: str, document_id: str) -> Path:
        """Returns the absolute path to the document's parsed.md."""
        return self.get_document_dir(user_id, document_id) / "parsed.md"

    def has_pdf(self, user_id: str, document_id: str) -> bool:
        """Checks if source.pdf exists and has non-zero size."""
        pdf_path = self.get_pdf_path(user_id, document_id)
        return pdf_path.exists() and pdf_path.stat().st_size > 0

    def has_markdown(self, user_id: str, document_id: str) -> bool:
        """Checks if parsed.md exists and has non-zero size."""
        md_path = self.get_markdown_path(user_id, document_id)
        return md_path.exists() and md_path.stat().st_size > 0

    def save_pdf(self, user_id: str, document_id: str, pdf_bytes: bytes) -> Path:
        """Persists PDF bytes into source.pdf."""
        pdf_path = self.get_pdf_path(user_id, document_id)
        pdf_path.write_bytes(pdf_bytes)
        return pdf_path

    def read_pdf(self, user_id: str, document_id: str) -> Optional[bytes]:
        """Reads and returns source.pdf bytes if present."""
        pdf_path = self.get_pdf_path(user_id, document_id)
        if pdf_path.exists():
            return pdf_path.read_bytes()
        return None

    def save_markdown(self, user_id: str, document_id: str, markdown_text: str) -> Path:
        """Persists Markdown text into parsed.md."""
        md_path = self.get_markdown_path(user_id, document_id)
        md_path.write_text(markdown_text, encoding="utf-8")
        return md_path

    def read_markdown(self, user_id: str, document_id: str) -> Optional[str]:
        """Reads and returns parsed.md content if present."""
        md_path = self.get_markdown_path(user_id, document_id)
        if md_path.exists():
            return md_path.read_text(encoding="utf-8")
        return None

    def cleanup_document(self, user_id: str, document_id: str) -> None:
        """Removes the document directory and all contents."""
        doc_dir = self.base_dir / str(user_id) / str(document_id)
        if doc_dir.exists():
            for item in doc_dir.iterdir():
                if item.is_file():
                    item.unlink()
            doc_dir.rmdir()


document_storage_service = DocumentStorageService()
