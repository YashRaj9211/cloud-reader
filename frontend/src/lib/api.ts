import { Book, BookProgress, SyncData, User } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SESSION_TOKEN_KEY = 'cloud_pdf_session_token';

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {}
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredSessionToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errorDetail = res.statusText || 'Request failed';
    try {
      const rawText = await res.text();
      try {
        const errJson = JSON.parse(rawText);
        errorDetail = errJson.detail || errJson.message || rawText || errorDetail;
      } catch {
        errorDetail = rawText || errorDetail;
      }
    } catch {
      // Fallback to default errorDetail if reading response fails
    }
    throw new Error(errorDetail);
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

export async function getGoogleAuthUrl(redirectUri?: string, state?: string): Promise<string> {
  const params = new URLSearchParams();
  if (redirectUri) params.set('redirect_uri', redirectUri);
  const effectiveState = state || (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (effectiveState) params.set('state', effectiveState);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ url: string }>(`/api/auth/url${qs}`);
  return data.url;
}

export async function checkAuthSession(): Promise<{ authenticated: boolean; user?: User }> {
  try {
    const data = await request<{ authenticated: boolean; user?: User }>('/api/auth/me');
    return data;
  } catch {
    return { authenticated: false };
  }
}

export async function loginWithToken(payload: {
  code?: string;
  access_token?: string;
  id_token?: string;
  redirect_uri?: string;
}): Promise<{ user: User; session_token: string }> {
  const data = await request<{
    authenticated: boolean;
    user: User;
    session_token: string;
    access_token?: string;
  }>('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (data.session_token) {
    setStoredSessionToken(data.session_token);
  } else if (data.access_token) {
    setStoredSessionToken(data.access_token);
  }

  return { user: data.user, session_token: data.session_token || data.access_token || '' };
}

export async function logoutUser(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredSessionToken(null);
  }
}

// ── Books & Drive API ────────────────────────────────────────────────────────

export async function fetchLibrary(): Promise<{
  books: Book[];
  syncData: SyncData;
  syncFileId?: string;
}> {
  return request<{
    books: Book[];
    syncData: SyncData;
    syncFileId?: string;
  }>('/api/books');
}

export async function fetchBookBytes(bookId: string): Promise<ArrayBuffer> {
  const token = getStoredSessionToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/api/books/${bookId}/content`, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to download PDF document: ${res.statusText}`);
  }

  return res.arrayBuffer();
}

export async function uploadBookFile(file: File): Promise<Book> {
  const formData = new FormData();
  formData.append('file', file);

  return request<Book>('/api/books/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteBookFile(bookId: string): Promise<void> {
  await request<{ message: string; id: string }>(`/api/books/${bookId}`, {
    method: 'DELETE',
  });
}

export async function updateBookProgress(
  bookId: string,
  progress: BookProgress
): Promise<BookProgress> {
  return request<BookProgress>(`/api/books/${bookId}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  });
}

export async function fetchSyncData(): Promise<SyncData> {
  return request<SyncData>('/api/sync');
}

export async function saveSyncData(syncData: SyncData): Promise<SyncData> {
  return request<SyncData>('/api/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(syncData),
  });
}

// ── RAG API ──────────────────────────────────────────────────────────────────

export interface RagStatus {
  book_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_chunks?: number;
  error_message?: string;
  updated_at?: string;
}

export interface ChatSource {
  page: number;
  chunk_index: number;
  text_preview: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  timestamp: string;
}

export interface BookNote {
  id: string;
  book_id: string;
  scope: 'chapter' | 'full';
  chapter_title?: string;
  chapter_index?: number;
  content?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error_message?: string;
  updated_at?: string;
}

/** Kick off the indexing pipeline for a book. Returns Celery task ID. */
export async function processBook(bookId: string): Promise<{ book_id: string; task_id: string; message: string }> {
  return request(`/api/rag/${bookId}/process`, { method: 'POST' });
}

/** Poll the indexing status for a book. */
export async function getRagStatus(bookId: string): Promise<RagStatus> {
  return request(`/api/rag/${bookId}/status`);
}

/** Ask a question about a book (non-streaming). */
export async function chatWithBook(bookId: string, query: string): Promise<{ answer: string; sources: ChatSource[] }> {
  return request(`/api/rag/${bookId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, stream: false }),
  });
}

/**
 * Ask a question with streaming SSE response.
 * Returns an async generator that yields text tokens.
 */
export async function* chatWithBookStream(bookId: string, query: string): AsyncGenerator<string> {
  const token = getStoredSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/rag/${bookId}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ query, stream: true }),
  });

  if (!res.ok) throw new Error(`Chat request failed: ${res.statusText}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Parse SSE lines: "data: <token>\n\n"
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const token = line.slice(6);
        if (token === '[DONE]') return;
        if (token) {
          // Decode backend's \n -> \\n replacements back to actual newlines
          yield token.replace(/\\n/g, '\n');
        }
      }
    }
  }
}

/** Enqueue note generation (chapter or full). */
export async function generateNotes(
  bookId: string,
  scope: 'chapter' | 'full',
  bookTitle?: string
): Promise<{ book_id: string; scope: string; orchestrator_task_id: string; message: string }> {
  return request(`/api/rag/${bookId}/notes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, book_title: bookTitle }),
  });
}

/** Fetch all generated notes for a book. */
export async function fetchNotes(bookId: string): Promise<BookNote[]> {
  return request(`/api/rag/${bookId}/notes`);
}

/** Retry generating a specific note. */
export async function retryNote(bookId: string, noteId: string): Promise<{ message: string; note_id: string }> {
  return request(`/api/rag/${bookId}/notes/${noteId}/retry`, {
    method: 'POST',
  });
}

/** Clear all notes for a book. */
export async function clearNotes(bookId: string): Promise<{ message: string }> {
  return request(`/api/rag/${bookId}/notes`, {
    method: 'DELETE',
  });
}

