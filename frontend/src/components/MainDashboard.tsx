import React, { useEffect, useCallback, useState, useMemo } from "react";
import {
  Menu,
  Tag,
  RefreshCw,
  Sparkles,
  Search,
  FileText,
  Columns,
  ShieldAlert,
  Flame,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { useAppStore } from "../store";
import DocumentSidebar from "./DocumentSidebar";
import PDFReader from "./PDFReader";
import AnnotationPanel from "./AnnotationPanel";
import { ChatDrawer } from "./chat/ChatDrawer";
import { CommandPalette } from "./search/CommandPalette";
import { MarkdownReader } from "./MarkdownReader";
import { AnimationStudioWindow } from "./animation/AnimationStudioWindow";
import { IndexingProgressBar } from "./common/IndexingProgressBar";
import { Button } from "./ui/Button";

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

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const currentHighlights = useMemo(() => {
    return (activeStats?.highlights || []).map((h, idx) => ({
      ...h,
      id: h.id || `legacy-hl-${idx}-${h.page}`,
      createdAt: h.createdAt || new Date().toISOString(),
    }));
  }, [activeStats?.highlights]);

  const currentNotes = useMemo(() => {
    return (activeStats?.notes || []).map((n, idx) => ({
      ...n,
      id: n.id || `legacy-note-${idx}-${n.page}-${n.x}`,
      createdAt: n.createdAt || new Date().toISOString(),
    }));
  }, [activeStats?.notes]);

  const currentInkStrokes = useMemo(() => {
    return (activeStats?.inkStrokes || []).map((s, idx) => ({
      ...s,
      id: s.id || `legacy-ink-${idx}-${s.page}`,
      createdAt: s.createdAt || new Date().toISOString(),
    }));
  }, [activeStats?.inkStrokes]);

  const currentShapes = useMemo(() => {
    return (activeStats?.shapes || []).map((s, idx) => ({
      ...s,
      id: s.id || `legacy-shape-${idx}-${s.page}`,
      createdAt: s.createdAt || new Date().toISOString(),
    }));
  }, [activeStats?.shapes]);

  const currentTextBoxes = useMemo(() => {
    return (activeStats?.textBoxes || []).map((t, idx) => ({
      ...t,
      id: t.id || `legacy-tb-${idx}-${t.page}`,
      createdAt: t.createdAt || new Date().toISOString(),
    }));
  }, [activeStats?.textBoxes]);

  // When viewMode switches to markdown or split, load markdown if not loaded yet
  useEffect(() => {
    if (
      (viewMode === "markdown" || viewMode === "split") &&
      activeBookId &&
      !activeMarkdown
    ) {
      loadBookMarkdown(activeBookId);
    }
  }, [viewMode, activeBookId, activeMarkdown, loadBookMarkdown]);

  // Persist current reading progress to localStorage before user closes tab/window
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeBookId && activeBookPage) {
        try {
          localStorage.setItem(
            `cloudreader_last_page_${activeBookId}`,
            String(activeBookPage),
          );
        } catch (e) {}
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeBookId, activeBookPage]);

  const handleChangePage = useCallback(
    (pageNumber: number) => {
      changePage(pageNumber);
    },
    [changePage],
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
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden"
        }`}
      >
        <DocumentSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main Viewport ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Navigation Bar: Ultra-Clean Minimalist Bar */}
        <header className="h-14 px-3 sm:px-6 flex items-center justify-between bg-transparent backdrop-blur-xl shrink-0 z-20 select-none">
          {/* Left: Library Toggle & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Library Sidebar"
              className={`p-2 rounded-full transition-all flex items-center justify-center ${
                sidebarOpen
                  ? "bg-[#fa5d19] text-white shadow-xs"
                  : "text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/80"
              }`}
            >
              <Menu size={18} />
            </button>

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#fa5d19] flex items-center justify-center text-white shadow-xs">
                <Flame size={15} className="fill-white" />
              </span>
              <span className="font-bold text-sm tracking-tight text-stone-900 dark:text-stone-100 hidden sm:inline">
                CloudPDF
              </span>
            </div>

            {/* Document Title Pill */}
            {currentBook && (
              <div className="flex items-center gap-1.5 bg-stone-200/50 dark:bg-stone-800/60 rounded-full px-3 py-1 text-xs text-stone-700 dark:text-stone-300 max-w-[140px] sm:max-w-xs md:max-w-sm truncate">
                <span className="font-medium truncate max-w-[100px] sm:max-w-[150px] md:max-w-[200px]">
                  {currentBook.name}
                </span>
                <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-600 shrink-0" />
                <span className="text-[11px] text-stone-500 shrink-0">
                  p. {activeBookPage}
                </span>
              </div>
            )}

            {/* Sync Icon Indicator */}
            {isSaving ? (
              <span title="Syncing..." className="inline-flex items-center">
                <RefreshCw
                  size={13}
                  className="animate-spin text-[#fa5d19] ml-1 shrink-0"
                />
              </span>
            ) : (
              <div
                className="w-2 h-2 rounded-full bg-emerald-500 ml-1 shrink-0"
                title="All changes saved"
              />
            )}
          </div>

          {/* Right: Quick Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Global Semantic Search Trigger Icon */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="p-2 rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 hover:text-stone-900 dark:hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
              title="Search vector chunks & files (⌘K)"
            >
              <Search size={16} />
              <kbd className="hidden md:inline text-[10px] font-mono bg-stone-200/80 dark:bg-stone-800 px-1.5 py-0.5 rounded text-stone-500 dark:text-stone-400">
                ⌘K
              </kbd>
            </button>

            {/* View Mode Segmented Icon Switcher */}
            {activeBookId && (
              <div className="flex items-center bg-stone-200/50 dark:bg-stone-800/60 p-0.5 rounded-full text-xs">
                <button
                  onClick={() => setViewMode("pdf")}
                  className={`px-2 py-1 rounded-full text-xs transition-all font-medium ${
                    viewMode === "pdf"
                      ? "bg-white dark:bg-stone-900 text-[#fa5d19] shadow-xs"
                      : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                  }`}
                  title="PDF Page Mode"
                >
                  PDF
                </button>
                <button
                  onClick={() => setViewMode("markdown")}
                  className={`px-2 py-1 rounded-full text-xs transition-all font-medium ${
                    viewMode === "markdown"
                      ? "bg-white dark:bg-stone-900 text-[#fa5d19] shadow-xs"
                      : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                  }`}
                  title="Markdown Mode"
                >
                  <FileText size={13} />
                </button>
                <button
                  onClick={() => setViewMode("split")}
                  className={`px-2 py-1 rounded-full text-xs transition-all font-medium ${
                    viewMode === "split"
                      ? "bg-white dark:bg-stone-900 text-[#fa5d19] shadow-xs"
                      : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                  }`}
                  title="Split View"
                >
                  <Columns size={13} />
                </button>
              </div>
            )}

            {/* Notes toggle icon button */}
            <button
              onClick={() => setAnnotationsOpen(!annotationsOpen)}
              className={`p-2 rounded-full transition-all ${
                annotationsOpen
                  ? "bg-[#fa5d19]/15 text-[#fa5d19]"
                  : "text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/80"
              }`}
              title="Toggle Notes & Annotations"
            >
              <Tag size={16} />
            </button>

            {/* AI Copilot / Dynamic Indexing Trigger Button */}
            {(() => {
              const activeStatus = activeBookId
                ? indexingStatus[activeBookId]
                : undefined;
              const isProcessing = activeStatus?.status === "PROCESSING";
              const isIndexed = activeStatus?.status === "INDEXED";
              const isFailed = activeStatus?.status === "FAILED";
              const isUnindexed = Boolean(
                activeBookId &&
                (!activeStatus ||
                  activeStatus.status === ("NOT_INDEXED" as any) ||
                  activeStatus.status === "UPLOADED" ||
                  (!isProcessing && !isIndexed && !isFailed)),
              );

              // Calculate progress metrics and stage descriptions
              let indexPercent = 10;
              let stageLabel = "Fetching PDF";
              if (activeStatus) {
                if (
                  activeStatus.total_pages > 0 &&
                  activeStatus.total_chunks === 0
                ) {
                  stageLabel = `Parsing ${activeStatus.total_pages}p`;
                  indexPercent = 25;
                } else if (
                  activeStatus.total_chunks > 0 &&
                  activeStatus.processed_chunks === 0
                ) {
                  stageLabel = `Embedding ${activeStatus.total_chunks}c`;
                  indexPercent = 45;
                } else if (
                  activeStatus.total_chunks > 0 &&
                  activeStatus.processed_chunks > 0
                ) {
                  indexPercent = Math.min(
                    99,
                    Math.max(
                      50,
                      Math.round(
                        (activeStatus.processed_chunks /
                          activeStatus.total_chunks) *
                          100,
                      ),
                    ),
                  );
                  stageLabel = `Indexing ${activeStatus.processed_chunks}/${activeStatus.total_chunks}`;
                }
              }

              // State 1: Document is not indexed -> Show text to index it
              if (isUnindexed) {
                return (
                  <button
                    onClick={() => activeBookId && startIndexing(activeBookId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#fff1eb] dark:bg-[#fa5d19]/15 text-[#fa5d19] hover:bg-[#fa5d19] hover:text-white border border-[#fa5d19]/30 transition-all shadow-xs cursor-pointer"
                    title="This document is not indexed. Click to queue indexing for AI Copilot & Semantic Search."
                  >
                    <Sparkles size={14} className="shrink-0" />
                    <span>Index for AI</span>
                  </button>
                );
              }

              // State 2: Indexing in progress -> Show the stage reached and percentage
              if (isProcessing) {
                return (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#fa5d19]/10 text-[#fa5d19] border border-[#fa5d19]/30 shadow-xs"
                    title={`Indexing in progress: ${stageLabel} (${indexPercent}%). Kafka pipeline active.`}
                  >
                    <RefreshCw
                      size={13}
                      className="animate-spin text-[#fa5d19] shrink-0"
                    />
                    <span>
                      {stageLabel} {indexPercent}%
                    </span>
                    <div className="w-10 bg-[#fa5d19]/20 h-1.5 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="bg-[#fa5d19] h-full transition-all duration-300 rounded-full"
                        style={{ width: `${indexPercent}%` }}
                      />
                    </div>
                  </div>
                );
              }

              // State 3: Indexing failed -> Retry trigger
              if (isFailed) {
                return (
                  <button
                    onClick={() => activeBookId && startIndexing(activeBookId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-all cursor-pointer"
                    title={`Indexing failed: ${activeStatus?.error_message || "Unknown error"}. Click to retry.`}
                  >
                    <AlertCircle size={14} className="shrink-0" />
                    <span>Index Failed • Retry</span>
                  </button>
                );
              }

              // State 4: Once done (or general workspace) -> Convert into AI Chat / AI Copilot
              return (
                <button
                  onClick={toggleChat}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    chatOpen
                      ? "bg-[#fa5d19] text-white shadow-xs"
                      : "bg-[#fff1eb] dark:bg-[#fa5d19]/15 text-[#fa5d19] hover:bg-[#fa5d19]/25"
                  }`}
                  title={
                    isIndexed
                      ? "AI Copilot Ready • Toggle AI Chat"
                      : "Toggle AI Research Copilot"
                  }
                >
                  <Sparkles
                    size={14}
                    className={chatOpen ? "text-white" : "text-[#fa5d19]"}
                  />
                  <span className="hidden sm:inline">AI Copilot</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      chatOpen
                        ? "bg-white"
                        : isIndexed
                          ? "bg-emerald-500"
                          : "bg-[#fa5d19]"
                    } animate-pulse`}
                  />
                </button>
              );
            })()}

            {/* User Profile Avatar */}
            {user && (
              <div
                className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#fa5d19] to-[#ff8c42] text-white flex items-center justify-center font-bold text-xs ring-1 ring-stone-300 dark:ring-stone-700 cursor-pointer shadow-xs"
                title={user.name || user.email || "User Profile"}
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || "User"}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  (user.name?.[0] || user.email?.[0] || "U").toUpperCase()
                )}
              </div>
            )}
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

          {/* Loading Overlay when downloading document binary */}
          {loadingBookData && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-stone-100/90 dark:bg-stone-900/90 backdrop-blur-md">
              <div className="relative flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-3 border-stone-200 dark:border-stone-700 border-t-[#fa5d19]" />
                <FileText size={18} className="absolute text-[#fa5d19]" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                  Opening{" "}
                  {currentBook?.name
                    ? currentBook.name.replace(/\.[^/.]+$/, "")
                    : "Document"}
                  …
                </p>
                <p className="text-[11px] font-mono text-stone-500 animate-pulse">
                  Downloading document binary
                </p>
              </div>
            </div>
          )}

          {activeBookBytes ? (
            <div className="w-full h-full flex overflow-hidden">
              {/* PDF Viewer Portion */}
              <div
                className={`h-full overflow-hidden ${
                  viewMode === "pdf"
                    ? "w-full"
                    : viewMode === "split"
                      ? "w-1/2 border-r border-stone-200 dark:border-stone-800"
                      : "hidden"
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
                    updateBookStats(activeBookId!, (p) => {
                      const id =
                        h.id ||
                        `hl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                      const createdAt = h.createdAt || new Date().toISOString();
                      return {
                        ...p,
                        highlights: [...p.highlights, { ...h, id, createdAt }],
                        lastReadTime: new Date().toISOString(),
                      };
                    })
                  }
                  onDeleteHighlight={(id: string) =>
                    updateBookStats(activeBookId!, (p) => ({
                      ...p,
                      highlights: p.highlights.filter(
                        (h, idx) =>
                          (h.id || `legacy-hl-${idx}-${h.page}`) !== id,
                      ),
                      lastReadTime: new Date().toISOString(),
                    }))
                  }
                  onAddNote={(n: any) =>
                    updateBookStats(activeBookId!, (p) => {
                      const id =
                        n.id ||
                        `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                      const createdAt = n.createdAt || new Date().toISOString();
                      return {
                        ...p,
                        notes: [...p.notes, { ...n, id, createdAt }],
                        lastReadTime: new Date().toISOString(),
                      };
                    })
                  }
                  onDeleteNote={(id: string) =>
                    updateBookStats(activeBookId!, (p) => ({
                      ...p,
                      notes: p.notes.filter(
                        (n, idx) =>
                          (n.id || `legacy-note-${idx}-${n.page}-${n.x}`) !==
                          id,
                      ),
                      lastReadTime: new Date().toISOString(),
                    }))
                  }
                  onAddInkStroke={(s: any) =>
                    updateBookStats(activeBookId!, (p) => {
                      const id =
                        s.id ||
                        `ink-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                      const createdAt = s.createdAt || new Date().toISOString();
                      return {
                        ...p,
                        inkStrokes: [...p.inkStrokes, { ...s, id, createdAt }],
                        lastReadTime: new Date().toISOString(),
                      };
                    })
                  }
                  onDeleteInkStroke={(id: string) =>
                    updateBookStats(activeBookId!, (p) => ({
                      ...p,
                      inkStrokes: p.inkStrokes.filter(
                        (s, idx) =>
                          (s.id || `legacy-ink-${idx}-${s.page}`) !== id,
                      ),
                      lastReadTime: new Date().toISOString(),
                    }))
                  }
                  onAddShape={(s: any) =>
                    updateBookStats(activeBookId!, (p) => {
                      const id =
                        s.id ||
                        `shape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                      const createdAt = s.createdAt || new Date().toISOString();
                      return {
                        ...p,
                        shapes: [...p.shapes, { ...s, id, createdAt }],
                        lastReadTime: new Date().toISOString(),
                      };
                    })
                  }
                  onDeleteShape={(id: string) =>
                    updateBookStats(activeBookId!, (p) => ({
                      ...p,
                      shapes: p.shapes.filter(
                        (s, idx) =>
                          (s.id || `legacy-shape-${idx}-${s.page}`) !== id,
                      ),
                      lastReadTime: new Date().toISOString(),
                    }))
                  }
                  onAddTextBox={(t: any) =>
                    updateBookStats(activeBookId!, (p) => {
                      const id =
                        t.id ||
                        `tb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                      const createdAt = t.createdAt || new Date().toISOString();
                      return {
                        ...p,
                        textBoxes: [...p.textBoxes, { ...t, id, createdAt }],
                        lastReadTime: new Date().toISOString(),
                      };
                    })
                  }
                  onDeleteTextBox={(id: string) =>
                    updateBookStats(activeBookId!, (p) => ({
                      ...p,
                      textBoxes: p.textBoxes.filter(
                        (t, idx) =>
                          (t.id || `legacy-tb-${idx}-${t.page}`) !== id,
                      ),
                      lastReadTime: new Date().toISOString(),
                    }))
                  }
                  selectedNoteId={selectedNoteId}
                  onClearSelectedNoteId={() => setSelectedNoteId(null)}
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

              {/* Markdown Portion */}
              <div
                className={`h-full ${
                  viewMode === "markdown"
                    ? "w-full"
                    : viewMode === "split"
                      ? "w-1/2"
                      : "hidden"
                }`}
              >
                <MarkdownReader
                  markdown={activeMarkdown}
                  isLoading={loadingMarkdown}
                  bookTitle={currentBook?.name}
                  onStartIndexing={() =>
                    activeBookId && startIndexing(activeBookId)
                  }
                />
              </div>
            </div>
          ) : activeBookId ? (
            /* Document is selected and downloading */
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="relative flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-14 w-14 border-3 border-stone-200 dark:border-stone-800 border-t-[#fa5d19]" />
                <FileText size={22} className="absolute text-[#fa5d19]" />
              </div>
              <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1">
                Opening{" "}
                {currentBook?.name
                  ? currentBook.name.replace(/\.[^/.]+$/, "")
                  : "Document"}
                …
              </h3>
              <p className="text-xs font-mono text-stone-400 animate-pulse">
                Fetching document from cloud storage
              </p>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-[#fa5d19]/10 text-[#fa5d19] mb-4 shadow-sm">
                <BookOpen size={36} />
              </div>
              <h3 className="text-base font-semibold mb-1.5 text-stone-900 dark:text-stone-100">
                Welcome to CloudReader
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed mb-5">
                Select a document from your library, or upload a PDF to start
                reading, taking smart notes, and chatting with AI.
              </p>
              <Button onClick={() => setSidebarOpen(true)} className="mb-4">
                Open Library
              </Button>
              <div className="p-3 bg-[#fa5d19]/5 rounded-xl border border-[#fa5d19]/15 text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed text-left">
                <Sparkles size={13} className="text-[#fa5d19] inline mr-1" />
                Featuring AI Research Assistant, intelligent vector search (⌘K),
                and instant page citations.
              </div>
            </div>
          )}

          {/* ── On-Demand Interactive Animation Studio Window ── */}
          <AnimationStudioWindow onJumpToPage={handleChangePage} />
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
            annotationsOpen ? "translate-x-0" : "translate-x-full md:hidden"
          }`}
        >
          <AnnotationPanel
            highlights={currentHighlights}
            notes={currentNotes}
            inkStrokes={currentInkStrokes}
            shapes={currentShapes}
            textBoxes={currentTextBoxes}
            onPageSelect={(pageNumber: number, noteId?: string) => {
              handleChangePage(pageNumber);
              if (noteId) {
                setSelectedNoteId(noteId);
              }
            }}
            onDeleteHighlight={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                highlights: p.highlights.filter(
                  (h, idx) => (h.id || `legacy-hl-${idx}-${h.page}`) !== id,
                ),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteNote={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                notes: p.notes.filter(
                  (n, idx) =>
                    (n.id || `legacy-note-${idx}-${n.page}-${n.x}`) !== id,
                ),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteInkStroke={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                inkStrokes: p.inkStrokes.filter(
                  (s, idx) => (s.id || `legacy-ink-${idx}-${s.page}`) !== id,
                ),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteShape={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                shapes: p.shapes.filter(
                  (s, idx) => (s.id || `legacy-shape-${idx}-${s.page}`) !== id,
                ),
                lastReadTime: new Date().toISOString(),
              }))
            }
            onDeleteTextBox={(id: string) =>
              updateBookStats(activeBookId, (p) => ({
                ...p,
                textBoxes: p.textBoxes.filter(
                  (t, idx) => (t.id || `legacy-tb-${idx}-${t.page}`) !== id,
                ),
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
