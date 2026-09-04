# System Flows & Data Pipelines: Cloud PDF Reader

This document details the primary lifecycle and data flows within **Cloud PDF Reader**, covering user authentication, PDF ingestion, annotation synchronization, and RAG chat interaction.

---

## 1. Authentication & Session Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Frontend (React / Vite)
    participant Backend as FastAPI Backend
    participant Google as Google Identity & OAuth2
    participant DB as Neon PostgreSQL

    User->>Frontend: Click "Sign in with Google"
    Frontend->>Backend: GET /api/auth/login-url
    Backend-->>Frontend: Return Google OAuth authorization URL
    Frontend->>Google: Redirect to OAuth Consent Screen
    User->>Google: Consent & Authenticate
    Google-->>Backend: Redirect with auth code (/api/auth/callback)
    Backend->>Google: Exchange code for Access & Refresh Tokens
    Google-->>Backend: Access token, Refresh token, Profile info
    Backend->>DB: Upsert User record & OAuth credentials
    Backend-->>Frontend: Set session cookie / Auth token & redirect to App
    Frontend->>Backend: GET /api/auth/me (Validate session)
    Backend-->>Frontend: User profile data
```

---

## 2. Book Ingestion & Kafka Processing Pipeline

When a user imports or uploads a book, it is pushed through an asynchronous Kafka pipeline for text extraction, chunking, embedding, and vector storage.

```mermaid
flowchart TD
    A[User uploads PDF / links Google Drive file] --> B[POST /api/books/upload]
    B --> C[Persist Book metadata in PostgreSQL]
    C --> D[Kafka Producer emits 'pdf.ingest.init']
    
    subgraph Kafka Event Pipeline
        D --> E[fetch_worker]
        E -->|Download binary / buffer| F['pdf.fetch.completed']
        F --> G[parse_worker]
        G -->|Extract text per page| H['pdf.parse.completed']
        H --> I[chunk_worker]
        I -->|Sliding-window semantic chunks with page info| J['pdf.chunk.completed']
        J --> K[embed_worker]
        K -->|Generate dense embeddings via NVIDIA model| L['pdf.embed.completed']
        L --> M[store_worker]
        M -->|Store vectors & metadata| N[(ChromaDB Vector Store)]
        M -->|Update status to COMPLETED / READY| O[(PostgreSQL BookRagStatus)]
    end

    subgraph Error Handling
        E -.->|On Failure| DLQ[dlq_worker / Dead Letter Queue]
        G -.->|On Failure| DLQ
        I -.->|On Failure| DLQ
        K -.->|On Failure| DLQ
        M -.->|On Failure| DLQ
        DLQ -->|Set status=FAILED with error details| O
    end
```

---

## 3. Reading & Annotation Sync Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Reader as PDF Reader UI (Canvas/Overlay)
    participant Store as Client Store (Zustand / Local State)
    participant Backend as FastAPI (/api/sync)
    participant Drive as Google Drive / DB

    User->>Reader: Draw ink, highlight text, or drop sticky note
    Reader->>Store: Update in-memory annotation map
    Store->>Backend: POST /api/sync (Debounced delta or snapshot)
    Backend->>Drive: Persist annotation JSON to Drive / App Data
    Backend-->>Store: 200 OK (Sync confirmed + version timestamp)
    
    Note over User,Drive: When opening on another device:
    User->>Backend: GET /api/sync
    Backend->>Drive: Fetch latest annotation payload
    Backend-->>Reader: Hydrate canvas & note overlays
```

---

## 4. Google ADK 2.0 RAG Chat & Memory Flow

```mermaid
sequenceDiagram
    autonumber
    actor Reader as User / Reader
    participant UI as Chat Panel
    participant Controller as Chat Controller (/api/chat)
    participant AgentOrchestrator as ADK Multi-Agent Orchestrator (app/agents)
    participant RootAgent as Root Coordinator Agent (root_agent)
    participant ChatAgent as Chat & RAG Specialist Agent (chat_agent)
    participant SessionMem as ADK Session & Memory Service
    participant Runner as ADK Runner
    participant Tool as Tool (retrieve_document_context)
    participant VectorStore as Query / ChromaDB Service
    participant LLM as LLM Model (LiteLlm / Gemini)
    participant DB as Neon PostgreSQL

    Reader->>UI: Submit question: "Explain the concept in chapter 2"
    UI->>Controller: POST /api/chat/sessions/{id}/messages
    Controller->>DB: Save User message
    Controller->>AgentOrchestrator: execute_turn(session, user_message, user_id, db)
    
    AgentOrchestrator->>SessionMem: get_or_create_session(session_id, user_id, scope)
    opt If first turn in cache
        AgentOrchestrator->>DB: Fetch historical messages
        AgentOrchestrator->>SessionMem: Rehydrate prior events into ADK Session
    end

    AgentOrchestrator->>Runner: run_async(user_id, session_id, new_message)
    Note over Runner,RootAgent: Orchestrator routes via Root Coordinator to specialized Chat Agent
    Runner->>LLM: Evaluate message with tools schema & system instructions
    LLM-->>Runner: Call tool `retrieve_document_context(query)`
    Runner->>Tool: Invoke retrieve_document_context
    Tool->>VectorStore: query_service.query(query, scope, user_id)
    VectorStore-->>Tool: Matched chunk snippets & page metadata
    Tool->>SessionMem: Update session state (`last_sources`)
    Tool-->>Runner: Return context snippets to agent
    Runner->>LLM: Generate final answer grounded in snippets
    LLM-->>Runner: Stream response parts & citations
    Runner-->>AgentOrchestrator: Yield event stream (chunks)
    AgentOrchestrator-->>Controller: Yield text chunks to SSE Stream
    Controller-->>UI: Server-Sent Events (data: {"chunk": "..."})
    AgentOrchestrator->>SessionMem: add_session_to_memory(session) (Cross-session memory update)
    Controller->>DB: Save Assistant message to PostgreSQL
    Controller-->>UI: Server-Sent Events (data: {"assistant_message": ..., "sources": ...})
```

