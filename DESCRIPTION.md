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
- **Performance Optimizations**:
  - **Page Virtualization**: In continuous scroll mode, only the current page ±2 pages are mounted in the DOM. All other pages are represented by height-preserving spacer `div`s, preventing thousands of canvas elements from being created for large PDFs.
  - **Canvas Eviction**: When a page scrolls outside the virtualization window, its canvas backing store is cleared and its dimensions zeroed to release GPU/CPU memory immediately.
  - **Dynamic Adaptive DPI & Zoom-Aware Resolution**:
    - Replaced static 1.5 DPR mobile cap with `computeAdaptiveDPR(displayScale, zoom, cssW, cssH)`.
    - Modern smartphones/tablets with high pixel densities (Retina/OLED, 2.5x–3.5x DPR) render at full native device resolution, eliminating blurry, illegible text when scaled down to mobile viewports.
    - Intelligently tapers DPR down at higher zoom levels (e.g. 1.75x–2.0x at 200%+ zoom) where glyphs already span many CSS pixels, maintaining peak sharpness while strictly enforcing hardware canvas limits (max 4096px per dimension and 12MP memory budget).
    - Enables high-quality canvas context anti-aliasing (`imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'`).
    - Device resolution change listeners (`resolution: ...dppx`) automatically re-render canvases when dragged between displays or upon browser zoom changes.
    - Mobile touch gestures: native two-finger pinch-to-zoom and double-tap zoom toggle between fit-to-width (100%) and reading zoom (160%).
  - **RenderTask Management**: A module-level `Map` tracks active PDF.js `RenderTask` instances per page. Any in-flight render is cancelled before a new one starts, preventing duplicate rendering loops on zoom/scroll.
  - **React.memo**: `PDFPageItem` is wrapped in `React.memo` and all annotation callbacks are stabilised with `useCallback`, so toolbar state changes (color, tool mode) do not trigger canvas re-renders.
  - **Debounced ResizeObserver**: Container width changes only propagate (and trigger re-renders) after 150ms of resize inactivity and only if the width changed by more than 5px.
  - **Idle-Scheduled Thumbnails**: Thumbnail rendering in `ThumbnailSidebar` is deferred via `requestIdleCallback` (with a `setTimeout` polyfill) so thumbnails never compete with main page rendering bandwidth.
- **Native Text Layer (PDF.js v5 `TextLayer`)**:
  - Each visible page renders an invisible, selectable text layer (`<div class="textLayer">`) aligned pixel-precisely over the canvas using CSS transforms (`--scale-factor`, `--total-scale-factor`).
  - Text is 100% selectable and copy/paste-able (Ctrl+C / Cmd+C) just like Chrome/Edge native PDF viewers.
  - **Zero Visual Ghosting / Text Overlay**: Both unselected and selected text glyphs strictly enforce `color: transparent !important;` and `-webkit-text-fill-color: transparent !important;` alongside `text-shadow: none !important;`. This ensures only the native selection highlight box appears over the crisp canvas text, preventing any blurry duplicate or color-inverted ghost text overlays.
  - **Dark Mode Selection Compatibility**: High-contrast, theme-appropriate selection tints (`rgba(0, 102, 255, 0.3)` in light mode, `rgba(96, 165, 250, 0.45)` in dark mode) without applying CSS filters to the text layer DOM node, preserving exact subpixel alignment.
  - Text layer lifecycle mirrors canvas lifecycle: rendered when visible, cancelled and evicted when the page leaves the viewport window, re-rendered on zoom or resize.
  - The text layer runs in a **separate, independent effect** from canvas rendering — text layer updates never cause canvas re-renders.
  - The interactive overlay is set to `pointer-events: none` in **view** mode so mouse/touch events reach the text layer for native selection, and `pointer-events: auto` in all drawing/annotation modes.
- **Floating Text-Selection Action Bar**:
  - When text is selected in view mode, a sleek dark pill action bar appears above the selection with three actions:
    - **✦ Highlight**: Converts the selection bounding box to page-relative percentage coordinates and stores a `Highlight` annotation with the selected text attached.
    - **⌘ Copy**: Writes the selected text to the system clipboard.
    - **✎ Note**: Opens a sticky-note popup pre-filled with the selected text. The popup has isolated `pointer-events: auto` and event propagation guards, supporting mouse clicks (Save, Cancel, Close) and keyboard shortcuts (`Ctrl/Cmd + Enter` to save, `Esc` to cancel) in view mode.
  - The bar dismisses automatically when the tool mode changes, when an action is executed, or whenever the selection collapses/clears via global `selectionchange`.
- **Rich Annotation Layer**:
  - Freehand ink & highlighter with configurable width, color, and opacity.
  - Precision geometrical shapes (rectangles, ellipses, lines, arrows).
  - Sticky notes, text boxes, and marginal commentary.
  - Text selection highlights with attached note cards and exact text capture.
  - **Robust Annotation Lifecycle & ID Integrity**: All annotations (highlights, notes, ink strokes, shapes, text boxes) are guaranteed unique cryptographic/timestamp-based IDs (`note-...`, `hl-...`, etc.) and ISO timestamps on creation. Legacy/unindexed annotations are automatically sanitized with stable fallback keys upon hydration, preventing accidental batch deletion of notes and eliminating "Invalid Date" displays.
  - **Annotation Deep-Linking & Jump-to-Note**: Clicking any annotation or note in the `AnnotationPanel` immediately smooth-scrolls continuous reading view to the target page and opens the dedicated note card.
- **Page Size Cache**: `PDFPageItem` reports its exact rendered dimensions to `PDFReader` via `onPageSizeChange`, populating a `pageSizeCache` ref. Virtualized spacer divs use these exact heights instead of A4 estimates, eliminating layout shifts when scrolling through previously-rendered pages.
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
│   │   ├── configs/        # Modular service configs (db, redis, chroma, kafka, promethus, env_loader)
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
