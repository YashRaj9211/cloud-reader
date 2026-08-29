from openai import OpenAI
from app.config import NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_LLM_MODEL, RAG_TOP_K
from app.services.embedding_service import embed_query
from app.services.chroma_service import query_collection
from app.services.reranking_service import rerank_chunks

client = OpenAI(
    api_key=NVIDIA_API_KEY,
    base_url=NVIDIA_BASE_URL
)

def chat_stream(book_id: str, query: str):
    """
    RAG chat pipeline with streaming response.
    1. Embed query
    2. Retrieve top-k chunks from ChromaDB
    3. Rerank chunks
    4. Generate response using NVIDIA LLM
    """
    # 1. Embed and retrieve
    query_emb = embed_query(query)
    chunks = query_collection(book_id, query_emb, top_k=RAG_TOP_K)
    
    # 2. Rerank
    reranked = rerank_chunks(query, chunks)
    
    # 3. Build prompt context
    context = "\n\n".join([f"Page {c.get('page', '?')}:\n{c['text']}" for c in reranked])
    
    system_prompt = (
        "You are a helpful AI assistant for reading a book. "
        "Use the following excerpts from the book to answer the user's question. "
        "If you don't know the answer based on the excerpts, say you don't know. "
        "Always cite the page number when referencing information from the text.\n\n"
        "ANIMATION CAPABILITY:\n"
        "When explaining a concept that would benefit from a visual or animated illustration "
        "(e.g. physics, math, data structures, algorithms, processes, cycles), you SHOULD "
        "generate a p5.js animation to help the user understand. Wrap the p5.js code in a "
        "fenced code block with language identifier `p5js` (triple back-ticks p5js). "
        "Rules for the animation code:\n"
        "- Provide ONLY the body of the sketch (setup() and draw() functions, plus any helpers). "
        "Do NOT include any HTML or <script> tags.\n"
        "- Use `createCanvas(canvasWidth, canvasHeight)` inside setup(). Prefer 400×300 unless the concept needs more space.\n"
        "- Use a PASTEL color theme exclusively. Example palette: "
        "background(250, 243, 240), fill(255, 182, 193) (pink), fill(176, 224, 230) (powder blue), "
        "fill(186, 230, 180) (mint green), fill(253, 223, 155) (cream yellow), fill(216, 191, 240) (lavender). "
        "Never use harsh primary colors.\n"
        "- Use basic shapes (ellipse, rect, triangle, line, arc) and smooth motion (sin, cos, lerp, noise).\n"
        "- Keep animations lightweight — avoid heavy loops or pixel manipulation.\n"
        "- Add brief text labels with `textSize(12); textAlign(CENTER); text(...)` where they aid understanding.\n"
        "- The animation should loop and be self-explanatory.\n"
        "Always accompany the animation with a short textual explanation before or after the code block."
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Context excerpts:\n{context}\n\nQuestion: {query}"}
    ]
    
    # 4. Stream response
    response = client.chat.completions.create(
        model=NVIDIA_LLM_MODEL,
        messages=messages,
        temperature=1,
        top_p=0.95,
        max_tokens=16384,
        extra_body={"chat_template_kwargs": {"enable_thinking": True}},
        stream=True
    )
    
    for chunk in response:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta.content is not None:
            yield delta.content


def generate_note(book_id: str, query: str) -> str:
    """Non-streaming version for note generation."""
    query_emb = embed_query(query)
    chunks = query_collection(book_id, query_emb, top_k=RAG_TOP_K)
    reranked = rerank_chunks(query, chunks)
    
    context = "\n\n".join([f"Page {c.get('page', '?')}:\n{c['text']}" for c in reranked])
    
    system_prompt = (
        "You are an expert academic summarizer. "
        "Use the provided book excerpts to fulfill the user's request. "
        "Format your output in clean Markdown with appropriate headings, bullet points, and bold text."
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Context:\n{context}\n\nRequest: {query}"}
    ]
    
    response = client.chat.completions.create(
        model=NVIDIA_LLM_MODEL,
        messages=messages,
        temperature=0.7,
        top_p=0.95,
        max_tokens=4096,
        extra_body={"chat_template_kwargs": {"enable_thinking": False}},
    )
    
    return response.choices[0].message.content

