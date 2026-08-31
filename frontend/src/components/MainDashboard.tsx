import React, { useEffect, useCallback } from 'react';
import {
  Menu,
  Tag,
  RefreshCw,
  CheckCircle,
  Sparkles,
  BookOpen,
  Search,
  FileText,
  Layers,
  SplitSquareVertical,
  ShieldAlert,
} from 'lucide-react';
import { useAppStore } from '../store';
import DocumentSidebar from './DocumentSidebar';
import PDFReader from './PDFReader';
import AnnotationPanel from './AnnotationPanel';
import { ChatDrawer } from './chat/ChatDrawer';
import { CommandPalette } from './search/CommandPalette';
import { MarkdownReader } from './MarkdownReader';
import { IndexingProgressBar } from './common/IndexingProgressBar';
import { Button } from './ui/Button';

export const MainDashboard: React.FC = () => {
  const {
    user,
    books,
    activeBookId,
    activeBookBytes,
    activeBookPage,
    syncData,
    isSaving,
    loadingBookData,
    bookError,
    setBookError,
    sidebarOpen,
    setSidebarOpen,
    annotationsOpen,
    setAnnotationsOpen,
    chatOpen,
    toggleChat,
    setCommandPaletteOpen,
    viewMode,
    setViewMode,
    darkMode,
    changePage,
    updateBookStats,
    indexingStatus,
    startIndexing,
    activeMarkdown,
    loadingMarkdown,
    loadBookMarkdown,
    selectBook,
  } = useAppStore();

  const currentBook = books.find((b) => b.id === activeBookId);
  const activeStats = activeBookId ? syncData.books[activeBookId] : null;
  const currentHighlights = activeStats?.highlights || [];
  const currentNotes = activeStats?.notes || [];
  const currentInkStrokes = activeStats?.inkStrokes || [];
  const currentShapes = activeStats?.shapes || [];
  const currentTextBoxes = activeStats?.textBoxes || [];

  // When viewMode switches to markdown or split, load markdown if not loaded yet
  useEffect(() => {
    if ((viewMode === 'markdown' || viewMode === 'split') && activeBookId && !activeMarkdown) {
      loadBookMarkdown(activeBookId);
    }
  }, [viewMode, activeBookId, activeMarkdown, loadBookMarkdown]);

  const handleChangePage = useCallback(
    (pageNumber: number) => {
      changePage(pageNumber);
    },
    [changePage]
  );

  return (
    <div className="h-screen w-screen flex overflow-hidden transition-colors duration-300 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 relative font-sans">
      {/* Mobile / Tablet Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* ── Document sidebar: Slide-over drawer on mobile/tablet, docked on desktop ── */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:static md:z-auto transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <DocumentSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main Viewport ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Navigation Bar */}
        <header className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              leftIcon={<Menu size={16} />}
              className={sidebarOpen ? '!bg-[#fa5d19]/10 !text-[#fa5d19] !border-[#fa5d19]/30' : ''}
            >
              <span className="hidden sm:inline text-xs">Library</span>
            </Button>

            {/* Document Title Pill */}
            {currentBook && (
              <span className="text-xs font-semibold max-w-[120px] sm:max-w-[220px] md:max-w-xs truncate bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-3 py-1 rounded-full border border-stone-200 dark:border-stone-700">
                📄 {currentBook.name}
              </span>
            )}

            {/* Indexing Status Badge / Trigger */}
            {activeBookId && (
              <div className="hidden lg:block">
                <IndexingProgressBar
                  status={indexingStatus[activeBookId]}
                  onStartIndexing={() => startIndexing(activeBookId)}
                />
              </div>
            )}

            {/* Sync indicator */}
            <div className="hidden sm:flex items-center gap-1.5 ml-1">
              {isSaving ? (
                <div className="flex items-center gap-1.5 text-stone-500">
                  <RefreshCw size={12} className="animate-spin text-[#fa5d19]" />
                  <span className="text-[10px] font-mono">Syncing…</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-stone-500">
                  <CheckCircle size={12} className="text-emerald-500" />
                  <span className="text-[10px] font-mono">Synced</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Global Semantic Search Trigger (Cmd+K) */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:border-[#fa5d19] text-xs bg-stone-50 dark:bg-stone-800/60 transition-colors cursor-pointer"
              title="Search vector chunks & files (Cmd+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Semantic Search</span>
              <kbd className="hidden sm:inline text-[10px] font-mono bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5 rounded text-stone-600 dark:text-stone-300">
                ⌘K
              </kbd>
            </button>

            {/* View Mode Segmented Switcher */}
            {activeBookId && (
              <div className="hidden md:flex items-center bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs">
                <button
                  onClick={() => setViewMode('pdf')}
                  className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                    viewMode === 'pdf'
                      ? 'bg-white dark:bg-stone-900 text-[#fa5d19] shadow-xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  PDF
                </button>
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                    viewMode === 'markdown'
                      ? 'bg-white dark:bg-stone-900 text-[#fa5d19] shadow-xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                    viewMode === 'split'
                      ? 'bg-white dark:bg-stone-900 text-[#fa5d19] shadow-xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  Split
                </button>
              </div>
            )}

            {/* Annotations panel toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnnotationsOpen(!annotationsOpen)}
              leftIcon={<Tag size={14} />}
              className={
                annotationsOpen
                  ? '!bg-[#fa5d19]/10 !text-[#fa5d19] !border-[#fa5d19]/30 font-semibold'
                  : ''
              }
            >
              <span className="hidden sm:inline">Notes</span>
            </Button>

            {/* AI Assistant Drawer Toggle */}
            <Button
              variant={chatOpen ? 'primary' : 'outline'}
              size="sm"
              onClick={toggleChat}
              leftIcon={<Sparkles size={14} />}
              className="font-medium"
            >
              <span className="hidden sm:inline">AI Chat</span>
            </Button>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 min-h-0 relative bg-stone-100/50 dark:bg-stone-950/60 overflow-hidden">
          {bookError && (
            <div className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-50 p-3 sm:p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert size={15} className="shrink-0" />
                <p className="font-medium truncate">{bookError}</p>
              </div>
              <Button
                variant="danger"
                size="xs"
                onClick={() => {
                  setBookError(null);
                  if (activeBookId) selectBook(activeBookId);
                }}
              >
                Retry
              </Button>
            </div>
          )}

          {loadingBookData && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-white/70 dark:bg-stone-900/70 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#fa5d19] border-t-transparent" />
              <p className="text-xs font-mono font-medium text-stone-500 animate-pulse">
                Streaming document binary…
              </p>
            </div>
          )}

          {activeBookBytes ? (
            <div className="w-full h-full flex overflow-hidden">
              {/* PDF Viewer Portion (shown in pdf or split mode) */}
              {(viewMode === 'pdf' || viewMode === 'split') && (
                <div
                  className={`h-full overflow-hidden ${
                    viewMode === 'split' ? 'w-1/2 border-r border-stone-200 dark:border-stone-800' : 'w-full'
                  }`}
                >
                  <PDFReader
                    pdfData={activeBookBytes}
                    currentPage={activeBookPage}
                    onChangePage={handleChangePage}
                    highlights={currentHighlights}
                    notes={currentNotes}
                    inkStrokes={currentInkStrokes}
                    shapes={currentShapes}
                    textBoxes={currentTextBoxes}
                    onAddHighlight={(h: any) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        highlights: [...p.highlights, h],
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onDeleteHighlight={(id: string) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        highlights: p.highlights.filter((h) => h.id !== id),
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onAddNote={(n: any) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        notes: [...p.notes, n],
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onDeleteNote={(id: string) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        notes: p.notes.filter((n) => n.id !== id),
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onAddInkStroke={(s: any) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        inkStrokes: [...p.inkStrokes, s],
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onDeleteInkStroke={(id: string) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        inkStrokes: p.inkStrokes.filter((s) => s.id !== id),
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onAddShape={(s: any) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        shapes: [...p.shapes, s],
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onDeleteShape={(id: string) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        shapes: p.shapes.filter((s) => s.id !== id),
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onAddTextBox={(t: any) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        textBoxes: [...p.textBoxes, t],
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onDeleteTextBox={(id: string) =>
                      updateBookStats(activeBookId!, (p) => ({
                        ...p,
                        textBoxes: p.textBoxes.filter((t) => t.id !== id),
                        lastReadTime: new Date().toISOString(),
                      }))
                    }
                    onDocumentLoad={(totalPages: number) => {
                      if (activeBookId) {
                        updateBookStats(activeBookId, (p) => ({
                          ...p,
                          totalPages,
                        }));
                      }
                    }}
                    darkMode={darkMode}
                  />
                </div>
              )}

              {/* Markdown Portion (shown in markdown or split mode) */}
              {(viewMode === 'markdown' || viewMode === 'split') && (
                <div className={`h-full ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
                  <MarkdownReader
                    markdown={activeMarkdown}
                    isLoading={loadingMarkdown}
                    bookTitle={currentBook?.name}
                    onStartIndexing={() => activeBookId && startIndexing(activeBookId)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
                <BookOpen size={36} />
              </div>
              <h3 className="text-base font-semibold mb-1.5 text-stone-900 dark:text-stone-100">
                Welcome to Cloud PDF Reader
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed mb-5">
                Select a document from your Google Drive library, or upload a research paper to start reading and chatting with AI.
              </p>
              <Button onClick={() => setSidebarOpen(true)} className="mb-4">
                Open Library
              </Button>
              <div className="p-3 bg-[#fa5d19]/5 rounded-xl border border-[#fa5d19]/15 text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed text-left">
                <Sparkles size={13} className="text-[#fa5d19] inline mr-1" />
                Featuring Google ADK RAG Assistant, ChromaDB semantic vector search (⌘K), and instant page citations.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Annotation panel: Slide-over drawer on mobile/tablet, docked on desktop ── */}
      {annotationsOpen && activeBookId && (
        <div
          onClick={() => setAnnotationsOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
        />
      )}

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
            onDeleteHighlight={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                highlights: p.highlights.filter((h) => h.id !== id),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteNote={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                notes: p.notes.filter((n) => n.id !== id),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteInkStroke={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                inkStrokes: p.inkStrokes.filter((s) => s.id !== id),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteShape={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                shapes: p.shapes.filter((s) => s.id !== id),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteTextBox={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                textBoxes: p.textBoxes.filter((t) => t.id !== id),
                lastReadTime: new Date().toISOString(),
              }))
            }
            darkMode={darkMode}
            onClose={() => setAnnotationsOpen(false)}
          />
        </div>
      )}

      {/* ── Collapsible AI Chat Assistant Drawer ── */}
      <ChatDrawer />

      {/* ── Global Semantic Search Modal (Cmd+K) ── */}
      <CommandPalette />
    </div>
  );
};

export default MainDashboard;
