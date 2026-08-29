from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings


def get_embedd_vectors(query: str) -> list[float]:
    embedder = NVIDIAEmbeddings(
        model=os.getenv("EMBEDDING_MODEL"),
        api_key=os.getenv("EMBEDDING_KEY")
    )
    embedding = embedder.embed_query(query)
    return embedding