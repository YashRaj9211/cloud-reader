import { useEffect, useCallback } from 'react';
import {
  Menu,
  Tag,
  RefreshCw,
  CheckCircle,
  LogOut,
  AlignJustify,
  Maximize,
  Minimize,
  ScrollText,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Highlighter,
  MessageSquare,
  MousePointer,
  Pen,
  Square,
  Circle,
  Minus,
  MoveRight,
  Type,
  Eraser,
  X,
} from 'lucide-react';

interface MainAppProps {
  user: any;
  books: any[];
  activeBookId: string | null;
  activeBookBytes: ArrayBuffer | null;
  activeBookPage: number;
  syncFileId: string | null;
  syncData: any;
  isSaving: boolean;
  loadingLibrary: boolean;
  loadingBookData: boolean;
  actionError: string | null;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  annotationsOpen: boolean;
  setAnnotationsOpen: (open: boolean) => void;
  darkMode: boolean;
  setDarkMode: () => void;
  handleLogin: () => void;
  handleLogout: () => void;
  handleSelectBook: (bookId: string) => void;
  handleUploadBook: (file: File) => Promise<void>;
  handleDeleteBook: (bookId: string) => Promise<void>;
  updateBookStats: (bookId: string, updater: (prev: any) => any) => Promise<void>;
  // Derived state
  activeStats: any;
  currentHighlights: any[];
  currentNotes: any[];
  currentInkStrokes: any[];
  currentShapes: any[];
  currentTextBoxes: any[];
  // Helper functions
  emptyProgress: (page?: number) => any;
}

export default function MainApp({
  user,
  books,
  activeBookId,
  activeBookBytes,
  activeBookPage,
  syncFileId,
  syncData,
  isSaving,
  loadingLibrary,
  loadingBookData,
  actionError,
  sidebarOpen,
  setSidebarOpen,
  annotationsOpen,
  setAnnotationsOpen,
  darkMode,
  setDarkMode,
  handleLogin,
  handleLogout,
  handleSelectBook,
  handleUploadBook,
  handleDeleteBook,
  updateBookStats,
  activeStats,
  currentHighlights,
  currentNotes,
  currentInkStrokes,
  currentShapes,
  currentTextBoxes,
  emptyProgress,
}: MainAppProps) {
  // Create proper page change handlers
  const handleChangePage = useCallback((pageNumber: number) => {
    // Close annotations sidebar on mobile when changing page
    // This would typically be handled by passing a setter from useUI
    // For now we'll note that this should close annotations on mobile
  }, []);

  const handlePageSelectFromAnnotation = useCallback((pageNumber: number) => {
    handleChangePage(pageNumber);
  }, [handleChangePage]);

  // Handle library data reload when needed
  useEffect(() => {
    // This would typically be triggered by a refetch mechanism
    // For now, we'll leave it empty as the data is managed by hooks
  }, [syncFileId]); // Re-sync when syncFileId changes

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
                onClick={() => {
                  // In a real app, we'd have a reload function from useBooks
                  // For now, we'll just note that this would trigger a reload
                }}
                className="px-2.5 py-1 text-[11px] font-semibold bg-red-500 text-white rounded-lg shadow-xs hover-bg-red-600 transition-colors shrink-0 ml-2"
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
                onAddHighlight={(h: any) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  highlights: [...p.highlights, h],
                  lastReadTime: new Date().toISOString(),
                }))}
                onDeleteHighlight={(id: string) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  highlights: p.highlights.filter((h: any) => h.id !== id),
                  lastReadTime: new Date().toISOString(),
                }))}
                onAddNote={(n: any) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  notes: [...p.notes, n],
                  lastReadTime: new Date().toISOString(),
                }))}
                onDeleteNote={(id: string) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  notes: p.notes.filter((n: any) => n.id !== id),
                  lastReadTime: new Date().toISOString(),
                }))}
                onAddInkStroke={(s: any) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  inkStrokes: [...p.inkStrokes, s],
                  lastReadTime: new Date().toISOString(),
                }))}
                onDeleteInkStroke={(id: string) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  inkStrokes: p.inkStrokes.filter((s: any) => s.id !== id),
                  lastReadTime: new Date().toISOString(),
                }))}
                onAddShape={(s: any) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  shapes: [...p.shapes, s],
                  lastReadTime: new Date().toISOString(),
                }))}
                onDeleteShape={(id: string) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  shapes: p.shapes.filter((s: any) => s.id !== id),
                  lastReadTime: new Date().toISOString(),
                }))}
                onAddTextBox={(t: any) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  textBoxes: [...p.textBoxes, t],
                  lastReadTime: new Date().toISOString(),
                }))}
                onDeleteTextBox={(id: string) => updateBookStats(activeBookId, (p: any) => ({
                  ...p,
                  textBoxes: p.textBoxes.filter((t: any) => t.id !== id),
                  lastReadTime: new Date().toISOString(),
                }))}
                onDocumentLoad={(totalPages: number) => {
                  if (activeBookId) {
                    // Update book total pages
                    updateBookStats(activeBookId, (p: any) => ({
                      ...p,
                      totalPages,
                    }));
                  }
                }}
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
            onPageSelect={handlePageSelectFromAnnotation}
            onDeleteHighlight={(id: string) => updateBookStats(activeBookId, (p: any) => ({
              ...p,
              highlights: p.highlights.filter((h: any) => h.id !== id),
              lastReadTime: new Date().toISOString(),
            }))}
            onDeleteNote={(id: string) => updateBookStats(activeBookId, (p: any) => ({
              ...p,
              notes: p.notes.filter((n: any) => n.id !== id),
              lastReadTime: new Date().toISOString(),
            }))}
            onDeleteInkStroke={(id: string) => updateBookStats(activeBookId, (p: any) => ({
              ...p,
              inkStrokes: p.inkStrokes.filter((s: any) => s.id !== id),
              lastReadTime: new Date().toISOString(),
            }))}
            onDeleteShape={(id: string) => updateBookStats(activeBookId, (p: any) => ({
              ...p,
              shapes: p.shapes.filter((s: any) => s.id !== id),
              lastReadTime: new Date().toISOString(),
            }))}
            onDeleteTextBox={(id: string) => updateBookStats(activeBookId, (p: any) => ({
              ...p,
              textBoxes: p.textBoxes.filter((t: any) => t.id !== id),
              lastReadTime: new Date().toISOString(),
            }))}
            darkMode={darkMode}
            onClose={() => setAnnotationsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}