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
    Frontend->>Backend: GET /api/auth/url (passes state & configured frontend/origin)
    Backend-->>Frontend: Return Google OAuth authorization URL
    Frontend->>Google: Redirect to OAuth Consent Screen
    User->>Google: Consent & Authenticate
    Google-->>Backend: Redirect with auth code (/api/auth/callback)
    Backend->>Google: Exchange code for Access & Refresh Tokens
    Google-->>Backend: Access token, Refresh token, Profile info
    Backend->>DB: Upsert User record & OAuth credentials
    Backend-->>Frontend: Redirect to FRONTEND_URL or client state (?auth_success=1&token=...)
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

## 3. Reading, Annotation & Text Selection Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Reader as PDF Reader UI
    participant TextLayer as TextLayer (PDFPageItem)
    participant Overlay as Interactive Overlay
    participant Store as Client Store (Zustand / Local State)
    participant Backend as FastAPI (/api/sync)
    participant Drive as Google Drive / DB

    Note over User,TextLayer: View mode — text selection enabled
    User->>TextLayer: Click & drag over PDF text
    TextLayer-->>User: Browser selection box (strictly transparent spans & ::selection, zero duplicate text overlay)
    User->>TextLayer: Release mouse (mouseup)
    TextLayer->>Reader: handleTextLayerMouseUp → compute selection bounds
    Reader-->>User: Show floating action bar (Highlight / Copy / Note)

    alt User clicks Highlight
        User->>Reader: handleSelectionHighlight()
        Reader->>Store: onAddHighlight({ page, x%, y%, width%, height%, text })
        Store->>Backend: POST /api/sync (debounced)
        Backend->>Drive: Persist annotation JSON
    else User clicks Copy
        User->>Reader: handleSelectionCopy()
        Reader->>Reader: navigator.clipboard.writeText(text)
    else User clicks Note
        User->>Reader: handleSelectionNote()
        Reader-->>User: Open sticky note popup pre-filled with selected text
        User->>Reader: Save note (with unique ID and ISO timestamp)
        Reader->>Store: onAddNote({ id, page, x%, y%, text, createdAt })
    else User clicks away / clears selection
        TextLayer->>Reader: document 'selectionchange' (isCollapsed) → dismiss floating bar
    end

    Note over User,Reader: Annotation Sidebar navigation
    opt User clicks note in AnnotationPanel
        User->>Reader: onPageSelect(page, noteId)
        Reader->>Reader: scrollToPage(page, 'smooth') + setSelectedNote(note)
        Reader-->>User: Scroll view to page and pop open note card
    end

    Note over User,Overlay: Drawing mode — annotations enabled
    User->>Overlay: Switch toolMode to ink/shape/eraser
    Overlay->>Overlay: pointer-events: auto (overlay captures all input)
    User->>Overlay: Draw / erase / place shape
    Overlay->>Store: onAddInkStroke / onAddShape / etc.
    Store->>Backend: POST /api/sync (Debounced delta or snapshot)
    Backend->>Drive: Persist annotation JSON to Drive / App Data
    Backend-->>Store: 200 OK (Sync confirmed + version timestamp)
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


---

## 5. PDF Page Rendering and Virtualization Lifecycle

Describes the rendering pipeline from PDF load to page display, including the virtualization and memory eviction strategies.

### Page Layer Stack (z-index order, bottom to top)

| z-index | Element | Purpose |
|---------|---------|---------|
| 0 | `<canvas>` (PDF canvas) | Rasterized PDF page via `page.render()` |
| 5 | `<div class="textLayer">` | Transparent, selectable text spans from `pdfjsLib.TextLayer` |
| 10 | `<svg>` (SVG annotation layer) | Permanent ink strokes, shapes, and highlights (`pointerEvents: none`) |
| 20 | `<canvas>` (ink canvas) | Live drawing preview — shown only during `ink`/`highlight` tool modes |
| 30 | `<div>` (interactive overlay) | Captures pointer events for all annotation tools; `pointer-events: none` in view mode |
| 40–60 | Annotation UI elements | Sticky note pins, delete bars, note popups, selection action bar |

### Key Invariants
- Annotation layers (SVG overlay, interactive div) are **independent** from the PDF canvas and never cause canvas re-renders.
- The **text layer** is rendered in a **separate, independent `useEffect`** from the canvas effect — text layer updates never trigger canvas re-renders and vice versa.
- `PDFPageItem` is wrapped in `React.memo`; toolbar color/tool changes do **not** re-render any page canvas.
- The `activeRenderTasks` and `activeTextTasks` module-level maps ensure at most **one active task per page** for each layer type.
- Spacer `div`s use real heights from `pageSizeCache` (populated via `onPageSizeChange` callback) or fall back to A4 estimates, preventing scroll position drift.
- Thumbnail rendering is deferred via `requestIdleCallback` so it never competes with main page rendering.
- DPR is dynamically managed by `computeAdaptiveDPR`: mobile devices with high-DPI screens render at full native DPR (up to 3.0–3.5) when scaled down for crisp text legibility, tapering gracefully as zoom increases to stay strictly within the 4096px dimension and 12MP hardware memory cap.
- Resolution changes (`matchMedia` dppx listener) and container width updates trigger crisp re-renders automatically without lag or layout thrashing.
- In **annotation** modes (ink, shape, highlight, eraser, note, textbox), the overlay has `pointer-events: auto` and `user-select: none` to capture all drawing interactions.

### Rendering Flow Summary
1. PDF loaded → `pdfjsLib.getDocument` (Web Worker thread)
2. Continuous mode: compute window `[currentPage-2, currentPage+2]`
3. Pages in window → mount `PDFPageItem`; pages outside → height-preserving spacer div
4. `IntersectionObserver` (rootMargin=1000px) triggers **canvas render** when page enters margin
5. `IntersectionObserver` (same observer) triggers **text layer render** when page enters margin
6. `IntersectionObserver` clears canvas + zeros dimensions + evicts text layer DOM when page exits margin
7. Each render cancels the previous `RenderTask` / `TextLayer` for that page before starting a new one
8. Thumbnails rendered at scale 0.2 via `requestIdleCallback`, canvas released immediately after `toDataURL`
9. `PDFPageItem` reports exact rendered dimensions to `PDFReader` via `onPageSizeChange` → `pageSizeCache`

