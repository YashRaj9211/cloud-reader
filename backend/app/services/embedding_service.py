from openai import OpenAI
from app.config import NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_EMBED_MODEL

client = OpenAI(
    api_key=NVIDIA_API_KEY,
    base_url=NVIDIA_BASE_URL
)

def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of text strings using the NVIDIA API."""
    if not texts:
        return []
        
    response = client.embeddings.create(
        input=texts,
        model=NVIDIA_EMBED_MODEL,
        encoding_format="float",
        extra_body={"input_type": "passage", "truncate": "NONE"}
    )
    
    # Ensure they're sorted by index just in case
    data = sorted(response.data, key=lambda x: x.index)
    return [item.embedding for item in data]


def embed_query(query: str) -> list[float]:
    """Embed a single query string using the NVIDIA API."""
    response = client.embeddings.create(
        input=[query],
        model=NVIDIA_EMBED_MODEL,
        encoding_format="float",
        extra_body={"input_type": "query", "truncate": "NONE"}
    )
    return response.data[0].embedding
