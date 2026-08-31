# Frontend Implementation Requirements Specification

> **Project**: Cloud PDF Reader  
> **Backend Base URL**: `/api` (FastAPI + PostgreSQL + Kafka + ChromaDB + Google Drive + Google ADK)  
> **Design System**: Heat-Driven Minimalism (`#fa5d19` accent, Suisse typography, Tailwind CSS v4, Light/Dark Modes)  
> **Target Audience**: AI Researchers, Engineers, Academic Readers

---

## 1. Executive Summary & Architecture Overview

The backend of Cloud PDF Reader has evolved into a full-featured, distributed multi-tenant platform:
1. **Google Drive Integration**: Cloud storage for original PDF documents and reading progress/annotation JSON (`cloud_pdf_reader_sync.json`).
2. **Directory & Folder Management**: Google Drive folder hierarchies allowing document grouping and categorization.
3. **Kafka Document Indexing Pipeline**: A 5-stage asynchronous pipeline (`Fetch` &rarr; `Parse` with Marker/PyMuPDF &rarr; `Chunk` &rarr; `Embed` &rarr; `ChromaDB Store`) that extracts structured Markdown and vectorizes chunks.
4. **Scoped AI RAG Assistant (Google ADK)**: Conversational AI backed by Gemini that can ground answers with citations across `ALL` documents, a specific `FOLDER`, a single `DOCUMENT`, or a `CHAPTER`.
5. **ChromaDB Semantic Search**: Scoped vector search across document chunks with page numbers and relevance scores.

### Current Gap Summary
| Feature Area | Backend Status | Frontend Status | Implementation Needed |
| :--- | :--- | :--- | :--- |
| **Authentication & Profile** | 100% Complete | 75% Complete | Token sync from URL callback, profile details dropdown, session re-auth handling |
| **PDF Reading & Annotations** | 100% Complete | 90% Complete | Jump to page from citation, thumbnail sync, zoom persistence |
| **Folders / Directory Hierarchy** | 100% Complete | 0% (Missing) | Folder tree, create/rename/delete folder, move book to folder |
| **Document Indexing Pipeline** | 100% Complete | 0% (Missing) | "Index for AI" trigger, real-time status polling, progress bar |
| **Markdown Reader Mode** | 100% Complete | 0% (Missing) | Split/Toggle between PDF Canvas and Parsed Markdown reader |
| **Scoped AI Chat & Citations** | 100% Complete | 0% (Missing) | AI Chat sidebar, session switcher, citation cards with page jump |
| **Direct Vector / Semantic Search** | 100% Complete | 0% (Missing) | Command palette / search modal (`Cmd+K`) querying `/api/chat/query` |
| **Global Notes** | 100% Complete | 10% (Missing) | Global notes listing view (`/api/notes`) |

---

## 2. Comprehensive API Endpoint Map & Frontend Action Items

Below is the complete inventory of all backend API endpoints and what the frontend must implement for each.

```
/api
├── /auth
│   ├── GET  /url                          --> Fetch Google OAuth URL
│   ├── GET  /callback                     --> OAuth redirect target (?token=...&auth_success=1)
│   ├── POST /token                        --> Exchange code/access_token
│   ├── GET  /me                           --> Verify current session
│   └── POST /logout                       --> Invalidate Redis session & cookie
├── /user
│   └── GET  /me                           --> Fetch full user profile (id, email, name, picture)
├── /directories
│   ├── GET    /                           --> List folders (supports ?parent_id=...)
│   ├── POST   /                           --> Create folder { name, parent_folder_id }
│   ├── GET    /{directory_id}             --> Folder details + subdirectories + books
│   ├── PATCH  /{directory_id}             --> Rename or move folder
│   ├── DELETE /{directory_id}             --> Delete folder from Drive
│   ├── GET    /{directory_id}/books       --> List books in directory
│   ├── POST   /{directory_id}/books/{book_id}    --> Move book into directory
│   └── DELETE /{directory_id}/books/{book_id}    --> Remove book from directory
├── /books
│   ├── GET    /                           --> List books + syncData
│   ├── GET    /{book_id}/content          --> Stream PDF binary
│   ├── POST   /upload                     --> Multipart upload PDF
│   ├── DELETE /{book_id}                  --> Delete PDF + purge ChromaDB/DB
│   ├── PATCH  /{book_id}/progress         --> Save page & annotations
│   ├── POST   /{book_id}/index            --> Trigger Kafka 5-stage pipeline
│   ├── GET    /{book_id}/index-status     --> Get real-time pipeline status
│   └── GET    /{book_id}/markdown         --> Get parsed Markdown text
├── /chat
│   ├── GET    /sessions                   --> List user chat sessions
│   ├── POST   /sessions                   --> Create session (scoped to ALL, FOLDER, DOCUMENT, CHAPTER)
│   ├── GET    /sessions/{session_id}      --> Get session + full message history
│   ├── PATCH  /sessions/{session_id}      --> Rename session title
│   ├── DELETE /sessions/{session_id}      --> Delete session + cascade messages
│   ├── POST   /sessions/{session_id}/message  --> Send message to ADK RAG agent & get citations
│   └── POST   /query                      --> Direct ChromaDB semantic search
├── /sync
│   ├── GET    /                           --> Get raw cloud_pdf_reader_sync.json
│   └── PUT    /                           --> Replace cloud_pdf_reader_sync.json
└── /notes
    └── GET    /                           --> List global notes
```

---

## 3. Module-by-Module Frontend Requirements Specification

### Module 1: Authentication & User Session Lifecycle

#### 1.1 Backend Interaction
- **OAuth Initiation**: `GET /api/auth/url` returns `{ "url": "https://accounts.google.com/..." }`. Frontend opens this URL or sets `window.location.href`.
- **OAuth Callback**: Backend redirects browser to `${FRONTEND_URL}?auth_success=1&token=${session_token}` or `${FRONTEND_URL}?auth_error=${error}`.
- **Session Verification**: `GET /api/auth/me` with `Authorization: Bearer <token>` or cookie.
- **User Profile**: `GET /api/user/me` returns `User { id, email, name, picture }`.
- **Logout**: `POST /api/auth/logout`.

#### 1.2 Frontend Requirements
1. **URL Parameter Handling**:
   - On app startup, read query parameters `token`, `auth_success`, and `auth_error`.
   - Store `token` in `localStorage` under `cloud_pdf_session_token`.
   - Immediately sanitize browser URL using `window.history.replaceState({}, document.title, window.location.pathname)`.
   - If `auth_error` is present, display a dismissible toast notification with the error details.
2. **User Avatar & Profile Dropdown**:
   - Located in the sidebar bottom or top header navigation bar.
   - Displays avatar image (with fallback initials badge), user name, and email.
   - Dropdown menu with:
     - Account Info (Email, Google Account connected status)
     - Theme Toggle (Light / Dark mode)
     - Disconnect / Log out button.
3. **Session Expiration Guard**:
   - Intercept 401 Unauthorized responses in `lib/api.ts`.
   - Clear stored token and transition UI to `SignInScreen` with message: *"Your Google session expired. Please sign in again."*

---

### Module 2: Document Indexing & Processing Pipeline UI (New Feature)

#### 2.1 Backend Interaction
- **Trigger Indexing**: `POST /api/books/{book_id}/index`
  - Returns: `{ "status": "queued", "document_id": "...", "filename": "...", "message": "..." }`
- **Check Status**: `GET /api/books/{book_id}/index-status`
  - Returns `DocumentProcessingResponse`:
    ```json
    {
      "id": "uuid",
      "document_id": "uuid",
      "status": "PROCESSING", // UPLOADED | PROCESSING | INDEXED | FAILED | NEEDS_REINDEX
      "total_pages": 14,
      "total_chunks": 42,
      "processed_chunks": 28,
      "error_message": null,
      "started_at": "2026-08-30T16:50:00Z",
      "completed_at": null
    }
    ```

#### 2.2 Frontend Requirements
1. **Document Status Indicators**:
   - Add status badges on every book card in the Library sidebar:
     - **Not Indexed**: Grey pill (`Not Indexed`) with a Sparkles button (`Index for AI`).
     - **Processing**: Orange pulsing badge (`Indexing 68%`) with animated spinner and miniature progress line.
     - **Indexed**: Green pill (`Indexed · AI Ready`) with Sparkles icon.
     - **Failed**: Red pill (`Failed`) with a Retry button and tooltip showing `error_message`.
2. **Indexing Action Triggers**:
   - "Index for AI" button in the library sidebar book item menu.
   - "Index Document" button in the top navigation bar when viewing an active document that isn't indexed yet.
3. **Status Polling Hook (`useDocumentIndexing`)**:
   - Automatically polls `GET /api/books/{book_id}/index-status` every **2.5 seconds** when a book is in `PROCESSING` status.
   - Stops polling when status becomes `INDEXED` or `FAILED`.
   - Updates local cache so the user sees live progress: `processed_chunks / total_chunks` and percentage.
   - Triggers a subtle success toast when indexing finishes: *"Indexing complete! You can now chat with [Document Name]."*

---

### Module 3: Markdown Extraction & Reader Mode (New Feature)

#### 3.1 Backend Interaction
- **Fetch Parsed Text**: `GET /api/books/{book_id}/markdown`
  - Returns:
    ```json
    {
      "document_id": "...",
      "filename": "...",
      "markdown": "# Chapter 1\n\nExtracted content from PDF..."
    }
    ```

#### 3.2 Frontend Requirements
1. **View Mode Switcher**:
   - A segmented control in the top bar:
     - `[ PDF View | Markdown Reader | Split View ]`
2. **Markdown Reader Component (`MarkdownReader.tsx`)**:
   - Clean, readable typography using Suisse font and GitHub markdown styles.
   - Features required:
     - Syntax-highlighted code blocks with copy-to-clipboard button.
     - Formatted tables with horizontal scroll.
     - LaTeX mathematical rendering (via KaTeX or similar lightweight parser).
     - Table of Contents (TOC) sidebar auto-generated from `h1`, `h2`, `h3` headers.
     - Reading progress indicator (scroll percentage).
     - Search in text (`Ctrl+F` highlight).
3. **Cache & Loading State**:
   - Cache fetched markdown in memory per `book_id`.
   - If user requests markdown for an unindexed book, prompt them: *"Document is not indexed yet. Would you like to index it now?"* with a 1-click `[Index Now]` button.

---

### Module 4: Scoped AI Chat & RAG Assistant (Google ADK) (New Feature)

This is the flagship AI feature of the application.

#### 4.1 Backend Interaction
- **List Sessions**: `GET /api/chat/sessions` &rarr; `ChatSessionResponse[]`
- **Create Session**: `POST /api/chat/sessions`
  - Request:
    ```json
    {
      "title": "Discussion on Transformers",
      "scope_type": "DOCUMENT", // "ALL" | "FOLDER" | "DOCUMENT" | "CHAPTER"
      "scope_id": "google_drive_file_id_or_document_uuid"
    }
    ```
- **Fetch Session History**: `GET /api/chat/sessions/{session_id}` &rarr; `ChatSessionResponse` (includes `messages: ChatMessageResponse[]`)
- **Update Session**: `PATCH /api/chat/sessions/{session_id}` &rarr; `{ "title": "Updated Title" }`
- **Delete Session**: `DELETE /api/chat/sessions/{session_id}`
- **Send Message**: `POST /api/chat/sessions/{session_id}/message`
  - Request: `{ "message": "What is the main conclusion of section 3?" }`
  - Response:
    ```json
    {
      "session_id": "...",
      "user_message": {
        "id": "...",
        "role": "USER",
        "content": "...",
        "created_at": "..."
      },
      "assistant_message": {
        "id": "...",
        "role": "ASSISTANT",
        "content": "The author concludes that...",
        "created_at": "..."
      },
      "sources": [
        {
          "document_id": "...",
          "document_name": "Attention-Is-All-You-Need.pdf",
          "chapter_id": null,
          "chapter_title": null,
          "page_number": 6,
          "chunk_index": 12,
          "content": "Table 1 shows that our model achieves 28.4 BLEU...",
          "relevance_score": 0.89
        }
      ]
    }
    ```

#### 4.2 Frontend Requirements
1. **Collapsible AI Chat Drawer / Panel (`ChatDrawer.tsx`)**:
   - Toggled via a dedicated `Sparkles` icon button in the header (`AI Assistant`).
   - Width: 380px–460px on desktop (dockable to the right of the reader), full-width drawer on mobile.
2. **Scope Selector Bar**:
   - Indicates current context with an active pill:
     - 📄 **Current Document** (`DOCUMENT` scope with `activeBookId`).
     - 📁 **Active Folder** (`FOLDER` scope with `activeFolderId`).
     - 🌐 **Entire Library** (`ALL` scope).
   - Allows user to change scope when creating a new chat session.
3. **Session Switcher & History**:
   - Dropdown or secondary tab in chat header to view past chat sessions.
   - "+ New Chat" button.
   - Ability to rename session title inline and delete session.
4. **Chat Message Stream (`ChatMessageList.tsx`)**:
   - User messages styled with subtle accent background (`#fa5d19/10`).
   - Assistant messages formatted with markdown rendering, code blocks, bullet points, and citations.
   - Typing indicator / skeleton animation while awaiting response from the Google ADK RAG agent.
5. **Interactive Source Citations (`CitationCard.tsx`)**:
   - Each assistant message displays a list of sources used for grounding.
   - Citation Card displays:
     - Document Name & Page Number badge (`Page 6`).
     - Relevance score indicator (`89% match`).
     - Expandable excerpt snippet showing exact text chunk.
     - **Click-to-Navigate Handler**: When clicked, automatically jumps the PDF Reader (or Markdown reader) to that exact page!
6. **Suggested Prompts / Starter Chips**:
   - Shown when chat history is empty:
     - *"Summarize this document"*
     - *"What are the key findings?"*
     - *"Explain the methodology used"*
     - *"Extract all data tables and metrics"*

---

### Module 5: Google Drive Directories & Folder Hierarchy (New Feature)

#### 5.1 Backend Interaction
- **List Folders**: `GET /api/directories` (or `?parent_id={parent_id}`) &rarr; `FolderResponse[]`
  ```json
  [
    {
      "id": "folder_drive_id",
      "name": "Machine Learning",
      "parent_folder_id": null,
      "created_time": "...",
      "modified_time": "...",
      "book_count": 5
    }
  ]
  ```
- **Create Folder**: `POST /api/directories` &rarr; `{ "name": "AI Papers", "parent_folder_id": null }`
- **Folder Details**: `GET /api/directories/{directory_id}` &rarr; `FolderDetailResponse` (with `subdirectories` and `books`)
- **Rename/Move**: `PATCH /api/directories/{directory_id}` &rarr; `{ "name": "New Name" }`
- **Delete Folder**: `DELETE /api/directories/{directory_id}`
- **List Folder Books**: `GET /api/directories/{directory_id}/books` &rarr; `Book[]`
- **Move Book to Folder**: `POST /api/directories/{directory_id}/books/{book_id}`
- **Remove Book from Folder**: `DELETE /api/directories/{directory_id}/books/{book_id}`

#### 5.2 Frontend Requirements
1. **Folder Navigation in Library Sidebar**:
   - Segmented view or tree view in `DocumentSidebar`:
     - `[ All Documents | Folders | Recent ]`
   - Nested folder list with expand/collapse chevron, folder icon, folder name, and `book_count` badge.
   - Breadcrumbs navigation when drilling into a folder: `Library > Machine Learning > NLP`.
2. **Folder Management Dialogs**:
   - **New Folder Modal**: Text input for folder name and optional parent folder picker.
   - **Rename Folder Modal / Action**: Right-click or 3-dots menu on folder items.
   - **Delete Folder Confirmation Modal**: Warning user that deleting folder removes it from Google Drive.
3. **Organizing Books**:
   - "Move to Folder" menu action on each book item.
   - Modal with folder selector to move book into target folder (`POST /api/directories/{dir_id}/books/{book_id}`).
   - Drag and drop (optional enhancement): dragging a book card onto a folder icon moves it.

---

### Module 6: Global Semantic Search Modal (Cmd+K / Ctrl+K) (New Feature)

#### 6.1 Backend Interaction
- **Direct Semantic Search**: `POST /api/chat/query`
  - Request:
    ```json
    {
      "query": "learning rate warmup",
      "scope": {
        "type": "ALL", // "ALL" | "DOCUMENT" | "FOLDER" | "CHAPTER"
        "id": null
      },
      "n_results": 6
    }
    ```
  - Response:
    ```json
    {
      "query": "learning rate warmup",
      "scope": { "type": "ALL", "id": null },
      "results": [
        {
          "id": "chunk_uuid",
          "document": "We used a learning rate schedule with warmup...",
          "metadata": {
            "user_id": "...",
            "document_id": "doc_id",
            "chapter_id": "",
            "page_number": 5,
            "chunk_index": 8
          },
          "distance": 0.22
        }
      ]
    }
    ```

#### 6.2 Frontend Requirements
1. **Command Palette (`CommandPalette.tsx`)**:
   - Triggered via global keybinding (`Cmd+K` on macOS, `Ctrl+K` on Windows/Linux) or search icon button in the header.
2. **Semantic Search Tab**:
   - Allows switching between "Filename Search" (local filter) and "Semantic Search" (vector search over all indexed documents).
   - Shows matching snippet highlights, document name, page number, and similarity score.
   - Clicking a result opens the book and immediately scrolls to that page.

---

### Module 7: Annotation & Reading Tools Refinements

#### 7.1 Existing Backend APIs
- `PATCH /api/books/{book_id}/progress` (with `highlights`, `notes`, `inkStrokes`, `shapes`, `textBoxes`)
- `GET /api/notes` (returns global notes)

#### 7.2 Frontend Improvements
1. **Jump to Annotation**: Clicking any highlight, note, or shape in `AnnotationPanel` scrolls directly to that page and pulses the annotation.
2. **Global Notes Tab**: In the library sidebar or modal, display all sticky notes created across all books, grouped by document, with direct navigation to the referenced page.
3. **Export Annotations**: Allow exporting annotations as a Markdown or JSON file.

---

## 4. Required TypeScript Interfaces & Data Contracts

All these interfaces should be added to `frontend/src/types.ts`:

```typescript
// ── Enums ────────────────────────────────────────────────────────────────────
export type DocumentStatus = 
  | 'UPLOADED' 
  | 'PROCESSING' 
  | 'INDEXED' 
  | 'FAILED' 
  | 'NEEDS_REINDEX';

export type ScopeType = 'ALL' | 'FOLDER' | 'DOCUMENT' | 'CHAPTER';
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

// ── Indexing & Pipeline ──────────────────────────────────────────────────────
export interface DocumentProcessingResponse {
  id: string;
  document_id: string;
  status: DocumentStatus;
  total_pages: number;
  total_chunks: number;
  processed_chunks: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DocumentMarkdownResponse {
  document_id: string;
  filename: string;
  markdown: string;
}

// ── Folders & Directories ────────────────────────────────────────────────────
export interface FolderResponse {
  id: string;
  name: string;
  parent_folder_id?: string | null;
  created_time?: string | null;
  modified_time?: string | null;
  book_count?: number;
}

export interface FolderDetailResponse extends FolderResponse {
  subdirectories: FolderResponse[];
  books: Book[];
}

export interface FolderCreatePayload {
  name: string;
  parent_folder_id?: string | null;
}

export interface FolderUpdatePayload {
  name?: string;
  parent_folder_id?: string | null;
}

// ── AI Chat & Scoped RAG ─────────────────────────────────────────────────────
export interface ChatMessageResponse {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface ChatSessionResponse {
  id: string;
  user_id: string;
  title: string;
  scope_type: ScopeType;
  scope_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  messages?: ChatMessageResponse[];
}

export interface CreateSessionRequest {
  title?: string;
  scope_type: ScopeType;
  scope_id?: string | null;
}

export interface SourceCitation {
  document_id: string;
  document_name?: string | null;
  chapter_id?: string | null;
  chapter_title?: string | null;
  page_number: number;
  chunk_index: number;
  content: string;
  relevance_score?: number | null;
}

export interface SendMessageResponse {
  session_id: string;
  user_message: ChatMessageResponse;
  assistant_message: ChatMessageResponse;
  sources: SourceCitation[];
}

export interface QueryScope {
  type: ScopeType;
  id?: string | null;
}

export interface QueryRequest {
  query: string;
  scope: QueryScope;
  n_results?: number;
}

export interface ChunkMetadataResponse {
  user_id: string;
  document_id: string;
  chapter_id?: string;
  page_number: number;
  chunk_index: number;
}

export interface QueryChunkResult {
  id: string;
  document: string;
  metadata: ChunkMetadataResponse;
  distance?: number | null;
}

export interface QueryResponse {
  query: string;
  scope: QueryScope;
  results: QueryChunkResult[];
}
```

---

## 5. API Client Extension Plan (`frontend/src/lib/api.ts`)

The following API helper functions must be implemented in `frontend/src/lib/api.ts`:

```typescript
// ── Document Indexing & Markdown ─────────────────────────────────────────────
export async function triggerBookIndex(bookId: string): Promise<{ status: string; document_id: string; message: string }> {
  return request(`/api/books/${bookId}/index`, { method: 'POST' });
}

export async function fetchBookIndexStatus(bookId: string): Promise<DocumentProcessingResponse> {
  return request<DocumentProcessingResponse>(`/api/books/${bookId}/index-status`);
}

export async function fetchBookMarkdown(bookId: string): Promise<DocumentMarkdownResponse> {
  return request<DocumentMarkdownResponse>(`/api/books/${bookId}/markdown`);
}

// ── Directory & Folder Management ────────────────────────────────────────────
export async function fetchDirectories(parentId?: string): Promise<FolderResponse[]> {
  const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
  return request<FolderResponse[]>(`/api/directories${query}`);
}

export async function createDirectory(payload: FolderCreatePayload): Promise<FolderResponse> {
  return request<FolderResponse>('/api/directories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchDirectoryDetails(directoryId: string): Promise<FolderDetailResponse> {
  return request<FolderDetailResponse>(`/api/directories/${directoryId}`);
}

export async function updateDirectory(directoryId: string, payload: FolderUpdatePayload): Promise<FolderResponse> {
  return request<FolderResponse>(`/api/directories/${directoryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteDirectory(directoryId: string): Promise<{ message: string }> {
  return request(`/api/directories/${directoryId}`, { method: 'DELETE' });
}

export async function moveBookToDirectory(directoryId: string, bookId: string): Promise<{ message: string }> {
  return request(`/api/directories/${directoryId}/books/${bookId}`, { method: 'POST' });
}

export async function removeBookFromDirectory(directoryId: string, bookId: string): Promise<{ message: string }> {
  return request(`/api/directories/${directoryId}/books/${bookId}`, { method: 'DELETE' });
}

// ── AI Chat & Scoped RAG ─────────────────────────────────────────────────────
export async function fetchChatSessions(): Promise<ChatSessionResponse[]> {
  return request<ChatSessionResponse[]>('/api/chat/sessions');
}

export async function createChatSession(payload: CreateSessionRequest): Promise<ChatSessionResponse> {
  return request<ChatSessionResponse>('/api/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchChatSession(sessionId: string): Promise<ChatSessionResponse> {
  return request<ChatSessionResponse>(`/api/chat/sessions/${sessionId}`);
}

export async function updateChatSession(sessionId: string, title: string): Promise<ChatSessionResponse> {
  return request<ChatSessionResponse>(`/api/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function deleteChatSession(sessionId: string): Promise<{ status: string }> {
  return request(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function sendChatMessage(sessionId: string, message: string): Promise<SendMessageResponse> {
  return request<SendMessageResponse>(`/api/chat/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export async function querySemanticSearch(payload: QueryRequest): Promise<QueryResponse> {
  return request<QueryResponse>('/api/chat/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

---

## 6. Frontend State Management & Hook Architecture

```
State Layer
├── useAuth()            --> User profile, Google token, login, logout
├── useBooks()           --> Book list, active book bytes, annotations, sync saving
├── useFolders() [NEW]   --> Folders hierarchy, active folder, create/rename/delete
├── useIndexing() [NEW]  --> Document indexing status, trigger index, polling timer
├── useChat() [NEW]      --> Sessions list, active session, messages, citations, jump-to-page
├── useMarkdown() [NEW]  --> Fetched markdown cache, reading mode toggle
└── useUI()              --> Sidebar open, chat open, dark mode, view mode
```

---

## 7. User Experience & Layout Hierarchy

### Desktop Layout Wireframe
```
+---------------------------------------------------------------------------------------------------+
|  [Flame Logo] Cloud PDF  |  [Library Toggle]  |  📄 Attention-Is-All-You-Need.pdf  |  [Sync Status] |  [View Mode: PDF/MD]  |  [Tags]  |  [AI Chat]  |  [User Avatar]  |
+---------------------------------------------------------------------------------------------------+
| FOLDERS & LIBRARY      |                          READER VIEWPORT                          | AI CHAT ASSISTANT (COLLAPSIBLE)   |
|                        |                                                                   |                                   |
| [Search Documents...]  |  +-------------------------------------------------------------+  | Scope: [📄 Current Document v]   |
|                        |  | [Page 1 / 15]  [- Zoom +]  [Draw]  [Highlight]  [Sticky Note] |  |                                   |
| 📁 All Folders         |  +-------------------------------------------------------------+  | User: What is multi-head attn?    |
|   ├ ML Papers (3)      |                                                                   |                                   |
|   └ Textbooks (2)      |  +-------------------------------------------------------------+  | Assistant:                        |
|                        |  |                                                             |  | Multi-head attention allows the   |
| 📄 Attention... (92%)  |  |                     PDF Canvas Page 1                       |  | model to jointly attend to...     |
|   [Indexed · AI Ready] |  |                                                             |  |                                   |
|                        |  |                                                             |  | Sources:                          |
| 📄 ResNet50.pdf        |  |                                                             |  | ┌───────────────────────────────┐ |
|   [Not Indexed]        |  |                                                             |  | │ Page 4 · Chunk 7 (88% match) │ |
|   [+ Index for AI]     |  |                                                             |  | │ "Multi-head attention allows..│ |
|                        |  +-------------------------------------------------------------+  | └───────────────────────────────┘ |
|                        |                                                                   |                                   |
|                        |                                                                   | [Type message to ask PDF...   > ] |
+---------------------------------------------------------------------------------------------------+
```

---

## 8. Implementation Roadmap (Phases P0 to P3)

### Phase P0: Auth & URL Callback Polish (Immediate)
- Handle OAuth URL params (`?token=...&auth_success=1`) robustly.
- Add user profile dropdown with user photo, name, email, and logout button.
- Intercept 401 Unauthorized responses to prompt re-login.

### Phase P1: Document Indexing Pipeline & Status Integration
- Add `triggerBookIndex` and `fetchBookIndexStatus` in `lib/api.ts`.
- Build `useIndexing` hook with automated 2.5s polling.
- Add status pills and "Index for AI" triggers on book cards and top navigation.

### Phase P2: Scoped AI Chat Assistant & Citation Jump
- Implement chat API functions (`fetchChatSessions`, `createChatSession`, `sendChatMessage`).
- Build `ChatDrawer.tsx`, `ChatMessageList.tsx`, and `CitationCard.tsx`.
- Connect citation click handler to `PDFReader` page navigator (`handleChangePage(citation.page_number)`).
- Add Markdown viewer toggle (`MarkdownReader.tsx`) for reading parsed documents directly.

### Phase P3: Folder Tree Management & Global Semantic Search (Cmd+K)
- Implement directory APIs (`fetchDirectories`, `createDirectory`, `moveBookToDirectory`).
- Build folder tree and breadcrumbs inside `DocumentSidebar.tsx`.
- Build `CommandPalette.tsx` for global semantic search across all indexed chunks via `/api/chat/query`.
