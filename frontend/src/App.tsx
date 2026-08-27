import { useEffect, useState, useRef, useCallback } from 'react';
import {
  checkAuthSession,
  getGoogleAuthUrl,
  logoutUser,
  fetchLibrary,
  fetchBookBytes,
  uploadBookFile,
  deleteBookFile,
  updateBookProgress,
  setStoredSessionToken,
} from './lib/api';
import {
  Book,
  SyncData,
  Highlight,
  StickyNote,
  BookProgress,
  InkStroke,
  ShapeAnnotation,
  TextBox,
  User,
} from './types';
import DocumentSidebar from './components/DocumentSidebar';
import PDFReader from './components/PDFReader';
import AnnotationPanel from './components/AnnotationPanel';
import {
  BookOpen,
  ShieldAlert,
  Menu,
  Tag,
  RefreshCw,
  CheckCircle,
  Sparkles,
  Flame,
  LogOut,
} from 'lucide-react';

// ── Default empty progress ──────────────────────────────────────────────────

function emptyProgress(page = 1): BookProgress {
  return {
    currentPage: page,
    totalPages: 1,
    lastReadTime: new Date().toISOString(),
    highlights: [],
    notes: [],
    inkStrokes: [],
    shapes: [],
    textBoxes: [],
  };
}

// ── ID generator ────────────────────────────────────────────────────────────

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [loadingInit, setLoadingInit] = useState<boolean>(true);

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookBytes, setActiveBookBytes] = useState<ArrayBuffer | null>(null);
  const [activeBookPage, setActiveBookPage] = useState<number>(1);

  const [syncFileId, setSyncFileId] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<SyncData>({ books: {} });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // ── Responsive initial sidebars ──
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [annotationsOpen, setAnnotationsOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : false
  );
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(false);
  const [loadingBookData, setLoadingBookData] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Auth init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Check query params for OAuth redirect feedback
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      const authSuccess = urlParams.get('auth_success');
      const authError = urlParams.get('auth_error');

      if (tokenParam) {
        setStoredSessionToken(tokenParam);
      }
      if (tokenParam || authSuccess || authError) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      if (authError) {
        setActionError(`Sign-in failed: ${authError}`);
      }

      try {
        const authStatus = await checkAuthSession();
        if (authStatus.authenticated && authStatus.user) {
          setUser(authStatus.user);
          setNeedsAuth(false);
          await loadFullLibraryData();
        } else {
          setNeedsAuth(true);
          setLoadingInit(false);
        }
      } catch (err: any) {
        console.error('Auth initialization check failed:', err);
        setNeedsAuth(true);
        setLoadingInit(false);
      }
    };
    init();
  }, []);

  // ── Window resize responsive handler ───────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        // Mobile screen adjustments if needed
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Dark mode class ───────────────────────────────────────────────────────
  useEffect(() => {
    const root = window.document.documentElement;
    darkMode ? root.classList.add('dark') : root.classList.remove('dark');
  }, [darkMode]);

  // ── Library load ──────────────────────────────────────────────────────────
  const loadFullLibraryData = async () => {
    setLoadingLibrary(true);
    setActionError(null);
    try {
      const data = await fetchLibrary();
      setBooks(data.books || []);
      setSyncData(data.syncData || { books: {} });
      if (data.syncFileId) {
        setSyncFileId(data.syncFileId);
      }

      if (data.books && data.books.length > 0) {
        const sorted = [...data.books].sort((a, b) => {
          const tA = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const tB = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return tB - tA;
        });
        const target = sorted[0];
        setActiveBookId(target.id);
        setActiveBookPage(target.currentPage || 1);
        await selectAndLoadBookBytes(target.id, data.syncData);
      }
    } catch (err: any) {
      console.error('Library loading error:', err);
      setActionError(err.message || 'Error loading Google Drive components.');
    } finally {
      setLoadingLibrary(false);
      setLoadingInit(false);
    }
  };

  const selectAndLoadBookBytes = async (bookId: string, customSyncData?: SyncData) => {
    setLoadingBookData(true);
    setActionError(null);
    try {
      const bytes = await fetchBookBytes(bookId);
      setActiveBookBytes(bytes);
      const activeSync = customSyncData || syncData;
      const cached = activeSync.books[bookId];
      setActiveBookPage(cached?.currentPage || 1);
    } catch (err: any) {
      console.error('Error fetching book bytes:', err);
      setActionError('Could not download file. Click retry to refresh.');
    } finally {
      setLoadingBookData(false);
    }
  };

  // ── Sync refs & background syncer ─────────────────────────────────────────
  const syncDataRef = useRef<SyncData>(syncData);
  syncDataRef.current = syncData;

  const syncTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const syncBookToBackend = useCallback(async (bookId: string) => {
    const dataToSync = syncDataRef.current.books[bookId];
    if (!dataToSync) return;
    setIsSaving(true);
    try {
      await updateBookProgress(bookId, dataToSync);
    } catch (err) {
      console.error('Background sync failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Flush pending background syncs on unmount
  useEffect(() => {
    return () => {
      Object.entries(syncTimersRef.current).forEach(([bookId, timer]) => {
        clearTimeout(timer);
        const dataToSync = syncDataRef.current.books[bookId];
        if (dataToSync) {
          updateBookProgress(bookId, dataToSync).catch(console.error);
        }
      });
    };
  }, []);

  // ── Book actions ──────────────────────────────────────────────────────────
  const handleSelectBook = async (bookId: string) => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    if (bookId === activeBookId) return;

    // Flush any pending sync for the currently active book before switching
    if (activeBookId && syncTimersRef.current[activeBookId]) {
      clearTimeout(syncTimersRef.current[activeBookId]);
      delete syncTimersRef.current[activeBookId];
      syncBookToBackend(activeBookId);
    }

    setActiveBookId(bookId);
    setActiveBookBytes(null);
    await selectAndLoadBookBytes(bookId);
  };

  const handleUploadBook = async (file: File) => {
    const newBook = await uploadBookFile(file);
    const initialStats = emptyProgress();
    const nextSyncData: SyncData = {
      ...syncDataRef.current,
      books: { ...syncDataRef.current.books, [newBook.id]: initialStats },
    };
    syncDataRef.current = nextSyncData;
    setSyncData(nextSyncData);
    setBooks((prev) => [newBook, ...prev]);
    setActiveBookId(newBook.id);
    setActiveBookPage(1);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    await selectAndLoadBookBytes(newBook.id, nextSyncData);
  };

  const handleDeleteBook = async (bookId: string) => {
    const title = books.find((b) => b.id === bookId)?.name || 'this book';
    if (!window.confirm(`Permanently delete "${title}" from Google Drive?`)) return;
    setLoadingLibrary(true);
    try {
      if (syncTimersRef.current[bookId]) {
        clearTimeout(syncTimersRef.current[bookId]);
        delete syncTimersRef.current[bookId];
      }
      await deleteBookFile(bookId);
      const nextSync = { ...syncDataRef.current };
      delete nextSync.books[bookId];
      syncDataRef.current = nextSync;
      setSyncData(nextSync);
      if (activeBookId === bookId) {
        setActiveBookId(null);
        setActiveBookBytes(null);
      }
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err: any) {
      setActionError('Error deleting document: ' + err.message);
    } finally {
      setLoadingLibrary(false);
    }
  };

  // ── Generic annotation & stats updater with instant UI + debounced sync ──
  const updateBookStats = (
    bookId: string,
    updater: (prev: BookProgress) => BookProgress,
    debounceMs: number = 600
  ) => {
    const current = syncDataRef.current.books[bookId] || emptyProgress(activeBookPage);
    const next = updater({ ...current });
    const updated: SyncData = {
      ...syncDataRef.current,
      books: { ...syncDataRef.current.books, [bookId]: next },
    };
    syncDataRef.current = updated;
    setSyncData(updated);

    // Synchronously update books list so progress bar / percentages never lag or jump out of order
    if (next.currentPage !== undefined || next.totalPages !== undefined) {
      setBooks((prev) =>
        prev.map((b) =>
          b.id === bookId
            ? {
                ...b,
                currentPage: next.currentPage ?? b.currentPage,
                totalPages: next.totalPages ?? b.totalPages,
                lastReadTime: next.lastReadTime ?? b.lastReadTime,
              }
            : b
        )
      );
    }

    // Schedule or reset debounced background sync
    if (syncTimersRef.current[bookId]) {
      clearTimeout(syncTimersRef.current[bookId]);
    }

    if (debounceMs <= 0) {
      syncBookToBackend(bookId);
    } else {
      syncTimersRef.current[bookId] = setTimeout(() => {
        syncBookToBackend(bookId);
        delete syncTimersRef.current[bookId];
      }, debounceMs);
    }
  };

  // ── Highlight handlers ────────────────────────────────────────────────────
  const handleAddHighlight = (hData: Omit<Highlight, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newH: Highlight = { ...hData, id: uid('hl'), createdAt: new Date().toISOString() };
    updateBookStats(activeBookId, (p) => ({
      ...p,
      highlights: [...p.highlights, newH],
      lastReadTime: new Date().toISOString(),
    }), 400);
  };

  const handleDeleteHighlight = (id: string) => {
    if (!activeBookId) return;
    updateBookStats(activeBookId, (p) => ({
      ...p,
      highlights: p.highlights.filter((h) => h.id !== id),
    }), 400);
  };

  // ── Note handlers ─────────────────────────────────────────────────────────
  const handleAddNote = (nData: Omit<StickyNote, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newN: StickyNote = { ...nData, id: uid('note'), createdAt: new Date().toISOString() };
    updateBookStats(activeBookId, (p) => ({
      ...p,
      notes: [...p.notes, newN],
      lastReadTime: new Date().toISOString(),
    }), 400);
  };

  const handleDeleteNote = (id: string) => {
    if (!activeBookId) return;
    updateBookStats(activeBookId, (p) => ({
      ...p,
      notes: p.notes.filter((n) => n.id !== id),
    }), 400);
  };

  // ── Ink stroke handlers ───────────────────────────────────────────────────
  const handleAddInkStroke = (sData: Omit<InkStroke, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newS: InkStroke = { ...sData, id: uid('ink'), createdAt: new Date().toISOString() };
    updateBookStats(activeBookId, (p) => ({
      ...p,
      inkStrokes: [...(p.inkStrokes || []), newS],
      lastReadTime: new Date().toISOString(),
    }), 400);
  };

  const handleDeleteInkStroke = (id: string) => {
    if (!activeBookId) return;
    updateBookStats(activeBookId, (p) => ({
      ...p,
      inkStrokes: (p.inkStrokes || []).filter((s) => s.id !== id),
    }), 400);
  };

  // ── Shape handlers ────────────────────────────────────────────────────────
  const handleAddShape = (sData: Omit<ShapeAnnotation, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newS: ShapeAnnotation = { ...sData, id: uid('shape'), createdAt: new Date().toISOString() };
    updateBookStats(activeBookId, (p) => ({
      ...p,
      shapes: [...(p.shapes || []), newS],
      lastReadTime: new Date().toISOString(),
    }), 400);
  };

  const handleDeleteShape = (id: string) => {
    if (!activeBookId) return;
    updateBookStats(activeBookId, (p) => ({
      ...p,
      shapes: (p.shapes || []).filter((s) => s.id !== id),
    }), 400);
  };

  // ── Text box handlers ─────────────────────────────────────────────────────
  const handleAddTextBox = (tData: Omit<TextBox, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newT: TextBox = { ...tData, id: uid('tb'), createdAt: new Date().toISOString() };
    updateBookStats(activeBookId, (p) => ({
      ...p,
      textBoxes: [...(p.textBoxes || []), newT],
      lastReadTime: new Date().toISOString(),
    }), 400);
  };

  const handleDeleteTextBox = (id: string) => {
    if (!activeBookId) return;
    updateBookStats(activeBookId, (p) => ({
      ...p,
      textBoxes: (p.textBoxes || []).filter((t) => t.id !== id),
    }), 400);
  };

  // ── Page change (instant UI + 1s debounce to prevent API flooding) ────────
  const handleChangePage = (pageNumber: number) => {
    if (window.innerWidth < 1024) {
      setAnnotationsOpen(false);
    }
    if (!activeBookId) return;
    setActiveBookPage(pageNumber);
    updateBookStats(
      activeBookId,
      (p) => ({
        ...p,
        currentPage: pageNumber,
        lastReadTime: new Date().toISOString(),
      }),
      1000 // 1 second debounce while scrolling
    );
  };

  const handleDocumentLoad = (totalPages: number) => {
    if (!activeBookId) return;
    setBooks((prev) =>
      prev.map((b) =>
        b.id === activeBookId ? { ...b, totalPages } : b
      )
    );
    const current = syncDataRef.current.books[activeBookId];
    if (!current || current.totalPages !== totalPages) {
      updateBookStats(
        activeBookId,
        (p) => ({
          ...p,
          totalPages,
        }),
        1000
      );
    }
  };

  // ── Auth actions ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoadingInit(true);
    setActionError(null);
    try {
      const authUrl = await getGoogleAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      const msg = err.message || String(err);
      setActionError(`Sign-in failed: ${msg}`);
      setLoadingInit(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Disconnect your Google session?')) return;
    await logoutUser();
    setUser(null);
    setNeedsAuth(true);
    setBooks([]);
    setActiveBookId(null);
    setActiveBookBytes(null);
    setSyncData({ books: {} });
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeStats = activeBookId ? syncData.books[activeBookId] : null;
  const currentHighlights = activeStats?.highlights || [];
  const currentNotes = activeStats?.notes || [];
  const currentInkStrokes = activeStats?.inkStrokes || [];
  const currentShapes = activeStats?.shapes || [];
  const currentTextBoxes = activeStats?.textBoxes || [];

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center gap-4 bg-[var(--color-background)] text-[var(--color-on-background)]">
        <div className="flex items-center gap-3 mb-2 animate-pulse">
          <div className="p-2.5 rounded-xl bg-[#fa5d19]/10 text-[#fa5d19]">
            <Flame size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cloud PDF</h1>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-[#fa5d19] border-t-transparent" />
        <p className="text-xs font-mono text-zinc-500 animate-pulse">Synchronizing workspace…</p>
      </div>
    );
  }

  // ── Sign-in screen ────────────────────────────────────────────────────────
  if (needsAuth) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-on-background)] relative overflow-hidden">
        {/* Subtle heat ambient glow in corner */}
        <div className="absolute -top-40 -right-40 w-72 sm:w-96 h-72 sm:h-96 bg-[#fa5d19]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-72 sm:w-96 h-72 sm:h-96 bg-[#9061ff]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="absolute top-4 right-4 sm:top-8 sm:right-8">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="btn-secondary text-xs"
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>

        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border text-center card-surface backdrop-blur-sm z-10">
          <div className="inline-flex p-3 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
            <Flame size={36} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">Cloud PDF Sync Reader</h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Read, annotate, and sync highlights and drawings across all devices with Google Drive.
          </p>

          <div className="text-left space-y-3 mb-8 px-1 sm:px-2">
            {[
              ['Google Drive Integration', 'Stores books and annotations directly on your private Drive.'],
              ['Rich Heat-Driven Annotation', 'Freehand ink, precision shapes, highlighters, sticky notes & text.'],
              ['Mobile & Tablet Ready', 'Optimized for touchscreens, continuous scrolling & dark mode.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start gap-3 text-xs leading-relaxed">
                <span className="p-1 rounded-md bg-[#fa5d19]/10 text-[#fa5d19] font-bold">✓</span>
                <div>
                  <strong className="block font-medium text-[var(--color-on-surface)]">{title}</strong>
                  <span className="text-zinc-500 dark:text-zinc-400">{desc}</span>
                </div>
              </div>
            ))}
          </div>

          {actionError && (
            <div className="mb-4 p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-500 flex items-center gap-2">
              <ShieldAlert size={14} className="shrink-0" />
              <p className="text-left">{actionError}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full btn-primary py-3 px-4 text-sm font-semibold shadow-md rounded-xl"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 bg-white p-0.5 rounded-full">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>Sync Google Drive Account</span>
          </button>

          <p className="text-[10px] text-zinc-400 mt-4 font-mono">
            Requires minimum Google Drive API scopes to sync books folder.
          </p>
        </div>
      </div>
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex overflow-hidden transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-on-background)] relative">

      {/* ── Document sidebar: Slide-over drawer on mobile/tablet, docked on desktop ── */}
      {/* Mobile / Tablet Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* Sidebar container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:static md:z-auto transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <DocumentSidebar
          books={books}
          activeBookId={activeBookId}
          onSelectBook={handleSelectBook}
          onUploadBook={handleUploadBook}
          onDeleteBook={handleDeleteBook}
          user={user}
          onLogout={handleLogout}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* ── Main reading area ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">

        {/* Top Navigation Bar */}
        <div className="h-12 sm:h-14 px-3 sm:px-6 flex items-center justify-between border-b border-[var(--color-outline-variant)] bg-[var(--color-surface)]/90 backdrop-blur-sm shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`btn-secondary !h-8 !px-2.5 !py-1 ${
                sidebarOpen ? '!bg-[#fa5d19]/10 !text-[#fa5d19] !border-[#fa5d19]/30' : ''
              }`}
              title="Toggle library sidebar"
            >
              <Menu size={16} />
              <span className="hidden sm:inline text-xs">Library</span>
            </button>

            {/* Document Title Pill */}
            {activeBookId && (
              <span className="text-[11px] sm:text-xs font-medium max-w-[120px] sm:max-w-[200px] md:max-w-xs truncate bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] px-2.5 py-1 rounded-full border border-[var(--color-outline-variant)]">
                📄 {books.find((b) => b.id === activeBookId)?.name || 'PDF'}
              </span>
            )}

            <div className="hidden sm:flex items-center gap-1.5">
              {isSaving ? (
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <RefreshCw size={12} className="animate-spin text-[#fa5d19]" />
                  <span className="text-[10px] font-mono">Syncing…</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-zinc-500">
                  <CheckCircle size={12} className="text-emerald-500" />
                  <span className="text-[10px] font-mono">Synced</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {isSaving && (
              <RefreshCw size={13} className="animate-spin text-[#fa5d19] sm:hidden" />
            )}

            <button
              onClick={() => setAnnotationsOpen(!annotationsOpen)}
              className={`btn-secondary !h-8 !px-2.5 sm:!px-3 !py-1 text-xs ${
                annotationsOpen
                  ? '!bg-[#fa5d19]/10 !text-[#fa5d19] !border-[#fa5d19]/30 font-semibold'
                  : ''
              }`}
              title="Toggle annotations panel"
            >
              <Tag size={14} />
              <span className="hidden sm:inline">Annotations</span>
            </button>

            {!sidebarOpen && user && (
              <button
                onClick={handleLogout}
                className="btn-secondary !h-8 !w-8 !p-0 text-zinc-400 hover:text-red-500"
                title="Disconnect Google Sync / Logout"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Content Viewport */}
        <div className="flex-1 min-h-0 relative bg-[var(--color-surface-container-lowest)]">
          {actionError && (
            <div className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-50 p-3 sm:p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-500 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert size={15} className="shrink-0" />
                <p className="font-medium truncate">{actionError}</p>
              </div>
              <button
                onClick={() => loadFullLibraryData()}
                className="px-2.5 py-1 text-[11px] font-semibold bg-red-500 text-white rounded-lg shadow-xs hover:bg-red-600 transition-colors shrink-0 ml-2"
              >
                Retry
              </button>
            </div>
          )}

          {loadingBookData && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]/60 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#fa5d19] border-t-transparent" />
              <p className="text-xs font-mono font-medium text-zinc-500 animate-pulse">Downloading document…</p>
            </div>
          )}

          {activeBookBytes ? (
            <div className="w-full h-full p-1.5 sm:p-3 md:p-4 lg:p-5 overflow-hidden">
              <PDFReader
                pdfData={activeBookBytes}
                currentPage={activeBookPage}
                onChangePage={handleChangePage}
                highlights={currentHighlights}
                notes={currentNotes}
                inkStrokes={currentInkStrokes}
                shapes={currentShapes}
                textBoxes={currentTextBoxes}
                onAddHighlight={handleAddHighlight}
                onDeleteHighlight={handleDeleteHighlight}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
                onAddInkStroke={handleAddInkStroke}
                onDeleteInkStroke={handleDeleteInkStroke}
                onAddShape={handleAddShape}
                onDeleteShape={handleDeleteShape}
                onAddTextBox={handleAddTextBox}
                onDeleteTextBox={handleDeleteTextBox}
                onDocumentLoad={handleDocumentLoad}
                darkMode={darkMode}
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
                <BookOpen size={36} />
              </div>
              <h3 className="text-base font-semibold mb-1.5 text-[var(--color-on-surface)]">Welcome to Cloud PDF</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
                Your bookshelf is empty! Tap <strong>Library</strong> to upload a PDF or select an existing document.
              </p>
              <button
                onClick={() => setSidebarOpen(true)}
                className="btn-primary text-xs mb-4"
              >
                Open Library
              </button>
              <div className="p-3 bg-[#fa5d19]/5 rounded-xl border border-[#fa5d19]/15 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <Sparkles size={13} className="text-[#fa5d19] inline mr-1" />
                All annotations — ink, shapes, highlights, and notes — sync seamlessly with your Google Drive.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Annotation panel: Slide-over drawer on mobile/tablet, docked on desktop ── */}
      {/* Mobile Backdrop Overlay for Annotations */}
      {annotationsOpen && activeBookId && (
        <div
          onClick={() => setAnnotationsOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* Annotation panel container */}
      {activeBookId && (
        <div
          className={`fixed inset-y-0 right-0 z-50 md:static md:z-auto transition-transform duration-300 ease-in-out ${
            annotationsOpen ? 'translate-x-0' : 'translate-x-full md:hidden'
          }`}
        >
          <AnnotationPanel
            highlights={currentHighlights}
            notes={currentNotes}
            inkStrokes={currentInkStrokes}
            shapes={currentShapes}
            textBoxes={currentTextBoxes}
            onPageSelect={handleChangePage}
            onDeleteHighlight={handleDeleteHighlight}
            onDeleteNote={handleDeleteNote}
            onDeleteInkStroke={handleDeleteInkStroke}
            onDeleteShape={handleDeleteShape}
            onDeleteTextBox={handleDeleteTextBox}
            darkMode={darkMode}
            onClose={() => setAnnotationsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
