import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  Book,
  BookProgress,
  ChatSessionResponse,
  CreateSessionRequest,
  DocumentMarkdownResponse,
  DocumentProcessingResponse,
  FolderCreatePayload,
  FolderDetailResponse,
  FolderResponse,
  FolderUpdatePayload,
  GlobalNoteItem,
  QueryRequest,
  QueryResponse,
  SendMessageResponse,
  SyncData,
  User,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';
export const SESSION_TOKEN_KEY = 'cloud_pdf_session_token';

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

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Request Interceptor: Attach session token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredSessionToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Catch 401 and trigger global logout (excluding initial auth check)
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/api/auth/me')) {
        setStoredSessionToken(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cloud_pdf:auth_expired'));
        }
      }
    }
    return Promise.reject(error);
  }
);

// Helper for extracting clean error message
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'string') return data;
    if (data?.detail) {
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
    if (data?.message) return data.message;
    return error.message || 'Network request failed';
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// ── Auth & User API ──────────────────────────────────────────────────────────

export async function getGoogleAuthUrl(redirectUri?: string, state?: string): Promise<string> {
  const params: Record<string, string> = {};
  if (redirectUri) params.redirect_uri = redirectUri;
  const effectiveState = state || (typeof window !== 'undefined' ? window.location.origin : undefined);
  if (effectiveState) params.state = effectiveState;

  const { data } = await apiClient.get<{ url: string }>('/api/auth/url', { params });
  return data.url;
}

export async function checkAuthSession(): Promise<{ authenticated: boolean; user?: User }> {
  try {
    const { data } = await apiClient.get<{ authenticated: boolean; user?: User }>('/api/auth/me');
    return data;
  } catch {
    return { authenticated: false };
  }
}

export async function fetchUserProfile(): Promise<User> {
  const { data } = await apiClient.get<User>('/api/user/me');
  return data;
}

export async function loginWithToken(payload: {
  code?: string;
  access_token?: string;
  id_token?: string;
  redirect_uri?: string;
}): Promise<{ user: User; session_token: string }> {
  const { data } = await apiClient.post<{
    authenticated: boolean;
    user: User;
    session_token: string;
    access_token?: string;
  }>('/api/auth/token', payload);

  const token = data.session_token || data.access_token || '';
  if (token) {
    setStoredSessionToken(token);
  }

  return { user: data.user, session_token: token };
}

export async function logoutUser(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout');
  } finally {
    setStoredSessionToken(null);
  }
}

// ── Directories & Folders API ────────────────────────────────────────────────

export async function fetchDirectories(parentId?: string): Promise<FolderResponse[]> {
  const params = parentId ? { parent_id: parentId } : undefined;
  const { data } = await apiClient.get<FolderResponse[]>('/api/directories', { params });
  return data;
}

export async function createDirectory(payload: FolderCreatePayload): Promise<FolderResponse> {
  const { data } = await apiClient.post<FolderResponse>('/api/directories', payload);
  return data;
}

export async function fetchDirectoryDetails(directoryId: string): Promise<FolderDetailResponse> {
  const { data } = await apiClient.get<FolderDetailResponse>(`/api/directories/${directoryId}`);
  return data;
}

export async function updateDirectory(
  directoryId: string,
  payload: FolderUpdatePayload
): Promise<FolderResponse> {
  const { data } = await apiClient.patch<FolderResponse>(
    `/api/directories/${directoryId}`,
    payload
  );
  return data;
}

export async function deleteDirectory(directoryId: string): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/api/directories/${directoryId}`);
  return data;
}

export async function fetchDirectoryBooks(directoryId: string): Promise<Book[]> {
  const { data } = await apiClient.get<Book[]>(`/api/directories/${directoryId}/books`);
  return data;
}

export async function moveBookToDirectory(
  directoryId: string,
  bookId: string
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    `/api/directories/${directoryId}/books/${bookId}`
  );
  return data;
}

export async function removeBookFromDirectory(
  directoryId: string,
  bookId: string
): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(
    `/api/directories/${directoryId}/books/${bookId}`
  );
  return data;
}

// ── Books & Drive API ────────────────────────────────────────────────────────

export async function fetchLibrary(): Promise<{
  books: Book[];
  syncData: SyncData;
  syncFileId?: string;
}> {
  const { data } = await apiClient.get<{
    books: Book[];
    syncData: SyncData;
    syncFileId?: string;
  }>('/api/books');
  return data;
}

export async function fetchBookBytes(bookId: string): Promise<ArrayBuffer> {
  const res = await apiClient.get(`/api/books/${bookId}/content`, {
    responseType: 'arraybuffer',
  });
  return res.data;
}

export async function uploadBookFile(file: File): Promise<Book> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiClient.post<Book>('/api/books/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteBookFile(bookId: string): Promise<void> {
  await apiClient.delete(`/api/books/${bookId}`);
}

export async function updateBookProgress(
  bookId: string,
  progress: BookProgress
): Promise<BookProgress> {
  const { data } = await apiClient.patch<BookProgress>(
    `/api/books/${bookId}/progress`,
    progress
  );
  return data;
}

// ── Indexing & Markdown API ──────────────────────────────────────────────────

export async function triggerBookIndex(
  bookId: string
): Promise<{ status: string; document_id: string; message: string }> {
  const { data } = await apiClient.post<{ status: string; document_id: string; message: string }>(
    `/api/books/${bookId}/index`
  );
  return data;
}

export async function fetchBookIndexStatus(bookId: string): Promise<DocumentProcessingResponse> {
  const { data } = await apiClient.get<DocumentProcessingResponse>(
    `/api/books/${bookId}/index-status`
  );
  return data;
}

export async function fetchBookMarkdown(bookId: string): Promise<DocumentMarkdownResponse> {
  const { data } = await apiClient.get<DocumentMarkdownResponse>(
    `/api/books/${bookId}/markdown`
  );
  return data;
}

// ── AI Chat & Scoped RAG API ─────────────────────────────────────────────────

export async function fetchChatSessions(): Promise<ChatSessionResponse[]> {
  const { data } = await apiClient.get<ChatSessionResponse[]>('/api/chat/sessions');
  return data;
}

export async function createChatSession(
  payload: CreateSessionRequest
): Promise<ChatSessionResponse> {
  const { data } = await apiClient.post<ChatSessionResponse>('/api/chat/sessions', payload);
  return data;
}

export async function fetchChatSession(sessionId: string): Promise<ChatSessionResponse> {
  const { data } = await apiClient.get<ChatSessionResponse>(`/api/chat/sessions/${sessionId}`);
  return data;
}

export async function updateChatSession(
  sessionId: string,
  title: string
): Promise<ChatSessionResponse> {
  const { data } = await apiClient.patch<ChatSessionResponse>(
    `/api/chat/sessions/${sessionId}`,
    { title }
  );
  return data;
}

export async function deleteChatSession(sessionId: string): Promise<{ status: string }> {
  const { data } = await apiClient.delete<{ status: string }>(`/api/chat/sessions/${sessionId}`);
  return data;
}

export async function sendChatMessage(
  sessionId: string,
  message: string
): Promise<SendMessageResponse> {
  const { data } = await apiClient.post<SendMessageResponse>(
    `/api/chat/sessions/${sessionId}/message`,
    { message }
  );
  return data;
}

export async function querySemanticSearch(payload: QueryRequest): Promise<QueryResponse> {
  const { data } = await apiClient.post<QueryResponse>('/api/chat/query', payload);
  return data;
}

// ── Sync & Notes API ─────────────────────────────────────────────────────────

export async function fetchSyncData(): Promise<SyncData> {
  const { data } = await apiClient.get<SyncData>('/api/sync');
  return data;
}

export async function saveSyncData(syncData: SyncData): Promise<SyncData> {
  const { data } = await apiClient.put<SyncData>('/api/sync', syncData);
  return data;
}

export async function fetchGlobalNotes(): Promise<GlobalNoteItem[]> {
  try {
    const { data } = await apiClient.get<GlobalNoteItem[]>('/api/notes');
    return data;
  } catch {
    return [];
  }
}

// ── Legacy / BookAIPanel RAG API Compatibility ──────────────────────────────

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

export async function processBook(bookId: string): Promise<{ book_id: string; task_id: string; message: string }> {
  const { data } = await apiClient.post(`/api/books/${bookId}/index`);
  return data;
}

export async function getRagStatus(bookId: string): Promise<RagStatus> {
  const { data } = await apiClient.get<DocumentProcessingResponse>(`/api/books/${bookId}/index-status`);
  return {
    book_id: data.book_id,
    status: data.status as any,
    total_chunks: data.total_chunks,
    error_message: data.error_message,
    updated_at: data.updated_at,
  };
}

export async function* chatWithBookStream(bookId: string, query: string): AsyncGenerator<string> {
  const token = getStoredSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/chat/query`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ query, document_id: bookId }),
  });

  if (!res.ok) throw new Error(`Chat request failed: ${res.statusText}`);
  const data = await res.json();
  if (data?.answer) {
    yield data.answer;
  }
}

export async function generateNotes(
  bookId: string,
  scope: 'chapter' | 'full',
  bookTitle?: string
): Promise<{ book_id: string; scope: string; orchestrator_task_id: string; message: string }> {
  const { data } = await apiClient.post(`/api/notes/generate`, {
    book_id: bookId,
    scope,
    book_title: bookTitle,
  });
  return data;
}

export async function fetchNotes(bookId: string): Promise<BookNote[]> {
  try {
    const { data } = await apiClient.get<BookNote[]>(`/api/notes?book_id=${bookId}`);
    return data;
  } catch {
    return [];
  }
}

export async function retryNote(bookId: string, noteId: string): Promise<{ message: string; note_id: string }> {
  const { data } = await apiClient.post(`/api/notes/${noteId}/retry`, { book_id: bookId });
  return data;
}

export async function clearNotes(bookId: string): Promise<{ message: string }> {
  const { data } = await apiClient.delete(`/api/notes?book_id=${bookId}`);
  return data;
}

