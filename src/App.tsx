import { useEffect, useState, useRef } from 'react';
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
import { Book, SyncData, Highlight, StickyNote, BookProgress } from './types';
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
  CloudRain,
  ChevronRight,
  HelpCircle,
  Sparkles
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(false);
  const [loadingInit, setLoadingInit] = useState<boolean>(true);
  
  // Library & Active books state
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookBytes, setActiveBookBytes] = useState<ArrayBuffer | null>(null);
  const [activeBookPage, setActiveBookPage] = useState<number>(1);
  
  // Google Drive Metadata File sync state
  const [syncFileId, setSyncFileId] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<SyncData>({ books: {} });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoadedOnce, setIsLoadedOnce] = useState<boolean>(false);

  // Layout preference state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [annotationsOpen, setAnnotationsOpen] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  
  // UI Loading statuses
  const [loadingLibrary, setLoadingLibrary] = useState<boolean>(false);
  const [loadingBookData, setLoadingBookData] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Check initial authentication on mount
  useEffect(() => {
    const unsubscribe = initAuth(
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
    return () => unsubscribe();
  }, []);

  // Sync preference with HTML tags for clean styling
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Load the full Google Drive catalog + Annotation JSON
  const loadFullLibraryData = async (token: string) => {
    setLoadingLibrary(true);
    setActionError(null);
    try {
      // 1. Find / Load Sync Meta File
      let syncId = await findSyncFile(token);
      let currentSyncData: SyncData = { books: {} };
      
      if (syncId) {
        setSyncFileId(syncId);
        currentSyncData = await downloadSyncData(token, syncId);
      } else {
        // Create initial sync data file
        const newSyncId = await createSyncFile(token, { books: {} });
        setSyncFileId(newSyncId);
        syncId = newSyncId;
      }
      setSyncData(currentSyncData);

      // 2. Fetch PDF documents list
      const pdfFiles = await listPdfsInDrive(token);
      
      // 3. Merging files and progress trackers
      const loadedBooks: Book[] = pdfFiles.map((pf: any) => {
        const stats = currentSyncData.books[pf.id] || {
          currentPage: 1,
          totalPages: 1,
          lastReadTime: new Date().toISOString(),
          highlights: [],
          notes: []
        };
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

      // 4. Autoselect most recently read Book on startup
      if (loadedBooks.length > 0) {
        const sorted = [...loadedBooks].sort((a, b) => {
          const tA = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const tB = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return tB - tA;
        });
        const targetBook = sorted[0];
        setActiveBookId(targetBook.id);
        setActiveBookPage(targetBook.currentPage);
        await selectAndLoadBookBytes(token, targetBook.id);
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Error loading Google Drive components.');
    } finally {
      setLoadingLibrary(false);
      setLoadingInit(false);
      setIsLoadedOnce(true);
    }
  };

  const selectAndLoadBookBytes = async (token: string, bookId: string) => {
    setLoadingBookData(true);
    setActionError(null);
    try {
      const bytes = await downloadPdfBytes(token, bookId);
      setActiveBookBytes(bytes);

      // Track active page from sync profile
      const cachedProgress = syncData.books[bookId];
      if (cachedProgress) {
        setActiveBookPage(cachedProgress.currentPage || 1);
      } else {
        setActiveBookPage(1);
      }
    } catch (err: any) {
      console.error(err);
      setActionError('Could not download file content. Click retry to refresh.');
    } finally {
      setLoadingBookData(false);
    }
  };

  // Actions
  const handleSelectBook = async (bookId: string) => {
    if (bookId === activeBookId) return;
    const token = getAccessToken();
    if (!token) return;

    setActiveBookId(bookId);
    setActiveBookBytes(null);
    await selectAndLoadBookBytes(token, bookId);
  };

  // Save changes wrapper
  const saveUpdatedSyncData = async (updated: SyncData) => {
    const token = getAccessToken();
    if (!token || !syncFileId) return;

    setIsSaving(true);
    try {
      await updateSyncFile(token, syncFileId, updated);
    } catch (err) {
      console.error('Failed to sync changes with cloud Drive:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Upload PDF doc
  const handleUploadBook = async (file: File) => {
    const token = getAccessToken();
    if (!token) throw new Error('Authorization required.');

    const newFileId = await uploadFileToDrive(token, file);
    
    // Create sync registration
    const initialStats: BookProgress = {
      currentPage: 1,
      totalPages: 100, // placeholder updated during actual render
      lastReadTime: new Date().toISOString(),
      highlights: [],
      notes: []
    };

    const nextSyncData = {
      ...syncData,
      books: {
        ...syncData.books,
        [newFileId]: initialStats,
      }
    };

    setSyncData(nextSyncData);
    await saveUpdatedSyncData(nextSyncData);

    // Refresh collection lists
    const pdfFiles = await listPdfsInDrive(token);
    const loadedBooks: Book[] = pdfFiles.map((pf: any) => {
      const stats = nextSyncData.books[pf.id] || initialStats;
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

  // Delete PDF document permanent (with explicit user confirmations as requested in safety guidelines)
  const handleDeleteBook = async (bookId: string) => {
    const selectedBook = books.find((b) => b.id === bookId);
    const title = selectedBook ? selectedBook.name : 'this book';
    const confirmed = window.confirm(`Permanently delete "${title}" from your Google Drive? This action cannot be undone.`);
    if (!confirmed) return;

    const token = getAccessToken();
    if (!token) return;

    setLoadingLibrary(true);
    try {
      await deleteFileFromDrive(token, bookId);

      // Clean metadata registration
      const nextSync = { ...syncData };
      delete nextSync.books[bookId];
      
      setSyncData(nextSync);
      await saveUpdatedSyncData(nextSync);

      // Adjust active indices
      if (activeBookId === bookId) {
        setActiveBookId(null);
        setActiveBookBytes(null);
      }

      // Re-map library list
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err: any) {
      console.error(err);
      setActionError('Error deleting document: ' + err.message);
    } finally {
      setLoadingLibrary(false);
    }
  };

  // Annotations management callbacks
  const handleAddHighlight = async (hData: Omit<Highlight, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;

    const newHighlight: Highlight = {
      ...hData,
      id: `hl-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    const currentStats = syncData.books[activeBookId] || {
      currentPage: activeBookPage,
      totalPages: 100,
      lastReadTime: new Date().toISOString(),
      highlights: [],
      notes: []
    };

    const nextStats = {
      ...currentStats,
      highlights: [...currentStats.highlights, newHighlight],
      lastReadTime: new Date().toISOString(),
    };

    const updated = {
      ...syncData,
      books: {
        ...syncData.books,
        [activeBookId]: nextStats,
      }
    };

    setSyncData(updated);
    await saveUpdatedSyncData(updated);
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!activeBookId) return;

    const currentStats = syncData.books[activeBookId];
    if (!currentStats) return;

    const nextStats = {
      ...currentStats,
      highlights: currentStats.highlights.filter((h) => h.id !== id),
      lastReadTime: new Date().toISOString(),
    };

    const updated = {
      ...syncData,
      books: {
        ...syncData.books,
        [activeBookId]: nextStats,
      }
    };

    setSyncData(updated);
    await saveUpdatedSyncData(updated);
  };

  const handleAddNote = async (nData: Omit<StickyNote, 'id' | 'createdAt'>) => {
    if (!activeBookId) return;

    const newNote: StickyNote = {
      ...nData,
      id: `note-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    const currentStats = syncData.books[activeBookId] || {
      currentPage: activeBookPage,
      totalPages: 100,
      lastReadTime: new Date().toISOString(),
      highlights: [],
      notes: []
    };

    const nextStats = {
      ...currentStats,
      notes: [...currentStats.notes, newNote],
      lastReadTime: new Date().toISOString(),
    };

    const updated = {
      ...syncData,
      books: {
        ...syncData.books,
        [activeBookId]: nextStats,
      }
    };

    setSyncData(updated);
    await saveUpdatedSyncData(updated);
  };

  const handleDeleteNote = async (id: string) => {
    if (!activeBookId) return;

    const currentStats = syncData.books[activeBookId];
    if (!currentStats) return;

    const nextStats = {
      ...currentStats,
      notes: currentStats.notes.filter((n) => n.id !== id),
      lastReadTime: new Date().toISOString(),
    };

    const updated = {
      ...syncData,
      books: {
        ...syncData.books,
        [activeBookId]: nextStats,
      }
    };

    setSyncData(updated);
    await saveUpdatedSyncData(updated);
  };

  const handleChangePage = async (pageNumber: number) => {
    if (!activeBookId) return;
    setActiveBookPage(pageNumber);

    const currentStats = syncData.books[activeBookId] || {
      currentPage: 1,
      totalPages: 100,
      lastReadTime: new Date().toISOString(),
      highlights: [],
      notes: []
    };

    const nextStats = {
      ...currentStats,
      currentPage: pageNumber,
      lastReadTime: new Date().toISOString(),
    };

    const updated = {
      ...syncData,
      books: {
        ...syncData.books,
        [activeBookId]: nextStats,
      }
    };

    setSyncData(updated);
    await saveUpdatedSyncData(updated);

    // Sync state visual representation update in sidebar list
    setBooks(prev => prev.map(book => {
      if (book.id === activeBookId) {
        return {
          ...book,
          currentPage: pageNumber,
          lastReadTime: nextStats.lastReadTime,
        };
      }
      return book;
    }));
  };

  // Google sign in initiation trigger
  const handleLogin = async () => {
    setLoadingInit(true);
    setActionError(null);
    try {
      const authResult = await googleSignIn();
      if (authResult) {
        setUser(authResult.user);
        setNeedsAuth(false);
        await loadFullLibraryData(authResult.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || err.code || String(err);
      setActionError(`Sign-in failed: ${msg}. Please check the console or ensure your redirect URI / localhost domain is authorized in Firebase.`);
      setLoadingInit(false);
    }
  };

  const handleLogout = async () => {
    const confirmOut = window.confirm('Disconnect your active synchronized Google session? This device will temporarily read offline.');
    if (!confirmOut) return;

    await logout();
    setUser(null);
    setNeedsAuth(true);
    setBooks([]);
    setActiveBookId(null);
    setActiveBookBytes(null);
    setSyncData({ books: {} });
  };

  // Active document metrics computation
  const activeBookStats = activeBookId ? syncData.books[activeBookId] : null;
  const currentHighlights = activeBookStats?.highlights || [];
  const currentNotes = activeBookStats?.notes || [];

  // Loading indicator overlay
  if (loadingInit) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center space-y-4 ${
        darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}>
        <div className="flex items-center space-x-3 mb-2 animate-pulse">
          <BookOpen className="text-amber-500" size={32} />
          <h1 className="text-2xl font-bold tracking-tight font-sans">Cloud PDF</h1>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-amber-500 border-t-transparent" />
        <p className="text-xs font-mono text-zinc-500 animate-pulse">Synchronizing metadata and profiles...</p>
      </div>
    );
  }

  // Google Sign-In Screen
  if (needsAuth) {
    return (
      <div className={`h-screen w-screen flex flex-col items-center justify-center transition-colors duration-300 ${
        darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-[#1e1e1e]'
      }`}>
        {/* Decorative Grid items */}
        <div className="absolute top-10 right-10">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2.5 rounded-xl border transition-colors ${
              darkMode ? 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>

        <div className={`w-full max-w-md p-8 rounded-2xl border text-center transition-colors duration-300 ${
          darkMode ? 'bg-zinc-900/60 border-zinc-800 shadow-2xl' : 'bg-white border-zinc-200 shadow-xl'
        }`}>
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 mb-4 animate-bounce">
            <BookOpen className="text-amber-500" size={36} />
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-2 font-sans">Cloud PDF Sync Reader</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 font-sans">
            Read, annotate, and write highlights securely. Keep your bookshelf and reading progress synchronized in real-time across all devices.
          </p>

          {/* Core Feature bullet lists */}
          <div className="text-left space-y-3 mb-8 px-2">
            <div className="flex items-start space-x-3 text-xs leading-relaxed">
              <span className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-amber-500 font-bold">✓</span>
              <div>
                <strong className="block font-medium">Google Drive Integration</strong>
                <span className="text-zinc-400">Stores books and states on your private Drive.</span>
              </div>
            </div>
            <div className="flex items-start space-x-3 text-xs leading-relaxed">
              <span className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-amber-500 font-bold">✓</span>
              <div>
                <strong className="block font-medium">Highlights & Translucent Highlights</strong>
                <span className="text-zinc-400">Color sections, add paragraphs note bookmarks.</span>
              </div>
            </div>
            <div className="flex items-start space-x-3 text-xs leading-relaxed">
              <span className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-amber-500 font-bold">✓</span>
              <div>
                <strong className="block font-medium">Eye-Safe Reading</strong>
                <span className="text-zinc-400">Read in custom inversion dark mode comfort.</span>
              </div>
            </div>
          </div>

          {actionError && (
            <div className="mb-4 p-3.5 rounded-xl border border-red-500/10 bg-red-500/[0.02] text-xs text-red-500 flex items-center space-x-2">
              <ShieldAlert size={14} className="shrink-0" />
              <p className="text-left font-sans">{actionError}</p>
            </div>
          )}

          {/* Dynamic Google Login Button template custom-built */}
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center space-x-3 bg-amber-500 hover:bg-amber-600 font-semibold py-3 px-4 rounded-xl text-white transition-all shadow-md focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer text-sm"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 bg-white p-0.5 rounded-full">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            <span className="font-sans">Sync Google Drive Account</span>
          </button>

          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-4 font-mono">
            Requires minimum Workspace API scopes to sync books folder.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-screen flex overflow-hidden transition-colors duration-300 font-sans ${
      darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'
    }`}>
      
      {/* Side collapsible Document Catalog Sidebar */}
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

      {/* Main Reading Canvas View zone */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Top Floating Control Subbar navigation */}
        <div className={`h-14 px-6 flex items-center justify-between border-b ${
          darkMode ? 'border-zinc-800 bg-zinc-900/10' : 'border-zinc-100 bg-zinc-50/10'
        }`}>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded-lg border transition-colors ${
                darkMode ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700'
              }`}
              title="Toggle Sidebar library"
            >
              <Menu size={16} />
            </button>

            {/* Sync Cloud Telemetry visual indicator */}
            <div className="flex items-center space-x-2">
              {isSaving ? (
                <div className="flex items-center space-x-1.5 text-zinc-500 font-medium">
                  <RefreshCw size={13} className="animate-spin text-amber-500" />
                  <span className="text-[10px]">Backing up...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-zinc-500">
                  <CheckCircle size={13} className="text-emerald-500" />
                  <span className="text-[10px] font-mono">Synced on Drive</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Direct current book title displays */}
            {activeBookId && (
              <span className="text-[11px] font-medium max-w-[200px] sm:max-w-xs md:max-w-md truncate bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 px-3 py-1.5 rounded-full font-sans">
                📖 {books.find(b => b.id === activeBookId)?.name || 'Reading PDF Book'}
              </span>
            )}

            {/* Toggle Annotations sidebar menu */}
            <button
              onClick={() => setAnnotationsOpen(!annotationsOpen)}
              className={`p-2 rounded-lg border transition-colors flex items-center space-x-1.5 ${
                annotationsOpen
                  ? 'bg-amber-100 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900 text-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'
              }`}
              title="Toggle annotations index panel"
            >
              <Tag size={14} />
              <span className="text-xs font-medium hidden sm:inline">Annotations</span>
            </button>
          </div>
        </div>

        {/* Dynamic content rendering zone */}
        <div className="flex-1 min-h-0 relative">
          
          {actionError && (
            <div className="absolute top-4 left-4 right-4 z-50 p-4 rounded-xl border border-red-500/15 bg-red-500/5 text-xs text-red-500 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldAlert size={14} />
                <p className="font-sans font-medium">{actionError}</p>
              </div>
              <button 
                onClick={() => loadFullLibraryData(getAccessToken()!)}
                className="px-2.5 py-1 text-[10px] font-medium bg-red-100 hover:bg-red-200 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-md shrink-0 transition-colors"
              >
                Retry Auth
              </button>
            </div>
          )}

          {loadingBookData && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center space-y-3 bg-zinc-900/5 dark:bg-zinc-950/20 backdrop-blur-xs">
              <div className="animate-spin rounded-full h-11 w-11 border-2 border-amber-500 border-t-transparent" />
              <p className="text-sm font-medium text-zinc-500 animate-pulse font-sans">Downloading document bytes...</p>
            </div>
          )}

          {activeBookBytes ? (
            <div className="w-full h-full p-4 md:p-6 overflow-hidden">
              <PDFReader
                pdfData={activeBookBytes}
                currentPage={activeBookPage}
                onChangePage={handleChangePage}
                highlights={currentHighlights}
                notes={currentNotes}
                onAddHighlight={handleAddHighlight}
                onDeleteHighlight={handleDeleteHighlight}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
                darkMode={darkMode}
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 mb-4 animate-pulse">
                <BookOpen size={40} />
              </div>
              <h3 className="text-base font-semibold mb-1.5 font-sans">Welcome to Cloud PDF</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans mb-4">
                Your bookshelf is empty! Please click the <strong className="text-amber-500">Upload PDF Book</strong> button or drag-and-drop a PDF file into the sidebar to upload your books and start synchronizing your notes.
              </p>
              <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-[11px] text-zinc-400 leading-relaxed">
                <Sparkles size={14} className="text-amber-500 inline mr-1" />
                All books, progress, sticky notes, and color highlights are kept in sync on your personal Google Drive account.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Collapsible annotation cards drawer */}
      {annotationsOpen && activeBookId && (
        <AnnotationPanel
          highlights={currentHighlights}
          notes={currentNotes}
          onPageSelect={handleChangePage}
          onDeleteHighlight={handleDeleteHighlight}
          onDeleteNote={handleDeleteNote}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}
