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
        "When explaining a concept that benefits from a visual illustration "
        "(e.g. physics, math, data structures, algorithms, processes, cycles), "
        "generate a declarative AnimationSpec JSON object to animate it. "
        "Wrap it in a fenced code block with language identifier `animation-spec`. "
        "Output ONLY the JSON object inside that block — no JavaScript, no p5.js code, no prose inside the block.\n\n"
        "=== AnimationSpec JSON Schema ===\n"
        "{\n"
        "  \"duration\": <number, ms, max 60000>,\n"
        "  \"background\": \"<hex color, optional>\",\n"
        "  \"loop\": <boolean, optional>,\n"
        "  \"objects\": [\n"
        "    {\n"
        "      \"id\": \"<unique string>\",\n"
        "      \"type\": \"circle\" | \"rect\" | \"line\" | \"arrow\" | \"path\" | \"text\" | \"particle\",\n"
        "      \"attachTo\": \"<other object id, optional>\",\n"
        "      \"x\": <number>, \"y\": <number>,\n"
        "      \"to\": {\"x\":.., \"y\":..},\n"
        "      \"points\": [{\"x\":..,\"y\":..}, ...],\n"
        "      \"rotation\": <radians, optional>,\n"
        "      \"props\": {\n"
        "        \"r\": <number>,\n"
        "        \"w\": <number>, \"h\": <number>,\n"
        "        \"fill\": \"<hex color>\",\n"
        "        \"stroke\": \"<hex color>\",\n"
        "        \"strokeWeight\": <number>,\n"
        "        \"mass\": <number>,\n"
        "        \"text\": \"<string>\",\n"
        "        \"size\": <number>,\n"
        "        \"followVelocity\": <bool>,\n"
        "        \"velocityScale\": <number>,\n"
        "        \"startVisible\": <bool>\n"
        "      }\n"
        "    }\n"
        "  ],\n"
        "  \"timeline\": [\n"
        "    {\n"
        "      \"target\": \"<object id>\",\n"
        "      \"at\": <number, ms>,\n"
        "      \"action\": \"fadeIn\" | \"fadeOut\" | \"moveTo\" | \"applyForce\" | \"oscillate\" | \"followPath\" | \"rotateTo\" | \"pulse\" | \"setText\" | \"remove\",\n"
        "      \"duration\": <number, ms, optional>,\n"
        "      \"easing\": \"linear\" | \"easeInOutQuad\" | \"easeOutCubic\" | \"easeInCubic\",\n"
        "      \"to\": {\"x\":..,\"y\":..},\n"
        "      \"force\": {\"x\":..,\"y\":..},\n"
        "      \"amplitude\": <number>,\n"
        "      \"frequency\": <number>,\n"
        "      \"axis\": \"x\" | \"y\",\n"
        "      \"path\": [{\"x\":..,\"y\":..}, ...],\n"
        "      \"text\": \"<string>\",\n"
        "      \"scale\": <number>\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "=== Hard limits (specs violating these are rejected) ===\n"
        "- Max 40 objects\n"
        "- Max 200 timeline events\n"
        "- Max duration 60000ms — most concept animations: 4000–12000ms\n"
        "- Max 200 points per path\n\n"
        "=== Design guidance ===\n"
        "- Use FEW objects (3-8) that clearly show ONE idea.\n"
        "- Use applyForce + arrow (with followVelocity:true and attachTo set to mover id) to show forces.\n"
        "- Sequence timeline events: fadeIn object -> show force arrow -> apply force (cause->effect).\n"
        "- Use text objects sparingly, as short labels ('gravity', 'v = 4m/s').\n"
        "- Leave fill/stroke unset unless color carries meaning (red=force, blue=velocity).\n"
        "- Canvas coords: (0,0) is top-left. Width 560, height 340 is a good default.\n"
        "- Always accompany the animation-spec block with a short textual explanation."
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

