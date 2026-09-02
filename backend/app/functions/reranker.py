import os
from dotenv import load_dotenv

from langchain_core.documents import Document
from langchain_nvidia_ai_endpoints import NVIDIARerank

load_dotenv()

# TODO: Model depricated will be implemented later
passages = [
    "The GPU memory bandwidth is the rate at which data can be read from or written to the GPU memory.",
    "The GPU memory bandwidth is determined by the memory clock speed and the memory bus width.",
    "The GPU memory bandwidth is measured in GB/s.",
]
ranker = NVIDIARerank(
    model="nvidia/llama-3.2-nv-rerankqa-1b-v2",
    api_key=os.getenv("NVIDIA_API_KEY")
)
docs = ranker.compress_documents(
    query="What is GPU memory bandwidth?",
    documents=[Document(page_content=p) for p in passages],
)

print(docs.index)
print(docs)