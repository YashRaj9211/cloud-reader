import { useEffect, useState } from 'react';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken
} from './lib/auth';
import {
  findSyncFile,
  downloadSyncData,
  createSyncFile,
  updateSyncFile,
  listPdfsInDrive,
  downloadPdfBytes,
  uploadFileToDrive,
  deleteFileFromDrive
} from './lib/drive';
import {
  Book,
  SyncData,
  Highlight,
  StickyNote,
  BookProgress,
  InkStroke,
  ShapeAnnotation,
  TextBox,
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
  const [user, setUser] = useState<any>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [loadingInit, setLoadingInit] = useState<boolean>(true);

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookBytes, setActiveBookBytes] = useState<ArrayBuffer | null>(null);
  const [activeBookPage, setActiveBookPage] = useState<number>(1);

  const [syncFileId, setSyncFileId] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<SyncData>({ books: {} });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [annotationsOpen, setAnnotationsOpen] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(false);
  const [loadingBookData, setLoadingBookData] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Auth init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setNeedsAuth(false);
        loadFullLibraryData(token);
      },
      () => {
        setNeedsAuth(true);
        setLoadingInit(false);
      }
    );
    return () => unsub();
  }, []);

  // ── Dark mode class ───────────────────────────────────────────────────────
  useEffect(() => {
    const root = window.document.documentElement;
    darkMode ? root.classList.add('dark') : root.classList.remove('dark');
  }, [darkMode]);

  // ── Library load ──────────────────────────────────────────────────────────
  const loadFullLibraryData = async (token: string) => {
    setLoadingLibrary(true);
    setActionError(null);
    try {
      let syncId = await findSyncFile(token);
      let currentSyncData: SyncData = { books: {} };

      if (syncId) {
        setSyncFileId(syncId);
        currentSyncData = await downloadSyncData(token, syncId);
      } else {
        const newId = await createSyncFile(token, { books: {} });
        setSyncFileId(newId);
        syncId = newId;
      }
      setSyncData(currentSyncData);

      const pdfFiles = await listPdfsInDrive(token);
      const loadedBooks: Book[] = pdfFiles.map((pf: any) => {
        const stats = currentSyncData.books[pf.id] || emptyProgress();
        return {
          id: pf.id,
          name: pf.name,
          size: pf.size ? parseInt(pf.size) : undefined,
          createdTime: pf.createdTime,
          currentPage: stats.currentPage,
          totalPages: stats.totalPages,
          lastReadTime: stats.lastReadTime,
        };
      });
      setBooks(loadedBooks);

      if (loadedBooks.length > 0) {
        const sorted = [...loadedBooks].sort((a, b) => {
          const tA = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const tB = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return tB - tA;
        });
        const target = sorted[0];
        setActiveBookId(target.id);
        setActiveBookPage(target.currentPage);
        await selectAndLoadBookBytes(token, target.id);
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Error loading Google Drive components.');
    } finally {
      setLoadingLibrary(false);
      setLoadingInit(false);
    }
  };

  const selectAndLoadBookBytes = async (token: string, bookId: string) => {
    setLoadingBookData(true);
    setActionError(null);
    try {
      const bytes = await downloadPdfBytes(token, bookId);
      setActiveBookBytes(bytes);
      const cached = syncData.books[bookId];
      setActiveBookPage(cached?.currentPage || 1);
    } catch (err: any) {
      console.error(err);
      setActionError('Could not download file. Click retry to refresh.');
    } finally {
      setLoadingBookData(false);
    }
  };

  // ── Book actions ──────────────────────────────────────────────────────────
  const handleSelectBook = async (bookId: string) => {
    if (bookId === activeBookId) return;
    const token = getAccessToken();
    if (!token) return;
    setActiveBookId(bookId);
    setActiveBookBytes(null);
    await selectAndLoadBookBytes(token, bookId);
  };

  const saveUpdatedSyncData = async (updated: SyncData) => {
    const token = getAccessToken();
    if (!token || !syncFileId) return;
    setIsSaving(true);
    try {
      await updateSyncFile(token, syncFileId, updated);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadBook = async (file: File) => {
    const token = getAccessToken();
    if (!token) throw new Error('Authorization required.');
    const newFileId = await uploadFileToDrive(token, file);
    const initialStats = emptyProgress();
    const nextSyncData: SyncData = {
      ...syncData,
      books: { ...syncData.books, [newFileId]: initialStats },
    };
    setSyncData(nextSyncData);
    await saveUpdatedSyncData(nextSyncData);
    const pdfFiles = await listPdfsInDrive(token);
    const loadedBooks: Book[] = pdfFiles.map((pf: any) => {
      const stats = nextSyncData.books[pf.id] || emptyProgress();
      return {
        id: pf.id,
        name: pf.name,
        size: pf.size ? parseInt(pf.size) : undefined,
        createdTime: pf.createdTime,
        currentPage: stats.currentPage,
        totalPages: stats.totalPages,
        lastReadTime: stats.lastReadTime,
      };
    });
    setBooks(loadedBooks);
    setActiveBookId(newFileId);
    setActiveBookPage(1);
    await selectAndLoadBookBytes(token, newFileId);
  };

  const handleDeleteBook = async (bookId: string) => {
    const title = books.find((b) => b.id === bookId)?.name || 'this book';
    if (!window.confirm(`Permanently delete "${title}" from Google Drive?`)) return;
    const token = getAccessToken();
    if (!token) return;
    setLoadingLibrary(true);
    try {
      await deleteFileFromDrive(token, bookId);
      const nextSync = { ...syncData };
      delete nextSync.books[bookId];
      setSyncData(nextSync);
      await saveUpdatedSyncData(nextSync);
      if (activeBookId === bookId) { setActiveBookId(null); setActiveBookBytes(null); }
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err: any) {
      setActionError('Error deleting document: ' + err.message);
    } finally {
      setLoadingLibrary(false);
    }
  };

  // ── Generic annotation updater ────────────────────────────────────────────
  const updateBookStats = async (
    bookId: string,
    updater: (prev: BookProgress) => BookProgress
  ) => {
    const current = syncData.books[bookId] || emptyProgress(activeBookPage);
    const next = updater({ ...current });
    const updated: SyncData = {
      ...syncData,
      books: { ...syncData.books, [bookId]: next },
    };
    setSyncData(updated);
    await saveUpdatedSyncData(updated);
  };

  // ── Highlight handlers ────────────────────────────────────────────────────
  const handleAddHighlight = async (hData: Omit<Highlight, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newH: Highlight = { ...hData, id: uid('hl'), createdAt: new Date().toISOString() };
    await updateBookStats(activeBookId, (p) => ({ ...p, highlights: [...p.highlights, newH], lastReadTime: new Date().toISOString() }));
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!activeBookId) return;
    await updateBookStats(activeBookId, (p) => ({ ...p, highlights: p.highlights.filter((h) => h.id !== id) }));
  };

  // ── Note handlers ─────────────────────────────────────────────────────────
  const handleAddNote = async (nData: Omit<StickyNote, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newN: StickyNote = { ...nData, id: uid('note'), createdAt: new Date().toISOString() };
    await updateBookStats(activeBookId, (p) => ({ ...p, notes: [...p.notes, newN], lastReadTime: new Date().toISOString() }));
  };

  const handleDeleteNote = async (id: string) => {
    if (!activeBookId) return;
    await updateBookStats(activeBookId, (p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) }));
  };

  // ── Ink stroke handlers ───────────────────────────────────────────────────
  const handleAddInkStroke = async (sData: Omit<InkStroke, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newS: InkStroke = { ...sData, id: uid('ink'), createdAt: new Date().toISOString() };
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      inkStrokes: [...(p.inkStrokes || []), newS],
      lastReadTime: new Date().toISOString(),
    }));
  };

  const handleDeleteInkStroke = async (id: string) => {
    if (!activeBookId) return;
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      inkStrokes: (p.inkStrokes || []).filter((s) => s.id !== id),
    }));
  };

  // ── Shape handlers ────────────────────────────────────────────────────────
  const handleAddShape = async (sData: Omit<ShapeAnnotation, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newS: ShapeAnnotation = { ...sData, id: uid('shape'), createdAt: new Date().toISOString() };
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      shapes: [...(p.shapes || []), newS],
      lastReadTime: new Date().toISOString(),
    }));
  };

  const handleDeleteShape = async (id: string) => {
    if (!activeBookId) return;
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      shapes: (p.shapes || []).filter((s) => s.id !== id),
    }));
  };

  // ── Text box handlers ─────────────────────────────────────────────────────
  const handleAddTextBox = async (tData: Omit<TextBox, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;
    const newT: TextBox = { ...tData, id: uid('tb'), createdAt: new Date().toISOString() };
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      textBoxes: [...(p.textBoxes || []), newT],
      lastReadTime: new Date().toISOString(),
    }));
  };

  const handleDeleteTextBox = async (id: string) => {
    if (!activeBookId) return;
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      textBoxes: (p.textBoxes || []).filter((t) => t.id !== id),
    }));
  };

  // ── Page change ───────────────────────────────────────────────────────────
  const handleChangePage = async (pageNumber: number) => {
    if (!activeBookId) return;
    setActiveBookPage(pageNumber);
    await updateBookStats(activeBookId, (p) => ({
      ...p,
      currentPage: pageNumber,
      lastReadTime: new Date().toISOString(),
    }));
    setBooks((prev) =>
      prev.map((b) =>
        b.id === activeBookId ? { ...b, currentPage: pageNumber } : b
      )
    );
  };

  const handleDocumentLoad = async (totalPages: number) => {
    if (!activeBookId) return;
    setBooks((prev) =>
      prev.map((b) =>
        b.id === activeBookId ? { ...b, totalPages } : b
      )
    );
    const current = syncData.books[activeBookId];
    if (!current || current.totalPages !== totalPages) {
      await updateBookStats(activeBookId, (p) => ({
        ...p,
        totalPages,
      }));
    }
  };

  // ── Auth actions ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoadingInit(true);
    setActionError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        await loadFullLibraryData(result.accessToken);
      }
    } catch (err: any) {
      const msg = err.message || err.code || String(err);
      setActionError(`Sign-in failed: ${msg}`);
      setLoadingInit(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Disconnect your Google session?')) return;
    await logout();
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
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-[var(--color-background)] text-[var(--color-on-background)]">
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
      <div className="h-screen w-screen flex flex-col items-center justify-center transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-on-background)] relative overflow-hidden">
        {/* Subtle heat ambient glow in corner */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#fa5d19]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#9061ff]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="absolute top-8 right-8">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="btn-secondary text-xs"
          >
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>

        <div className="w-full max-w-md p-8 rounded-2xl border text-center card-surface backdrop-blur-sm z-10">
          <div className="inline-flex p-3 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
            <Flame size={36} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Cloud PDF Sync Reader</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Read, annotate, and sync highlights and drawings across all devices with Google Drive.
          </p>

          <div className="text-left space-y-3 mb-8 px-2">
            {[
              ['Google Drive Integration', 'Stores books and annotations directly on your private Drive.'],
              ['Rich Heat-Driven Annotation', 'Freehand ink, precision shapes, highlighters, sticky notes & text.'],
              ['Eye-Safe Reading', 'Clean technical interface with instant dark mode inversion.'],
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
    <div className="h-screen w-screen flex overflow-hidden transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-on-background)]">

      {/* Document sidebar */}
      {sidebarOpen && (
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
        />
      )}

      {/* Main reading area */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">

        {/* Top bar */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-[var(--color-outline-variant)] bg-[var(--color-surface)]/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn-secondary !h-8 !px-2.5 !py-1"
              title="Toggle library sidebar"
            >
              <Menu size={16} />
            </button>

            <div className="flex items-center gap-1.5">
              {isSaving ? (
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <RefreshCw size={13} className="animate-spin text-[#fa5d19]" />
                  <span className="text-[11px] font-mono">Backing up…</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <CheckCircle size={13} className="text-emerald-500" />
                  <span className="text-[11px] font-mono">Synced</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeBookId && (
              <span className="text-[12px] font-medium max-w-[180px] sm:max-w-xs truncate bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)] px-3 py-1.5 rounded-full border border-[var(--color-outline-variant)]">
                📄 {books.find((b) => b.id === activeBookId)?.name || 'PDF'}
              </span>
            )}

            <button
              onClick={() => setAnnotationsOpen(!annotationsOpen)}
              className={`btn-secondary !h-8 !px-3 !py-1 text-xs ${
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
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 relative bg-[var(--color-surface-container-lowest)]">
          {actionError && (
            <div className="absolute top-4 left-4 right-4 z-50 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-500 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} />
                <p className="font-medium">{actionError}</p>
              </div>
              <button
                onClick={() => loadFullLibraryData(getAccessToken()!)}
                className="px-2.5 py-1 text-[11px] font-semibold bg-red-500 text-white rounded-lg shadow-xs hover:bg-red-600 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {loadingBookData && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[var(--color-surface)]/60 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-11 w-11 border-2 border-[#fa5d19] border-t-transparent" />
              <p className="text-xs font-mono font-medium text-zinc-500 animate-pulse">Downloading document…</p>
            </div>
          )}

          {activeBookBytes ? (
            <div className="w-full h-full p-3 md:p-5 overflow-hidden">
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
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
                <BookOpen size={40} />
              </div>
              <h3 className="text-base font-semibold mb-1.5 text-[var(--color-on-surface)]">Welcome to Cloud PDF</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
                Your bookshelf is empty! Upload a PDF via the sidebar to start reading and annotating.
              </p>
              <div className="p-3 bg-[#fa5d19]/5 rounded-xl border border-[#fa5d19]/15 text-[12px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <Sparkles size={14} className="text-[#fa5d19] inline mr-1" />
                All annotations — ink, shapes, highlights, and notes — sync seamlessly with your Google Drive.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Annotation panel */}
      {annotationsOpen && activeBookId && (
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
        />
      )}
    </div>
  );
}
