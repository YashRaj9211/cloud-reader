# Project Description: Cloud PDF Reader

## Overview
**Cloud PDF Reader** is a full-stack, cloud-synchronized PDF reading, annotation, and intelligent retrieval-augmented generation (RAG) platform. The application allows users to read PDF documents, perform rich multi-layered annotations, synchronize documents and reading states seamlessly across devices via Google Drive, and interact with books using an AI-powered conversational assistant equipped with semantic search, citations, and interactive animations.

---

## Key Features & Capabilities

### 1. Cloud Storage & Google Drive Synchronization
- **Google OAuth 2.0 & Session Management**: Secure user authentication with Google Identity, token refresh, and session storage.
- **Drive Integration**: Files and book metadata are synchronized directly with user storage (`drive.file` scope).
- **Directory & Folder Management**: Organizing PDFs into directories, virtual paths, and cloud folders.

### 2. PDF Reader & Rich Annotation Engine
- **PDF.js Engine**: Continuous smooth scrolling, thumbnail navigation, responsive zoom, jumping to pages, and dark/sepia reading modes.
- **Rich Annotation Layer**:
  - Freehand ink & highlighter with configurable width, color, and opacity.
  - Precision geometrical shapes (rectangles, ellipses, lines, arrows).
  - Sticky notes, text boxes, and marginal commentary.
  - Text selection highlights with attached note cards.
- **Cross-device State Sync**: Real-time sync of reading progress, zoom settings, and annotations.

### 3. Asynchronous Event-Driven Ingestion Pipeline (Kafka + Workers)
- Distributed, event-driven background processing for PDF ingestion:
  - `fetch_worker`: Downloads PDF binaries from Google Drive / local file store.
  - `parse_worker`: Extracts text and metadata page-by-page.
  - `chunk_worker`: Generates semantic text chunks with page-aware metadata.
  - `embed_worker`: Computes dense vector embeddings using NVIDIA NeMo / Embedding models.
  - `store_worker`: Upserts chunk vectors and metadata into ChromaDB vector store and updates NeonDB PostgreSQL state.
  - `dlq_worker`: Handles Dead Letter Queue retries and error tracking.

### 4. Advanced RAG & AI Reading Assistant
- **Semantic Vector Search**: Powered by ChromaDB vector collections per book/document.
- **Reranking**: Cross-encoder / reranking service to select the most relevant chunks.
- **Google ADK 2.0 Agent Orchestrator (`app/agent.py`)**:
  - Dedicated agent module featuring `LlmAgent`, `InMemorySessionService`, `InMemoryMemoryService`, and `Runner`.
  - Tool integration for scoped document context retrieval (`retrieve_document_context`) and semantic past-conversation memory (`search_conversation_memory`).
  - Multi-session chat history persisted in PostgreSQL and rehydrated into ADK sessions.
  - Context-grounded responses citing exact page numbers.
  - **Server-Sent Events (SSE) Streaming**: Streams chunked AI responses to the frontend in real-time, providing an interactive, live-typing experience.
  - **Dynamic Animation Specs**: Generates declarative visual animation schemas (`animation-spec`) rendered by the frontend to explain complex concepts visually.

---

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.10+) with Uvicorn / Gunicorn
- **Database**: PostgreSQL (NeonDB / SQLAlchemy ORM / AsyncSession)
- **Message Broker / Pipeline**: Apache Kafka / aiokafka
- **Vector Database**: ChromaDB (HTTP Client / Vector Collections)
- **AI & Embedding Models**: NVIDIA API / OpenAI-compatible client / Google ADK 2.0
- **Monitoring**: Prometheus client metrics & request tracking middleware

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom Design System (`index.css`)
- **PDF Engine**: PDF.js (`pdfjs-dist`)
- **State Management**: Zustand / React Hooks
- **Icons & UI**: Lucide React, Radix UI primitives, Canvas 2D overlay

---

## Directory Layout Summary

```
cloud-pdf-reader/
├── backend/
│   ├── app/
│   │   ├── api/            # Legacy API endpoints (auth, books, sync)
│   │   ├── configs/        # Configurations (Kafka, DB, etc.)
│   │   ├── controllers/    # Business logic controllers (books, chat, directories, etc.)
│   │   ├── middlewares/    # Auth middleware, Prometheus metrics
│   │   ├── models/         # SQLAlchemy models (Book, ChatMessage, User, etc.)
│   │   ├── pipeline/       # Kafka event pipeline (runner, producer, workers: fetch, parse, chunk, embed, store, dlq)
│   │   ├── routes/         # Consolidated API routers (/api/auth, /api/books, /api/chat, etc.)
│   │   ├── schema/         # Pydantic schemas for request/response validation
│   │   ├── services/       # Core services (rag_service, drive, chroma, rerank)
│   │   ├── agents/         # Dedicated Google ADK 2.0 multi-agent architecture
│   │   │   ├── orchestrator.py # Multi-agent execution, memory indexing & session rehydration
│   │   │   ├── root_agent/ # Root coordinator agent (intent routing & sub-agent delegation)
│   │   │   │   ├── agent.py
│   │   │   │   └── prompts.py
│   │   │   └── chat_agent/ # Specialized document research & scoped RAG agent
│   │   │       ├── agent.py
│   │   │       ├── tools.py
│   │   │       └── prompts.py
│   │   ├── config.py       # Global environment settings (supports APP_ENV)
│   │   ├── db.py           # Database connection & session manager
│   │   └── main.py         # FastAPI application entrypoint & lifespan
│   ├── .env                # Base secrets and APP_ENV mode
│   ├── .env.development    # Local development configuration overrides
│   ├── .env.production     # Production configuration overrides
│   ├── docker-compose.yml  # Kafka, Zookeeper, Redis, ChromaDB local services
│   └── requirements.txt    # Backend Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/     # UI components (Reader, Sidebars, Annotations, Chat, Modals)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # API client and networking utilities
│   │   ├── services/       # Frontend service abstractions
│   │   ├── store/          # Zustand state stores
│   │   ├── types.ts        # Global TypeScript interfaces
│   │   └── index.css       # Tailwind CSS & design tokens
│   ├── package.json        # Frontend Node dependencies
│   └── vite.config.ts      # Vite bundler configuration
├── DESCRIPTION.md          # High-level architecture and project overview
├── FLOW.md                 # Detailed data, control, and ingestion workflow diagrams
└── rule.md                 # Agent instruction to keep DESCRIPTION.md and FLOW.md updated
```
