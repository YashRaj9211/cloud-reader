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
    let errorDetail = 'Request failed';
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.message || res.statusText;
    } catch {
      errorDetail = await res.text() || res.statusText;
    }
    throw new Error(errorDetail);
  }

  // If response is json, parse it; otherwise return raw text/response if needed
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

// ── Auth API ─────────────────────────────────────────────────────────────────

export async function getGoogleAuthUrl(redirectUri?: string): Promise<string> {
  const urlParams = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : '';
  const data = await request<{ url: string }>(`/api/auth/url${urlParams}`);
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
