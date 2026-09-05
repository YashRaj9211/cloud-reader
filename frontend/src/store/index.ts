import { create } from 'zustand';
import {
  Book,
  BookProgress,
  ChatMessageResponse,
  ChatSessionResponse,
  DocumentProcessingResponse,
  FolderDetailResponse,
  FolderResponse,
  GlobalNoteItem,
  QueryChunkResult,
  QueryScope,
  ScopeType,
  SyncData,
  User,
  ViewMode,
} from '../types';
import {
  checkAuthSession,
  createChatSession as apiCreateChatSession,
  createDirectory as apiCreateDirectory,
  deleteBookFile as apiDeleteBookFile,
  deleteChatSession as apiDeleteChatSession,
  deleteDirectory as apiDeleteDirectory,
  fetchBookBytes,
  fetchBookIndexStatus,
  fetchBookMarkdown,
  fetchChatSession,
  fetchChatSessions,
  fetchDirectories,
  fetchDirectoryDetails,
  fetchGlobalNotes,
  fetchLibrary,
  getApiErrorMessage,
  getGoogleAuthUrl,
  getStoredSessionToken,
  logoutUser,
  moveBookToDirectory,
  querySemanticSearch,
  removeBookFromDirectory,
  sendChatMessageStream as apiSendChatMessageStream,
  setStoredSessionToken,
  triggerBookIndex,
  updateBookProgress,
  updateChatSession,
  updateDirectory as apiUpdateDirectory,
  uploadBookFile,
} from '../lib/api';
import { emptyProgress } from '../utils/helpers';

export interface AppState {
  // ── Auth State ──
  user: User | null;
  needsAuth: boolean;
  loadingInit: boolean;
  authError: string | null;
  initAuth: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  setAuthError: (error: string | null) => void;

  // ── UI State ──
  darkMode: boolean;
  sidebarOpen: boolean;
  annotationsOpen: boolean;
  chatOpen: boolean;
  commandPaletteOpen: boolean;
  viewMode: ViewMode;
  activeSidebarTab: 'documents' | 'folders' | 'notes';
  setDarkMode: (enabled: boolean) => void;
  toggleDarkMode: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setAnnotationsOpen: (open: boolean) => void;
  toggleAnnotations: () => void;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveSidebarTab: (tab: 'documents' | 'folders' | 'notes') => void;

  // ── Animation Studio Window State (On-Demand Interactive Dock) ──
  activeAnimation: {
    code: string;
    title?: string;
    groundedPage?: number | string;
    sourceDocId?: string;
  } | null;
  animationStudioOpen: boolean;
  setActiveAnimation: (
    anim: {
      code: string;
      title?: string;
      groundedPage?: number | string;
      sourceDocId?: string;
    } | null
  ) => void;
  setAnimationStudioOpen: (open: boolean) => void;

  // ── Books & Library State ──
  books: Book[];
  activeBookId: string | null;
  activeBookBytes: ArrayBuffer | null;
  activeBookPage: number;
  syncFileId: string | null;
  syncData: SyncData;
  isSaving: boolean;
  loadingLibrary: boolean;
  loadingBookData: boolean;
  bookError: string | null;
  activeMarkdown: string | null;
  loadingMarkdown: boolean;
  loadLibrary: () => Promise<void>;
  selectBook: (bookId: string) => Promise<void>;
  changePage: (page: number) => void;
  uploadBook: (file: File) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  updateBookStats: (
    bookId: string,
    updater: (prev: BookProgress) => BookProgress
  ) => Promise<void>;
  loadBookMarkdown: (bookId: string) => Promise<void>;
  setBookError: (err: string | null) => void;

  // ── Folder & Directory State ──
  folders: FolderResponse[];
  activeFolderId: string | null;
  folderDetails: Record<string, FolderDetailResponse>;
  loadingFolders: boolean;
  loadFolders: (parentId?: string) => Promise<void>;
  createFolder: (name: string, parentFolderId?: string | null) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveBookToFolder: (folderId: string, bookId: string) => Promise<void>;
  removeBookFromFolder: (folderId: string, bookId: string) => Promise<void>;
  setActiveFolderId: (folderId: string | null) => void;

  // ── Indexing & Pipeline State ──
  indexingStatus: Record<string, DocumentProcessingResponse>;
  pollingTimers: Record<string, number>;
  startIndexing: (bookId: string) => Promise<void>;
  pollIndexingStatus: (bookId: string) => Promise<void>;
  stopIndexingPoll: (bookId: string) => void;

  // ── AI Chat & Scoped RAG State ──
  chatSessions: ChatSessionResponse[];
  activeSessionId: string | null;
  activeSession: ChatSessionResponse | null;
  chatLoading: boolean;
  chatError: string | null;
  chatScope: { type: ScopeType; id?: string | null };
  loadChatSessions: () => Promise<void>;
  createSession: (
    title?: string,
    scopeType?: ScopeType,
    scopeId?: string | null
  ) => Promise<ChatSessionResponse | null>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  setChatScope: (scope: { type: ScopeType; id?: string | null }) => void;

  // ── Global Notes & Semantic Search ──
  globalNotes: GlobalNoteItem[];
  searchResults: QueryChunkResult[];
  isSearching: boolean;
  searchQuery: string;
  loadGlobalNotes: () => Promise<void>;
  performSemanticSearch: (query: string, scope?: QueryScope) => Promise<void>;
  clearSearchResults: () => void;
  setSearchQuery: (query: string) => void;
}

// Re-entrancy guard for auth initialization
let isAuthInitializing = false;
let saveDebounceTimer: any = null;

// Global auth expired listener
if (typeof window !== 'undefined') {
  window.addEventListener('cloud_pdf:auth_expired', () => {
    useAppStore.setState({
      user: null,
      needsAuth: true,
      authError: 'Your Google session expired. Please sign in again.',
    });
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  // ── Auth State Defaults ──
  user: null,
  needsAuth: false,
  loadingInit: true,
  authError: null,

  initAuth: async () => {
    if (isAuthInitializing) return;
    isAuthInitializing = true;
    set({ loadingInit: true, authError: null });

    // Handle token from URL if returned from OAuth redirect
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      const authSuccess = urlParams.get('auth_success');
      const authErrorParam = urlParams.get('auth_error');

      if (tokenParam) {
        setStoredSessionToken(tokenParam);
      }
      if (tokenParam || authSuccess || authErrorParam) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      if (authErrorParam) {
        set({ authError: `Sign-in failed: ${authErrorParam}` });
      }
    }

    try {
      const authStatus = await checkAuthSession();
      if (authStatus.authenticated && authStatus.user) {
        set({ user: authStatus.user, needsAuth: false });
        // Auto-load library & chat sessions on successful auth
        get().loadLibrary();
        get().loadFolders();
        get().loadChatSessions();
      } else {
        set({ needsAuth: true });
      }
    } catch (err) {
      set({ needsAuth: true, authError: getApiErrorMessage(err) });
    } finally {
      isAuthInitializing = false;
      set({ loadingInit: false });
    }
  },

  login: async () => {
    set({ loadingInit: true, authError: null });
    try {
      const authUrl = await getGoogleAuthUrl();
      if (typeof window !== 'undefined') {
        window.location.href = authUrl;
      }
    } catch (err) {
      set({ loadingInit: false, authError: getApiErrorMessage(err) });
    }
  },

  logout: async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear timers
      const { pollingTimers } = get();
      Object.values(pollingTimers).forEach((id) => window.clearInterval(id as any));

      set({
        user: null,
        needsAuth: true,
        books: [],
        activeBookId: null,
        activeBookBytes: null,
        chatSessions: [],
        activeSession: null,
        activeSessionId: null,
        folders: [],
        pollingTimers: {},
      });
    }
  },

  setAuthError: (authError) => set({ authError }),

  // ── UI State Defaults ──
  darkMode: (() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('theme');
    if (stored) {
      const isDark = stored === 'dark';
      if (isDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return isDark;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    return prefersDark;
  })(),
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  annotationsOpen: false,
  chatOpen: false,
  commandPaletteOpen: false,
  viewMode: 'pdf',
  activeSidebarTab: 'documents',

  setDarkMode: (enabled) => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      if (enabled) {
        root.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        root.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }
    set({ darkMode: enabled });
  },

  toggleDarkMode: () => {
    const next = !get().darkMode;
    get().setDarkMode(next);
  },

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setAnnotationsOpen: (annotationsOpen) => set({ annotationsOpen }),
  toggleAnnotations: () => set((s) => ({ annotationsOpen: !s.annotationsOpen })),

  setChatOpen: (chatOpen) => set({ chatOpen }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),

  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  setViewMode: (viewMode) => set({ viewMode }),
  setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),

  // ── Animation Studio Window Defaults ──
  activeAnimation: null,
  animationStudioOpen: false,
  setActiveAnimation: (anim) =>
    set({
      activeAnimation: anim,
      animationStudioOpen: anim !== null,
    }),
  setAnimationStudioOpen: (animationStudioOpen) => set({ animationStudioOpen }),

  // ── Books & Library State Defaults ──
  books: [],
  activeBookId: null,
  activeBookBytes: null,
  activeBookPage: 1,
  syncFileId: null,
  syncData: { books: {} },
  isSaving: false,
  loadingLibrary: false,
  loadingBookData: false,
  bookError: null,
  activeMarkdown: null,
  loadingMarkdown: false,

  setBookError: (bookError) => set({ bookError }),

  loadLibrary: async () => {
    set({ loadingLibrary: true, bookError: null });
    try {
      const data = await fetchLibrary();
      const books = data.books || [];
      const syncData = data.syncData || { books: {} };
      set({
        books,
        syncData,
        syncFileId: data.syncFileId || null,
      });

      if (books.length > 0 && !get().activeBookId) {
        const sorted = [...books].sort((a, b) => {
          const tA = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const tB = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return tB - tA;
        });
        const target = sorted[0];
        await get().selectBook(target.id);
      }
    } catch (err) {
      set({ bookError: getApiErrorMessage(err) });
    } finally {
      set({ loadingLibrary: false });
    }
  },

  selectBook: async (bookId: string) => {
    if (get().activeBookId === bookId && get().activeBookBytes) {
      return;
    }

    // Persist previous book's page before switching
    const prevBookId = get().activeBookId;
    const prevPage = get().activeBookPage;
    if (prevBookId && prevPage) {
      try {
        localStorage.setItem(`cloudreader_last_page_${prevBookId}`, String(prevPage));
      } catch (e) {}
    }

    set({
      activeBookId: bookId,
      activeBookBytes: null,
      loadingBookData: true,
      bookError: null,
      activeMarkdown: null,
    });

    try {
      const bytes = await fetchBookBytes(bookId);

      // Determine last read page with multi-tier fallback:
      // 1. syncData.books[bookId].currentPage
      // 2. books array currentPage (from backend Drive sync)
      // 3. localStorage last saved page
      // 4. default: 1
      const cached = get().syncData.books[bookId];
      const bookObj = get().books.find((b) => b.id === bookId);
      const localSaved = parseInt(
        localStorage.getItem(`cloudreader_last_page_${bookId}`) || '0',
        10
      );

      const page =
        cached?.currentPage && cached.currentPage > 0
          ? cached.currentPage
          : bookObj?.currentPage && bookObj.currentPage > 0
          ? bookObj.currentPage
          : localSaved > 0
          ? localSaved
          : 1;

      set({
        activeBookBytes: bytes,
        activeBookPage: page,
      });

      // Also auto-poll if book is currently in PROCESSING state
      get().pollIndexingStatus(bookId);
    } catch (err) {
      set({ bookError: `Failed to download file: ${getApiErrorMessage(err)}` });
    } finally {
      set({ loadingBookData: false });
    }
  },

  changePage: (page: number) => {
    const { activeBookId, updateBookStats } = get();
    set({ activeBookPage: page });
    if (activeBookId) {
      // Synchronously record last read page so immediate tab closing/switching retains it
      try {
        localStorage.setItem(`cloudreader_last_page_${activeBookId}`, String(page));
      } catch (e) {}

      updateBookStats(activeBookId, (prev) => ({
        ...prev,
        currentPage: page,
        lastReadTime: new Date().toISOString(),
      }));
    }
  },

  uploadBook: async (file: File) => {
    set({ loadingLibrary: true, bookError: null });
    try {
      const newBook = await uploadBookFile(file);
      const initialStats = emptyProgress(1);
      const nextSyncData: SyncData = {
        ...get().syncData,
        books: { ...get().syncData.books, [newBook.id]: initialStats },
      };
      set((state) => ({
        books: [newBook, ...state.books],
        syncData: nextSyncData,
      }));
      await get().selectBook(newBook.id);
    } catch (err) {
      set({ bookError: `Upload failed: ${getApiErrorMessage(err)}` });
    } finally {
      set({ loadingLibrary: false });
    }
  },

  deleteBook: async (bookId: string) => {
    const bookName =
      get().books.find((b) => b.id === bookId)?.name || 'this document';
    if (!window.confirm(`Permanently delete "${bookName}" from Drive and AI index?`)) {
      return;
    }
    set({ loadingLibrary: true });
    try {
      await apiDeleteBookFile(bookId);
      const nextSync = { ...get().syncData };
      delete nextSync.books[bookId];

      set((state) => ({
        books: state.books.filter((b) => b.id !== bookId),
        syncData: nextSync,
        activeBookId: state.activeBookId === bookId ? null : state.activeBookId,
        activeBookBytes:
          state.activeBookId === bookId ? null : state.activeBookBytes,
      }));
    } catch (err) {
      set({ bookError: `Delete failed: ${getApiErrorMessage(err)}` });
    } finally {
      set({ loadingLibrary: false });
    }
  },

  updateBookStats: async (
    bookId: string,
    updater: (prev: BookProgress) => BookProgress
  ) => {
    const current = get().syncData.books[bookId] || emptyProgress(get().activeBookPage);
    const next = updater({ ...current });
    const updatedSyncData: SyncData = {
      ...get().syncData,
      books: { ...get().syncData.books, [bookId]: next },
    };
    set({ syncData: updatedSyncData });

    // Debounce network sync so continuous scrolling does not storm the backend or trigger rerender cascades
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(async () => {
      set({ isSaving: true });
      try {
        await updateBookProgress(bookId, next);
      } catch (err) {
        console.error('Annotation sync failed:', err);
      } finally {
        set({ isSaving: false });
      }
    }, 600);
  },

  loadBookMarkdown: async (bookId: string) => {
    set({ loadingMarkdown: true });
    try {
      const res = await fetchBookMarkdown(bookId);
      set({ activeMarkdown: res.markdown });
    } catch (err) {
      console.error('Failed to load markdown for book:', err);
      set({ activeMarkdown: null });
    } finally {
      set({ loadingMarkdown: false });
    }
  },

  // ── Folders & Directories State Defaults ──
  folders: [],
  activeFolderId: null,
  folderDetails: {},
  loadingFolders: false,

  setActiveFolderId: (activeFolderId) => set({ activeFolderId }),

  loadFolders: async (parentId?: string) => {
    set({ loadingFolders: true });
    try {
      const folders = await fetchDirectories(parentId);
      set({ folders });
    } catch (err) {
      console.error('Failed to load folders:', err);
    } finally {
      set({ loadingFolders: false });
    }
  },

  createFolder: async (name: string, parentFolderId?: string | null) => {
    try {
      const newFolder = await apiCreateDirectory({
        name,
        parent_folder_id: parentFolderId,
      });
      set((state) => ({ folders: [newFolder, ...state.folders] }));
    } catch (err) {
      alert(`Create folder failed: ${getApiErrorMessage(err)}`);
    }
  },

  renameFolder: async (folderId: string, name: string) => {
    try {
      const updated = await apiUpdateDirectory(folderId, { name });
      set((state) => ({
        folders: state.folders.map((f) => (f.id === folderId ? updated : f)),
      }));
    } catch (err) {
      alert(`Rename folder failed: ${getApiErrorMessage(err)}`);
    }
  },

  deleteFolder: async (folderId: string) => {
    if (!window.confirm('Delete this folder from Google Drive?')) return;
    try {
      await apiDeleteDirectory(folderId);
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== folderId),
        activeFolderId:
          state.activeFolderId === folderId ? null : state.activeFolderId,
      }));
    } catch (err) {
      alert(`Delete folder failed: ${getApiErrorMessage(err)}`);
    }
  },

  moveBookToFolder: async (folderId: string, bookId: string) => {
    try {
      await moveBookToDirectory(folderId, bookId);
      set((state) => ({
        books: state.books.map((b) =>
          b.id === bookId ? { ...b, directoryId: folderId } : b
        ),
      }));
      // refresh folders list to update book_count
      get().loadFolders();
    } catch (err) {
      alert(`Move document failed: ${getApiErrorMessage(err)}`);
    }
  },

  removeBookFromFolder: async (folderId: string, bookId: string) => {
    try {
      await removeBookFromDirectory(folderId, bookId);
      set((state) => ({
        books: state.books.map((b) =>
          b.id === bookId ? { ...b, directoryId: null } : b
        ),
      }));
      get().loadFolders();
    } catch (err) {
      alert(`Remove from folder failed: ${getApiErrorMessage(err)}`);
    }
  },

  // ── Indexing & Pipeline State Defaults ──
  indexingStatus: {},
  pollingTimers: {},

  startIndexing: async (bookId: string) => {
    try {
      // Optimistic status update
      set((state) => ({
        indexingStatus: {
          ...state.indexingStatus,
          [bookId]: {
            id: bookId,
            document_id: bookId,
            status: 'PROCESSING',
            total_pages: 0,
            total_chunks: 0,
            processed_chunks: 0,
          },
        },
      }));

      await triggerBookIndex(bookId);
      get().pollIndexingStatus(bookId);
    } catch (err) {
      alert(`Could not start indexing: ${getApiErrorMessage(err)}`);
      set((state) => ({
        indexingStatus: {
          ...state.indexingStatus,
          [bookId]: {
            id: bookId,
            document_id: bookId,
            status: 'FAILED',
            total_pages: 0,
            total_chunks: 0,
            processed_chunks: 0,
            error_message: getApiErrorMessage(err),
          },
        },
      }));
    }
  },

  pollIndexingStatus: async (bookId: string) => {
    // Clear any existing poll timer for this book
    get().stopIndexingPoll(bookId);

    const check = async () => {
      try {
        const status = await fetchBookIndexStatus(bookId);
        set((state) => ({
          indexingStatus: {
            ...state.indexingStatus,
            [bookId]: status,
          },
        }));

        // Stop polling once finished or failed
        if (status.status === 'INDEXED' || status.status === 'FAILED') {
          get().stopIndexingPoll(bookId);
        }
      } catch (err) {
        // If 404 or not indexed yet, don't crash
        get().stopIndexingPoll(bookId);
      }
    };

    // Initial check
    await check();

    const currentStatus = get().indexingStatus[bookId];
    if (currentStatus?.status === 'PROCESSING' || currentStatus?.status === 'UPLOADED') {
      const intervalId = window.setInterval(check, 2500);
      set((state) => ({
        pollingTimers: {
          ...state.pollingTimers,
          [bookId]: intervalId,
        },
      }));
    }
  },

  stopIndexingPoll: (bookId: string) => {
    const existing = get().pollingTimers[bookId];
    if (existing) {
      window.clearInterval(existing);
      set((state) => {
        const next = { ...state.pollingTimers };
        delete next[bookId];
        return { pollingTimers: next };
      });
    }
  },

  // ── AI Chat & Scoped RAG State Defaults ──
  chatSessions: [],
  activeSessionId: null,
  activeSession: null,
  chatLoading: false,
  chatError: null,
  chatScope: { type: 'ALL', id: null },

  setChatScope: (chatScope) => set({ chatScope }),

  loadChatSessions: async () => {
    try {
      const sessions = await fetchChatSessions();
      set({ chatSessions: sessions });
    } catch (err) {
      console.error('Failed to fetch chat sessions:', err);
    }
  },

  createSession: async (
    title = 'New Discussion',
    scopeType?: ScopeType,
    scopeId?: string | null
  ) => {
    const activeBookId = get().activeBookId;
    const finalScopeType = scopeType || (activeBookId ? 'DOCUMENT' : 'ALL');
    const finalScopeId =
      scopeId !== undefined ? scopeId : finalScopeType === 'DOCUMENT' ? activeBookId : null;

    try {
      const created = await apiCreateChatSession({
        title,
        scope_type: finalScopeType,
        scope_id: finalScopeId,
      });

      set((state) => ({
        chatSessions: [created, ...state.chatSessions],
        activeSession: created,
        activeSessionId: created.id,
        chatScope: { type: created.scope_type, id: created.scope_id },
      }));

      return created;
    } catch (err) {
      alert(`Failed to create chat session: ${getApiErrorMessage(err)}`);
      return null;
    }
  },

  selectSession: async (sessionId: string) => {
    set({ activeSessionId: sessionId, chatLoading: true, chatError: null });
    try {
      const session = await fetchChatSession(sessionId);
      set({
        activeSession: session,
        chatScope: { type: session.scope_type, id: session.scope_id },
      });
    } catch (err) {
      set({ chatError: getApiErrorMessage(err) });
    } finally {
      set({ chatLoading: false });
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await apiDeleteChatSession(sessionId);
      set((state) => {
        const filtered = state.chatSessions.filter((s) => s.id !== sessionId);
        const nextActive =
          state.activeSessionId === sessionId
            ? filtered.length > 0
              ? filtered[0].id
              : null
            : state.activeSessionId;
        return {
          chatSessions: filtered,
          activeSessionId: nextActive,
          activeSession: filtered.find((s) => s.id === nextActive) || null,
        };
      });
    } catch (err) {
      alert(`Delete session failed: ${getApiErrorMessage(err)}`);
    }
  },

  renameSession: async (sessionId: string, title: string) => {
    try {
      const updated = await updateChatSession(sessionId, title);
      set((state) => ({
        chatSessions: state.chatSessions.map((s) =>
          s.id === sessionId ? { ...s, title: updated.title } : s
        ),
        activeSession:
          state.activeSession?.id === sessionId
            ? { ...state.activeSession, title: updated.title }
            : state.activeSession,
      }));
    } catch (err) {
      alert(`Rename session failed: ${getApiErrorMessage(err)}`);
    }
  },

  sendMessage: async (content: string) => {
    const { activeSessionId, activeBookId, createSession } = get();
    let sessionId = activeSessionId;

    // If no active session, automatically create one scoped to current document or ALL
    if (!sessionId) {
      const newSession = await createSession(
        content.slice(0, 30) + '...',
        activeBookId ? 'DOCUMENT' : 'ALL',
        activeBookId
      );
      if (!newSession) return;
      sessionId = newSession.id;
    }

    set({ chatLoading: true, chatError: null });

    // Optimistically append user message
    const tempUserMsgId = `temp-user-${Date.now()}`;
    const tempUserMsg: ChatMessageResponse = {
      id: tempUserMsgId,
      session_id: sessionId,
      role: 'USER',
      content,
      created_at: new Date().toISOString(),
    };

    const tempAssistantMsgId = `temp-ast-${Date.now()}`;
    const tempAssistantMsg: ChatMessageResponse = {
      id: tempAssistantMsgId,
      session_id: sessionId,
      role: 'ASSISTANT',
      content: '',
      created_at: new Date().toISOString(),
    };

    set((state) => {
      if (!state.activeSession) return state;
      return {
        activeSession: {
          ...state.activeSession,
          messages: [...(state.activeSession.messages || []), tempUserMsg, tempAssistantMsg],
        },
      };
    });

    try {
      const stream = apiSendChatMessageStream(sessionId, content);
      for await (const payload of stream) {
        if (payload.chunk) {
          set((state) => {
            if (!state.activeSession) return state;
            const msgs = state.activeSession.messages || [];
            const updatedMsgs = msgs.map((m) =>
              m.id === tempAssistantMsgId ? { ...m, content: m.content + payload.chunk } : m
            );
            return {
              activeSession: {
                ...state.activeSession,
                messages: updatedMsgs,
              },
            };
          });
        } else if (payload.assistant_message) {
          // Final payload
          set((state) => {
            if (!state.activeSession) return state;
            const msgs = state.activeSession.messages || [];
            const filtered = msgs.filter(
              (m) => m.id !== tempAssistantMsgId && m.id !== tempUserMsgId
            );
            return {
              activeSession: {
                ...state.activeSession,
                messages: [
                  ...filtered,
                  payload.user_message || tempUserMsg,
                  {
                    ...payload.assistant_message,
                    sources: payload.sources,
                    generated_pdf: payload.generated_pdf,
                  },
                ],
              },
            };
          });
        } else if (payload.error) {
          throw new Error(payload.error);
        }
      }
    } catch (err) {
      set({ chatError: getApiErrorMessage(err) });
    } finally {
      set({ chatLoading: false });
    }
  },

  // ── Global Notes & Semantic Search Defaults ──
  globalNotes: [],
  searchResults: [],
  isSearching: false,
  searchQuery: '',

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  loadGlobalNotes: async () => {
    try {
      const notes = await fetchGlobalNotes();
      set({ globalNotes: notes });
    } catch (err) {
      console.error('Failed to load global notes:', err);
    }
  },

  performSemanticSearch: async (query: string, scope?: QueryScope) => {
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }

    set({ isSearching: true, searchQuery: query });
    try {
      const finalScope: QueryScope = scope || {
        type: get().activeBookId ? 'DOCUMENT' : 'ALL',
        id: get().activeBookId,
      };

      const res = await querySemanticSearch({
        query,
        scope: finalScope,
        n_results: 8,
      });

      set({ searchResults: res.results || [] });
    } catch (err) {
      console.error('Semantic search failed:', err);
      set({ searchResults: [] });
    } finally {
      set({ isSearching: false });
    }
  },

  clearSearchResults: () => set({ searchResults: [], searchQuery: '' }),
}));
