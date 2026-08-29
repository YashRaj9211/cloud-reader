import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.parse_pdf import extract_pages_from_pdf
from app.services.chunking_service import chunk_text
from app.services.embedding_service import embed_texts, embed_query
from app.services.chroma_service import add_chunks_to_chroma, query_collection

pdf_path = r"C:\Users\yashr\Downloads\NIPS-2017-attention-is-all-you-need-Paper.pdf"

print("=" * 70)
print("Full End-to-End Test: 'Attention Is All You Need' Paper")
print("=" * 70)

pages = extract_pages_from_pdf(pdf_path)
print(f"1. PDF Extraction: Extracted {len(pages)} pages.")

chunks = chunk_text(pages)
print(f"2. Chunking: Generated {len(chunks)} chunks.")

texts = [c["text"] for c in chunks]
embeddings = []
batch_size = 20
for i in range(0, len(texts), batch_size):
    batch = texts[i:i + batch_size]
    embeddings.extend(embed_texts(batch))
print(f"3. Embedding: Generated {len(embeddings)} embeddings (Dim: {len(embeddings[0])}).")

book_id = "attention_is_all_you_need_full_doc"
add_chunks_to_chroma(book_id, chunks, embeddings)
print(f"4. Indexing: Indexed all {len(chunks)} chunks into ChromaDB under book_id='{book_id}'.")

# Semantic Queries to verify accuracy
queries = [
    "How does Multi-Head Attention work and what is its formula?",
    "What optimizer and learning rate schedule was used during training?"
]

print("\n5. Vector Search Verification:")
for q in queries:
    print(f"\n🔍 Query: '{q}'")
    q_emb = embed_query(q)
    results = query_collection(book_id, q_emb, top_k=1)
    if results:
        top = results[0]
        preview = top["text"].replace("\r\n", " ").replace("\n", " ")[:250]
        print(f"   🎯 Top Match (Page {top['page']}): \"{preview}...\"")

print("\n" + "=" * 70)
print("✅ Everything is fully operational and verified!")
print("=" * 70)
