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
- **Floating Text-Selection Action Bar (Desktop & Mobile Touch Supported)**:
  - When text is selected in view mode (via mouse drag on desktop or touch long-press & handle adjustment on mobile), a sleek dark pill action bar appears relative to the selection with three actions:
    - **✦ Highlight**: Converts the selection bounding box to page-relative percentage coordinates and stores a `Highlight` annotation with the selected text attached.
    - **⌘ Copy**: Writes the selected text to the system clipboard (with fallback for mobile WebViews).
    - **✎ Note**: Opens a sticky-note popup pre-filled with the selected text. The popup has isolated `pointer-events: auto` and event propagation guards, supporting mouse/touch clicks (Save, Cancel, Close) and keyboard shortcuts (`Ctrl/Cmd + Enter` to save, `Esc` to cancel) in view mode.
  - **Mobile Touch Selection Tracking**:
    - Listens to global `selectionchange` on `document` (debounced by 150ms) as well as window `touchend`/`mouseup` to immediately track mobile touch pin drags and long-press selections.
    - Double-tap zoom on the reader container ignores taps within the text layer, ensuring double-tap word selection on mobile is never intercepted or interrupted by zoom resets.
    - Coarse pointer (`@media (pointer: coarse)`) styling ensures generous >= 36px touch targets on mobile touchscreens.
    - `onPointerDown` stopPropagation & preventDefault prevents mobile browsers from collapsing the text selection before action bar buttons fire.
    - Dynamic positioning places the bar above the selection when space permits or below the selection when near the page top, preventing clipping by `overflow-hidden`.
    - Highlight SVG elements in view mode set `pointerEvents: 'none'`, preventing existing highlights from blocking subsequent text selection underneath.
  - The bar dismisses automatically when the tool mode changes, when an action is executed, or whenever the selection collapses/clears via global `selectionchange`.
- **Rich Annotation Layer**:
  - Freehand ink & highlighter with configurable width, color, and opacity.
  - Precision geometrical shapes (rectangles, ellipses, lines, arrows).
  - Sticky notes, text boxes, and marginal commentary.
  - Text selection highlights with attached note cards and exact text capture.
  - **Robust Annotation Lifecycle & ID Integrity**: All annotations (highlights, notes, ink strokes, shapes, text boxes) are guaranteed unique cryptographic/timestamp-based IDs (`note-...`, `hl-...`, etc.) and ISO timestamps on creation. Legacy/unindexed annotations are automatically sanitized with stable fallback keys upon hydration, preventing accidental batch deletion of notes and eliminating "Invalid Date" displays.
  - **Annotation Deep-Linking & Jump-to-Note**: Clicking any annotation or note in the `AnnotationPanel` immediately smooth-scrolls continuous reading view to the target page and opens the dedicated note card.
- **Optimized Continuous Scroll & Dynamic Virtualization**:
  - `PRELOAD_WINDOW` expanded to 5 pages, preventing adjacent pages from unmounting and remounting during normal scrolling gestures.
  - Removed container-level CSS `scroll-smooth` which fought with browser scroll momentum and caused jerky pauses.
  - Eliminated programmatic auto-scroll feedback loops: user continuous scrolling updates `currentPage` in the state and header without re-triggering programmatic scroll animations.
- **Page Size Cache**: `PDFPageItem` reports its exact rendered dimensions to `PDFReader` via `onPageSizeChange`, populating a `pageSizeCache` ref. Virtualized spacer divs use these exact heights instead of A4 estimates, eliminating layout shifts when scrolling through previously-rendered pages.
- **Stitch-Aligned Floating Toolbar & Clean Top Bar Aesthetic**:
  - **Main Navigation Bar**: Glassmorphic, borderless floating header (`backdrop-blur-xl`, `CloudPDF` brand badge with flame icon, document title with page status pill, minimal sync status dot, `⌘K` semantic search icon trigger, compact segmented view mode icon switcher (`PDF`, `Markdown`, `Split`), notes icon toggle, glowing **AI Copilot** action pill with pulsing status indicator, and user profile avatar).
  - **Reading Document Floating Toolbar**: Refactored from a rigid full-width border block into a streamlined, borderless floating pill dock (`rounded-full`, glassmorphic `backdrop-blur-xl`, `shadow-[0_4px_24px_-2px_rgba(0,0,0,0.08)]`). To maximize visual simplicity and reduce clutter:
    - Geometric shapes (Rectangle, Circle, Line, Arrow), Text Box, and Eraser are neatly organized into a single **Shapes** dropdown menu.
    - Color selection is housed in a compact round swatch dropdown.
    - Preserves direct access to primary navigation, text selection, highlighting, note creation, freehand pen, and quick zoom controls while eliminating redundant wrapper borders and heavy container backgrounds.
  - **Minimalist Document Library Sidebar**: Transformed the left sidebar from heavy dashed upload dropzones, bulky cards, large progress bars, and index badges into a clean, flat list layout. Features a quiet header with document count badge, quick upload icon trigger, compact segment tab pills (`Files`, `Folders`, `Notes`), subtle search input, plain single-line file items with elegant circular progress gauges (displaying reading percentage inside the circle alongside `read/total` page numbers), and a low-profile user profile footer.
  - **Seamless Document Switching & Full Loading States**: When selecting or switching documents from the sidebar, the viewport immediately displays a centered document loader (`z-50`, spinning ring with `FileText` icon, document title, and live binary streaming status) rather than flashing a blank screen or empty welcome view while the binary is being downloaded and parsed.
- **Cross-device State Sync & Last Read Page Restore**:
  - Real-time sync of reading progress, zoom settings, and annotations to Google Drive and NeonDB PostgreSQL.
  - **Automatic Resume at Last Read Page**: When opening any PDF document, the reader automatically resumes exactly at the page where it was last closed.
  - **Multi-Tier Page Recovery**: Resolves last read page from Google Drive `syncData.books[bookId].currentPage`, backend document metadata, and synchronous client-side `localStorage` fallback (`cloudreader_last_page_{bookId}`).
  - **Programmatic Scroll-Lock on Initial Load**: In continuous scroll mode, an initial layout effect detects document completion, suppresses the scroll-spy listener to prevent resetting the page to 1, and performs an instant (`behavior: 'auto'`) scroll jump to the target page container or height-preserving spacer div.
  - **Zero-Loss Page Persistence**: Current reading progress is saved synchronously to `localStorage` on page change, upon switching documents, and via window `beforeunload` handlers before debounced cloud sync triggers.

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
- **Google ADK 2.0 Multi-Agent Orchestrator (`app/agents/orchestrator.py`)**:
  - Central orchestrator coordinating `root_agent`, `chat_agent`, `p5js_agent`, and `pdf_notes_agent` via `LlmAgent`, `InMemorySessionService`, `InMemoryMemoryService`, and `Runner`.
  - **Root Coordinator Agent (`root_agent/`)**: Primary user entrypoint. Orchestrates intents, delegating document Q&A to `cloud_pdf_rag_agent`, invoking `p5js_agent` as an `AgentTool` for animations, and invoking `pdf_notes_agent` as an `AgentTool` for PDF note generation.
  - **Document RAG Specialist (`chat_agent/`)**: Equipped with scoped vector retrieval (`retrieve_document_context`) and semantic memory search (`search_conversation_memory`) tools. Provides page-cited answers.
  - **P5.js Creative Visualization Specialist (`p5js_agent/`)**:
    - Equipped with the `p5js` skill loaded dynamically via ADK `SkillToolset` (`load_skills_from_dir`), granting the agent native tools: `list_skills`, `load_skill`, `load_skill_resource`, and `run_skill_script`.
    - Leverages skill guidelines and references (`references/animation.md`, `references/visual-effects.md`, `references/creative-direction.md`, `references/color-systems.md`, etc.).
    - Generates self-contained, interactive, 60fps p5.js animations encapsulated in `p5js ... ` markdown blocks, rendered by the frontend's sandboxed iframe `P5Renderer` with play/pause, restart, code inspection, clipboard copy, and responsive fullscreen lightbox modal controls.
  - Multi-session chat history persisted in PostgreSQL and rehydrated into ADK sessions.
  - **Server-Sent Events (SSE) Streaming & Resilient Persistence**: Streams chunked AI responses to the frontend in real-time. To prevent serverless PostgreSQL connection timeouts during long turns (such as multi-step Playwright PDF generation or in-depth RAG synthesis), the engine configures TCP keepalives and `pool_recycle`, and the chat controller implements resilient assistant message persistence that auto-reconnects with a fresh `SessionLocal` if the primary idle connection drops mid-stream.
  - **In-Memory PDF Notes Generation Specialist (`pdf_notes_agent/`)**:
    - Activated when the user requests study notes, revision summaries, study guides, cheatsheets, or PDF exports.
    - Retrieves relevant RAG context via `retrieve_document_context`, synthesizes comprehensive notes in structured semantic HTML (callout boxes, key concept blocks, tables, review questions, code blocks, executive summary), then calls `create_pdf_note` tool.
    - `create_pdf_note` invokes `app/services/pdf_generator.py` which uses **Playwright headless Chromium** to compile a premium A4 HTML document into **raw in-memory PDF bytes** with zero disk writes, eliminating the need for backend storage or external object stores.
    - The PDF bytes are base64-encoded and attached to the SSE stream `final_payload.generated_pdf` (with title, filename, size, and summary).
    - In the frontend chat view, `ChatMessageList` displays a stylized **Generated PDF Notes Card** with instant **Download & Save PDF** (creates an in-memory client `Blob` and triggers direct browser download) and **Open in Browser** (previews the Blob URL in a new tab) actions.
  - **Frontend P5.js Animation Suite (`P5Renderer.tsx`, `ChatMessageList.tsx`, `ChatDrawer.tsx`)**:
    - **Universal Format Support**: Seamlessly renders both raw JavaScript sketches (`function setup()`) and complete standalone HTML5 applications (`<!DOCTYPE html>` with interactive buttons, sliders, and controls).
    - **DOM Canvas Parent Fix**: Automatically replaces `<canvas id="canvas">` with `<div id="canvas">` when rendering full HTML sketches, resolving the browser canvas fallback invisibility bug.
    - **Unescaped HTML Preprocessor**: Detects raw `<!DOCTYPE html> ... </html>` documents in chat responses and wraps them into `p5js` code fences so they render as live interactive sandboxes instead of broken markdown text.
    - **Debounced Stream Rendering**: Prevents iframe churn and flashing during live token streaming by debouncing updates and displaying a sleek shimmering loader while simulation logic compiles.
    - **Dark Simulation Canvas**: Sandboxed iframe with an optimized dark viewport (`#09090b`) to highlight vibrant generative graphics and eliminate harsh light borders.
    - **Transport & Code Controls**: Inline and full-screen transport controls (Play, Pause, Restart, Code/Canvas view toggle, and One-click Code Copy with checkmark confirmation).
    - **Fullscreen Lightbox Experience**: Full-screen modal with darkened backdrop and quick keyboard shortcuts (`Space` to Play/Pause, `R` to Restart, `Esc` to Exit).
    - **One-Click Animation Discovery**: Quick action prompt chips in `ChatDrawer` and suggested prompts in `ChatMessageList` to trigger visual simulations with a single click.
    - **PDF Notes Download Card**: When the assistant generates PDF notes via `pdf_notes_agent`, `ChatMessageList` automatically detects the download link in the response and renders a stylized **Generated PDF Notes** card (emerald-themed, with FileText icon, document title, A4 format badge, and two action buttons: **Download PDF** and **Open in Browser**).
    - **Suggested Prompts**: Includes `📝 Generate PDF study notes on this topic` alongside the existing animation prompt.
    - **Stitch On-Demand Interactive Animation Studio Window (`AnimationStudioWindow.tsx`)**:
      - Docks directly above the reading document canvas (`bottom-3 left-4 right-4 md:left-6 md:right-6 z-30`) with an elevated glassmorphic panel (`backdrop-blur-xl`, `border-[#fa5d19]/25`, `rounded-2xl`, `shadow-2xl`).
      - **Studio Header**: Dynamic simulation title, grounded page badge with jump-to-page deep linking, playback speed toggles (`0.5x`, `1x`, `2x`), restart simulation button, code inspector toggle, fullscreen/expand button, bottom dock/collapse chevron, and close/collapse button.
      - **Split Studio Layout**:
        - **8-Column Simulation Canvas**: Embedded 60 FPS sandboxed iframe with runtime error protection, active particle sample counter, universe area stats, play/pause and replay controls, and live calculated Bayesian probability / mathematical formula result badge.
        - **4-Column Parameter Playground**: Live interactive sliders (`Prior Probability P(A)`, `Evidence Occurrence P(B)`, `Likelihood P(B | A)`) that instantly update and re-calculate probability values, a visual insight card explaining the mathematical flow, one-click code copying, and a "Collapse to Chat" action.
      - **Seamless Chat Integration**: Chat messages containing p5.js blocks provide an "Open in Animation Studio ↗" button that elevates the animation directly into the docked studio window without cluttering the chat history.

### 5. Document Indexing Visibility & Dynamic AI Copilot Lifecycle
- **Context-Aware Dynamic AI Copilot Header Button (`MainDashboard.tsx`)**:
  - The primary action button in the top navigation bar dynamically adapts to the current document's exact indexing lifecycle:
    1. **Unindexed Document (`UPLOADED` / `NOT_INDEXED`)**: Displays **`Index for AI`** (`Sparkles`). Clicking queues the document for processing via `startIndexing(activeBookId)`.
    2. **In-Flight Processing (`PROCESSING`)**: Morphologically changes to display real-time Kafka stage metrics and percentage (e.g. `Parsing 45p 25%`, `Embedding 120c 45%`, `Indexing 60/120 50%`) with an animated spinner (`RefreshCw`) and micro-progress bar. Polling is active only during this state.
    3. **Indexing Complete (`INDEXED`)**: Automatically converts into the **`AI Copilot`** (AI Chat) toggle button with an emerald pulse indicator, allowing immediate conversational Q&A and scoped document queries upon completion.
    4. **Failure State (`FAILED`)**: Displays **`Index Failed • Retry`** with error tooltips and one-click retry trigger.
- **Minimal, Uncluttered Library Sidebar with Context Menu (`DocumentSidebar.tsx`)**:
  - Keeps the document list ultra-clean and distraction-free: displays only the truncated file name, reading progress fraction, and circular progress gauge.
  - Replaced inline badges and direct delete icon with a subtle three-dot context menu (`MoreVertical`):
    - **Remove from Index** (shown only for indexed documents): Purges document vector embeddings from ChromaDB, deletes parsed markdown and storage artifacts, and resets the document's indexing state to unindexed without deleting the PDF file (`DELETE /api/books/{book_id}/index`).
    - **Index for AI** (shown for unindexed documents): Dispatches the document into the Kafka pipeline.
    - **Delete**: Safely removes the document from Google Drive and purges sync entries.
    - Click-outside backdrop dismissal and extensible for future actions.

---

## Technology Stack

### Backend

- **Framework**: FastAPI (Python 3.10+) with Uvicorn / Gunicorn
- **Database**: PostgreSQL (NeonDB / SQLAlchemy ORM / AsyncSession)
- **Message Broker / Pipeline**: Apache Kafka / aiokafka
- **Vector Database**: ChromaDB (HTTP Client / Vector Collections)
- **AI & Embedding Models**: NVIDIA API / OpenAI-compatible client / Google ADK 2.0
- **Agent Skill System**: Google ADK `SkillToolset` + native `p5js` creative coding skill
- **PDF Notes Engine**: Playwright (headless Chromium) + HTML/CSS print layout for A4 PDF generation
- **Monitoring**: Prometheus client metrics & request tracking middleware

### Frontend

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom Design System (`index.css`)
- **PDF Engine**: PDF.js (`pdfjs-dist`)
- **Interactive Animation Engine**: p5.js 1.11.3 (`P5Renderer`) in sandboxed iframes + declarative `AnimationPlayer`
- **State Management**: Zustand / React Hooks
- **Icons & UI**: Lucide React, Radix UI primitives, Canvas 2D overlay

---

## Directory Layout Summary

```
cloud-pdf-reader/
├── backend/
│   ├── app/
│   │   ├── api/            # Legacy API endpoints (auth, books, sync)
│   │   ├── configs/        # Modular service configs (db, redis, chroma, kafka, prometheus, env_loader)
│   │   ├── controllers/    # Business logic controllers (books, chat, directories, etc.)
│   │   ├── middlewares/    # Auth middleware, Prometheus metrics
│   │   ├── models/         # SQLAlchemy models (Book, ChatMessage, User, etc.)
│   │   ├── pipeline/       # Kafka event pipeline (runner, producer, workers: fetch, parse, chunk, embed, store, dlq)
│   │   ├── routes/         # Consolidated API routers (/api/auth, /api/books, /api/chat, etc.)
│   │   ├── schema/         # Pydantic schemas for request/response validation
│   │   ├── services/       # Core services (rag_service, drive, chroma, rerank, pdf_generator)
│   │   ├── agents/         # Dedicated Google ADK 2.0 multi-agent architecture
│   │   │   ├── orchestrator.py # Multi-agent execution, memory indexing & session rehydration
│   │   │   ├── root_agent/ # Root coordinator agent (intent routing & p5js_agent as tool)
│   │   │   │   ├── agent.py
│   │   │   │   └── prompts.py
│   │   │   ├── chat_agent/ # Specialized document research & scoped RAG agent
│   │   │   │   ├── agent.py
│   │   │   │   ├── tools.py
│   │   │   │   └── prompts.py
│   │   │   ├── p5js_agent/ # Specialized p5.js animation & generative coding agent
│   │   │   │   ├── __init__.py
│   │   │   │   ├── agent.py
│   │   │   │   └── prompts.py
│   │   │   ├── pdf_notes_agent/ # Specialist agent for generating PDF study/revision notes
│   │   │   │   ├── __init__.py
│   │   │   │   ├── agent.py     # LlmAgent definition with RAG + pdf tools
│   │   │   │   ├── prompts.py   # HTML structure guidelines & quality standards
│   │   │   │   └── tools.py     # create_pdf_note() → calls pdf_generator.py
│   │   │   └── skills/     # Agent-loadable skills
│   │   │       └── p5js/   # p5.js production skill (SKILL.md, references, scripts, templates)
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
