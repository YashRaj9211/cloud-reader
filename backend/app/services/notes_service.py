from app.services.rag_service import generate_note

def generate_chapter_note(book_id: str, chapter_title: str) -> str:
    """Generate notes for a specific chapter."""
    query = f"Provide a detailed summary and study notes for the chapter titled: '{chapter_title}'."
    return generate_note(book_id, query)
    
def generate_full_book_note(book_id: str, book_title: str = "this book") -> str:
    """Generate a holistic overview note for the entire book."""
    query = f"Provide a comprehensive overview, main themes, and key takeaways for {book_title}."
    return generate_note(book_id, query)
    
def detect_chapters(book_id: str) -> list[str]:
    """
    In a real app, this would use LLM or regex on the table of contents.
    For now, we'll return a few dummy chapters to demonstrate the parallel pipeline.
    """
    return [
        "Introduction and Basic Concepts",
        "Core Principles and Methodology",
        "Advanced Applications and Case Studies",
        "Conclusion and Future Directions"
    ]
