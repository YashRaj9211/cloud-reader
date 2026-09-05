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

    Note over User,TextLayer: View mode — text selection enabled (mouse & mobile touch)
    User->>TextLayer: Select text (mouse drag, or mobile touch long-press & handle adjust)
    TextLayer-->>User: Browser selection box (strictly transparent spans & ::selection, zero duplicate text overlay)
    User->>TextLayer: Release touch/mouse (touchend / mouseup / debounced selectionchange)
    TextLayer->>Reader: updateSelectionBar() → compute collision-safe bounds
    Reader-->>User: Show floating action bar (Highlight / Copy / Note) with coarse touch targets

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

### 3.1 Floating Toolbar & Header Navigation Interactions
- **Main Top Navigation Bar**:
  - Borderless, glassmorphic floating header (`backdrop-blur-xl`) that minimizes text in favor of sleek, intuitive icon buttons.
  - Hosts the Library drawer toggle, document title and current page pill, a subtle sync status dot, semantic search trigger with `⌘K`, compact view mode icon switcher (`PDF` / `Markdown` / `Split`), notes drawer toggle icon, and glowing **AI Copilot** action pill.
- **Floating Document Toolbar**:
  - Floats cleanly above the PDF canvas as an uncluttered pill dock (`rounded-full`, `shadow-[0_4px_24px_-2px_rgba(0,0,0,0.08)]`, `backdrop-blur-xl`) with wrapper border and heavy backgrounds removed.
  - Groups secondary tools into clean drop-down menus:
    - **Shapes & Tools Dropdown**: Consolidates Rectangle, Circle, Line, Arrow, Text Box, and Eraser into a single popover.
    - **Palette Swatch Dropdown**: Interactive popover for annotation colors.
  - Keeps essential primary reading controls directly accessible: Page jump `<` / `Page / Total` / `>`, Navigate, Highlight, Note, Pen, Zoom controls, and Thumbnail view toggle.

---

## 4. Google ADK 2.0 Multi-Agent Orchestration & Animation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Reader as User / Reader
    participant UI as Chat Panel
    participant Controller as Chat Controller (/api/chat)
    participant AgentOrchestrator as ADK Multi-Agent Orchestrator (app/agents)
    participant RootAgent as Root Coordinator Agent (root_agent)
    participant ChatAgent as Document RAG Agent (cloud_pdf_rag_agent)
    participant P5Agent as P5.js Creative Agent (p5js_agent via AgentTool)
    participant SkillTools as SkillToolset (p5js skill)
    participant Runner as ADK Runner
    participant DB as Neon PostgreSQL

    Reader->>UI: Submit request: "Explain bubble sort and animate it with p5js"
    UI->>Controller: POST /api/chat/sessions/{id}/messages
    Controller->>DB: Save User message
    Controller->>AgentOrchestrator: execute_turn_stream(session, user_message, user_id, db)
    
    AgentOrchestrator->>Runner: run_async(user_id, session_id, new_message)
    Note over Runner,RootAgent: Runner executes Root Coordinator with tools=[p5js_agent] & sub_agents=[chat_agent]

    alt Document research needed
        RootAgent->>ChatAgent: Transfer to cloud_pdf_rag_agent
        ChatAgent->>ChatAgent: Call retrieve_document_context() & search_conversation_memory()
        ChatAgent-->>RootAgent: Return grounded context snippets & citations
    end

    alt Animation / Visualization requested
        RootAgent->>P5Agent: Invoke AgentTool(agent=p5js_agent, query)
        opt Query references p5js skill
            P5Agent->>SkillTools: load_skill("p5js") / load_skill_resource("references/animation.md")
            SkillTools-->>P5Agent: Skill guidelines, motion vocabulary, and code templates
        end
        P5Agent-->>RootAgent: Return complete, 60fps ```p5js``` code block & visual explanation
    end

    RootAgent-->>Runner: Stream cohesive response (Explanation + ```p5js``` block)
    Runner-->>AgentOrchestrator: Yield event stream (partial chunks)
    AgentOrchestrator-->>Controller: Yield SSE chunks (data: {"chunk": "..."})
    Controller-->>UI: Live-stream text & code
    UI->>UI: P5Renderer debounces stream, mounts sandbox iframe (#09090b), renders 60fps sketch with transport/copy/fullscreen controls
    opt User clicks "Open in Animation Studio ↗"
        UI->>Store: setActiveAnimation({ code, title, groundedPage, sourceDocId }) + setAnimationStudioOpen(true)
        Store-->>UI: Mounts AnimationStudioWindow at viewport bottom dock (z-30)
        UI->>UI: Renders split layout (8-col simulation canvas + 4-col parameter playground)
        User->>UI: Adjusts sliders (Prior / Evidence / Likelihood) or playback speed (0.5x / 1x / 2x)
        UI->>UI: Live calculation of Bayes formula & updates iframe canvas parameters
    end
    Controller->>DB: Save Assistant message to PostgreSQL
    Controller-->>UI: SSE Done (data: {"assistant_message": ..., "sources": ...})
```

### 4.1 On-Demand Interactive Animation Studio Window Lifecycle
1. **Trigger**:
   - In `ChatMessageList`, any message containing a p5.js block or full HTML simulation displays an **"Interactive Concept Simulation"** banner with an **"Open in Animation Studio ↗"** button.
   - Alternatively, clicking the studio button in `P5Renderer`'s controls or inline canvas overlay directly triggers the studio.
2. **State Transition**:
   - Updates `useAppStore`:
     - `activeAnimation`: Holds the clean executable code, parsed simulation title, grounded page number, and source document ID.
     - `animationStudioOpen: true`.
3. **Viewport Mounting**:
   - `AnimationStudioWindow` mounts within `MainDashboard`'s main document viewport at `bottom-3 left-4 right-4 md:left-6 md:right-6 z-30`.
   - Floats above the PDF/Markdown reader with a glassmorphic aesthetic (`backdrop-blur-xl`, `border-[#fa5d19]/25`, `rounded-2xl`).
4. **Interaction & Playground**:
   - Header provides `0.5x / 1x / 2x` speed toggles, simulation replay, code view toggle, fullscreen mode, and dock/minimize.
   - Grounded page badge allows one-click jumping back to the referenced section in the PDF reader.
   - Parameter sliders dynamically update variables and re-compute formula results in real-time.
   - "Collapse to Chat" minimizes the window and refocuses the AI chat drawer.

---

## 4.2 PDF Notes Generation Lifecycle

When the user asks for "study notes", "revision notes", "PDF export", or "study guide", the system runs the following flow:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Chat Panel (ChatMessageList)
    participant Controller as Chat Controller (/api/chat)
    participant Orchestrator as ADK Orchestrator
    participant Root as Root Coordinator Agent
    participant NotesAgent as PDF Notes Agent (pdf_notes_agent via AgentTool)
    participant Generator as pdf_generator.py (Playwright in-memory)

    User->>UI: "Create study notes on Neural Networks in PDF"
    UI->>Controller: POST /api/chat/sessions/{id}/messages
    Controller->>Orchestrator: execute_turn_stream(session, message, user_id, db)
    Orchestrator->>Root: run_async → Root detects PDF notes intent

    Root->>NotesAgent: Invoke AgentTool(agent=pdf_notes_agent, query)
    NotesAgent->>NotesAgent: retrieve_document_context() — fetch relevant RAG chunks
    NotesAgent->>NotesAgent: Synthesize full semantic HTML body
    Note over NotesAgent: exec-summary, key-concept blocks, callouts,<br/>tables, code blocks, review questions

    NotesAgent->>NotesAgent: create_pdf_note(title, html_content, summary, tool_context)
    NotesAgent->>Generator: generate_pdf_notes(title, html_body)
    Generator->>Generator: Playwright async_playwright() → chromium.launch(headless=True)
    Generator->>Generator: page.set_content(full_html, wait_until="networkidle")
    Generator->>Generator: page.pdf(format="A4", print_background=True) → in-memory bytes
    Generator-->>NotesAgent: (pdf_bytes, filename) — ZERO disk writes

    NotesAgent->>NotesAgent: base64.b64encode(pdf_bytes) → tool_context.state["generated_pdf"]
    NotesAgent-->>Root: Return {status, title, filename, size_bytes, summary}

    Root-->>Orchestrator: Final assistant response summary
    Orchestrator-->>Controller: SSE chunks + final event {type: "done", text, sources, generated_pdf}
    Controller->>Controller: Save assistant message (with connection timeout resilience)
    Controller-->>UI: SSE Done with final_payload.generated_pdf

    UI->>UI: Receive generated_pdf with in-memory base64 data
    UI->>UI: Render PDF Ready Download Card (title, size KB, Download + Open in Browser)

    opt User clicks Download PDF
        UI->>UI: Convert base64 → Blob("application/pdf")
        UI->>User: Trigger direct browser download (a.download) — instant save!
    end

    opt User clicks Open in Browser
        UI->>UI: Convert base64 → Blob → URL.createObjectURL(blob)
        UI->>User: window.open(blobUrl, '_blank') — immediate preview!
    end
```

### 4.2.1 PDF Notes Tool Flow

1. **Intent Detection**: Root agent identifies PDF notes intent via keyword triggers in the prompt (`generate notes`, `study guide`, `revision notes`, `export notes to PDF`, etc.).
2. **RAG Context Retrieval**: `pdf_notes_agent` calls `retrieve_document_context` to pull relevant document chunks for grounded note generation.
3. **HTML Synthesis**: The LLM synthesizes a comprehensive semantic HTML body including:
   - `.exec-summary` — executive overview block
   - `.key-concept` — highlighted key definition blocks
   - `.callout.tip / .note / .warning / .formula / .important` — structured callout boxes
   - `<table>` — comparison or data tables
   - `<pre><code>` — code / pseudocode / formula blocks
   - `.review-questions` — end-of-notes self-assessment questions
4. **Playwright In-Memory Rendering**: `pdf_generator.py` wraps the HTML body in a full premium print document with Google Fonts, `@page` A4 rules, print-color-adjust, page-break utilities, and footer branding. Playwright's headless Chromium renders it directly to in-memory bytes with zero disk storage.
5. **Direct Client Delivery**: The PDF bytes are base64-encoded and attached to the SSE stream `final_payload.generated_pdf` (with title, filename, size, and summary).
6. **Frontend Card & Instant Download**: `ChatMessageList.tsx` receives `msg.generated_pdf` and renders an emerald **PDF Ready Card** with two instant actions:
   - **Download PDF**: Decodes the base64 string into a client-side `Blob("application/pdf")` and triggers an immediate file save to the user's computer.
   - **Open in Browser**: Converts the `Blob` into an ephemeral `URL.createObjectURL(blob)` and opens it in a new browser tab for immediate reading or printing.

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
2. Continuous mode: compute window `[currentPage-5, currentPage+5]` (PRELOAD_WINDOW=5) to keep adjacent pages mounted and prevent unmount/remount thrashing during continuous scrolling
3. Pages in window → mount `PDFPageItem`; pages outside → height-preserving spacer div
4. `IntersectionObserver` (rootMargin=1000px) triggers **canvas render** when page enters margin
5. `IntersectionObserver` (same observer) triggers **text layer render** when page enters margin
6. `IntersectionObserver` clears canvas + zeros dimensions + evicts text layer DOM when page exits margin
7. Each render cancels the previous `RenderTask` / `TextLayer` for that page before starting a new one
8. Thumbnails rendered at scale 0.2 via `requestIdleCallback`, canvas released immediately after `toDataURL`
9. `PDFPageItem` reports exact rendered dimensions to `PDFReader` via `onPageSizeChange` → `pageSizeCache`
10. Programmatic scroll loop prevention: User scrolling continuous reading updates `currentPage` without firing competing programmatic smooth-scroll interruptions.
11. **Last Read Page Restoration**: When opening any PDF, `selectBook` checks `syncData.books[id].currentPage`, `book.currentPage`, and synchronous `localStorage` fallback. On mount, `PDFReader` suppresses scroll spy with programmatic scroll-lock (`isScrollingProgrammatically = true`), queries the target page container or height-preserving spacer, and performs an instant jump (`behavior: 'auto'`) directly to the last read page before re-engaging the scroll spy.

### 5.1 Last Read Page Restoration Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Sidebar as DocumentSidebar
    participant Store as Zustand Store (selectBook)
    participant Reader as PDFReader
    participant DOM as Page Containers / Spacers

    User->>Sidebar: Click PDF document
    Sidebar->>Store: selectBook(bookId)
    Store->>Store: Flush prevBookId current page to localStorage
    Store->>Store: Resolve target page: syncData -> bookObj -> localStorage -> default(1)
    Store->>Store: set({ activeBookBytes, activeBookPage: targetPage })
    Store->>Reader: Mount with currentPage = targetPage

    Reader->>Reader: pdfjsLib.getDocument() loads PDF
    Reader->>Reader: setPdf(doc), setTotalPages(doc.numPages), setLoading(false)
    Reader->>DOM: Mount pages in window [targetPage-5, targetPage+5] + Spacers
    Reader->>Reader: Set isScrollingProgrammatically = true (suppress scroll spy)
    Reader->>DOM: querySelector(`[data-page-number="${targetPage}"]`)
    Reader->>DOM: scrollTo({ top: targetScrollTop - 16, behavior: 'auto' })
    Note over Reader,DOM: Instant jump directly to last read page without flickering to page 1
    Reader->>Reader: Release scroll-lock (isScrollingProgrammatically = false)
    Note over Reader: Normal scroll spy resumes for subsequent user reading gestures
```

