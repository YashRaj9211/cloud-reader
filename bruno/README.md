# Bruno API Collection for Cloud PDF Reader

This folder contains the complete [Bruno](https://www.usebruno.com/) API collection for testing and interacting with all backend endpoints of Cloud PDF Reader.

## Structure

```
bruno/
├── bruno.json
├── environments/
│   └── local.bru                # Environment variables (baseUrl, token, bookId, noteId)
├── System/
│   ├── Root.bru                 # GET /
│   └── Health Check.bru         # GET /api/health
├── Auth/
│   ├── Get Auth URL.bru         # GET /api/auth/url
│   ├── Exchange Token.bru       # POST /api/auth/token (auto-sets 'token')
│   ├── Get Me.bru               # GET /api/auth/me (Bearer auth)
│   └── Logout.bru               # POST /api/auth/logout
├── Books/
│   ├── List Books.bru           # GET /api/books (auto-sets 'bookId')
│   ├── Upload Book.bru          # POST /api/books/upload (multipart PDF)
│   ├── Get Book Content.bru     # GET /api/books/:bookId/content (streams PDF)
│   ├── Update Book Progress.bru # PATCH /api/books/:bookId/progress
│   └── Delete Book.bru          # DELETE /api/books/:bookId
├── Sync/
│   ├── Get Sync Data.bru        # GET /api/sync
│   └── Replace Sync Data.bru    # PUT /api/sync
└── RAG/
    ├── Process Book.bru         # POST /api/rag/:bookId/process (Celery async task)
    ├── Get Processing Status.bru# GET /api/rag/:bookId/status
    ├── Chat with Book.bru       # POST /api/rag/:bookId/chat (JSON / SSE stream)
    ├── Generate Notes.bru       # POST /api/rag/:bookId/notes/generate
    ├── List Notes.bru           # GET /api/rag/:bookId/notes (auto-sets 'noteId')
    └── Get Single Note.bru      # GET /api/rag/:bookId/notes/:noteId
```

## How to Use

### 1. Using the Bruno GUI App
1. Open Bruno Desktop App.
2. Click **Open Collection**.
3. Select the `bruno` folder from this repository.
4. Select the **`local`** environment from the environment dropdown in the top right.

### 2. Using Bruno CLI (`bru`)
Run all requests or specific folders:

```bash
# Navigate to bruno directory
cd bruno

# Run entire collection against local backend
bru run --env local

# Run specific folder
bru run Auth --env local
bru run RAG --env local
bru run Books --env local
```

### Automation & Scripting
- **Auth**: Calling `POST /api/auth/token` automatically saves `session_token` into the `token` environment variable for all subsequent requests.
- **Books**: `GET /api/books` and `POST /api/books/upload` automatically store `bookId`.
- **Notes**: `GET /api/rag/:bookId/notes` automatically stores `noteId`.
