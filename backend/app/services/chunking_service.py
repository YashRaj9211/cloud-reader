from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import CHUNK_SIZE, CHUNK_OVERLAP

def chunk_text(pages: list[dict]) -> list[dict]:
    """
    Split text from pages into smaller chunks using RecursiveCharacterTextSplitter,
    preserving the page number metadata.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    
    chunks = []
    for page_data in pages:
        text = page_data.get("text", "")
        page_num = page_data.get("page", 1)
        
        if not text.strip():
            continue
            
        splits = splitter.split_text(text)
        for split in splits:
            chunks.append({
                "text": split,
                "page": page_num
            })
            
    return chunks
