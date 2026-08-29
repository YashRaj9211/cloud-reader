import hashlib
import chromadb
from app.config import CHROMA_HOST, CHROMA_PORT

# Create a global ChromaDB client for the app
chroma_client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)


def _get_collection_name(book_id: str) -> str:
    """Generate a stable collection name from the book_id using SHA-256."""
    return "book_" + hashlib.sha256(book_id.encode()).hexdigest()[:32]


def get_book_collection(book_id: str):
    """Get or create a ChromaDB collection for a specific book."""
    collection_name = _get_collection_name(book_id)
    return chroma_client.get_or_create_collection(
        name=collection_name,
        metadata={"book_id": book_id}
    )


def add_chunks_to_chroma(book_id: str, chunks: list[dict], embeddings: list[list[float]]):
    """Add text chunks and their embeddings to the book's Chroma collection."""
    if not chunks or not embeddings or len(chunks) != len(embeddings):
        raise ValueError("Chunks and embeddings must be non-empty and of equal length.")

    collection = get_book_collection(book_id)
    
    ids = [f"{book_id}_{i}" for i in range(len(chunks))]
    documents = [chunk["text"] for chunk in chunks]
    metadatas = [
        {"page": chunk.get("page", 1), "chunk_index": i} 
        for i, chunk in enumerate(chunks)
    ]
    
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas
    )


def query_collection(book_id: str, query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Query the book's collection with an embedding and return top_k chunks."""
    collection = get_book_collection(book_id)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"]
    )
    
    if not results or not results["documents"] or not results["documents"][0]:
        return []
        
    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        chunks.append({
            "text": doc,
            "page": meta.get("page", 1) if meta else 1,
            "chunk_index": meta.get("chunk_index", 0) if meta else 0
        })
        
    return chunks
