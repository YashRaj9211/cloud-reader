import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Highlighter,
  MessageSquare,
  MousePointer,
  Trash2,
  X,
  Maximize,
  Minimize,
  Pen,
  Square,
  Circle,
  Minus,
  MoveRight,
  Type,
  AlignJustify,
  Eraser,
  ScrollText,
  FileText,
  ChevronDown,
  Shapes,
} from 'lucide-react';
import {
  Highlight,
  StickyNote,
  InkStroke,
  ShapeAnnotation,
  ShapeKind,
  TextBox,
} from '../types';
import ThumbnailSidebar from './ThumbnailSidebar';
import PDFPageItem, { ToolMode, AnnotationData, AnnotationHandlers } from './PDFPageItem';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ─── Configuration ──────────────────────────────────────────────────────────
// How many pages to render above and below the current page in continuous mode.
// A wider window (5) prevents unmounting pages currently within user view or close by,
// eliminating scroll stutter, abrupt height changes, and canvas re-renders.
const PRELOAD_WINDOW = 5;

// ─── Types ───────────────────────────────────────────────────────────────────

interface PDFReaderProps extends AnnotationData, AnnotationHandlers {
  pdfData: ArrayBuffer;
  currentPage: number;
  onChangePage: (page: number) => void;
  onDocumentLoad?: (numPages: number) => void;
  darkMode: boolean;
  selectedNoteId?: string | null;
  onClearSelectedNoteId?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PDFReader({
  pdfData,
  currentPage,
  onChangePage,
  highlights,
  notes,
  inkStrokes,
  shapes,
  textBoxes,
  onAddHighlight,
  onDeleteHighlight,
  onAddNote,
  onDeleteNote,
  onAddInkStroke,
  onDeleteInkStroke,
  onAddShape,
  onDeleteShape,
  onAddTextBox,
  onDeleteTextBox,
  onDocumentLoad,
  darkMode,
  selectedNoteId,
  onClearSelectedNoteId,
}: PDFReaderProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<any>(null);
  const resizeDebounceRef = useRef<any>(null);

  // ── PDF state ─────────────────────────────────────────────────────────────
  const [pdf, setPdf] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 800
  );

  // ── Page height cache — used to keep spacers the right size ───────────────
  // Keyed by `${pageNum}-${zoom}`, updated as pages render
  const pageSizeCache = useRef<Map<string, { w: number; h: number }>>(new Map());

  // ── View Mode: Continuous Scroll vs Single Page ───────────────────────────
  const [isContinuous, setIsContinuous] = useState<boolean>(true);

  // ── Tool & zoom state ─────────────────────────────────────────────────────
  const [toolMode, setToolMode] = useState<ToolMode>('view');
  const [activeShape, setActiveShape] = useState<ShapeKind>('rect');
  const [zoom, setZoom] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [thumbnailOpen, setThumbnailOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );

  // ── Annotation colours & sizes ────────────────────────────────────────────
  const [annotColor, setAnnotColor] = useState<string>('#fa5d19');
  const [inkWidth, setInkWidth] = useState<number>(3);
  const [hlWidth, setHlWidth] = useState<number>(18);

  // ── Dropdown menus for cleaner compact toolbar ───────────────────────────
  const [shapesDropdownOpen, setShapesDropdownOpen] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);

  // ── Selected shape (for delete) ───────────────────────────────────────────
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // ── Selected note card popup state ────────────────────────────────────────
  const [selectedNote, setSelectedNote] = useState<StickyNote | null>(null);

  // ─── Load PDF ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfData || pdfData.byteLength === 0) return;
    setLoading(true);
    // Reset height cache on new document
    pageSizeCache.current.clear();

    const clonedData = new Uint8Array(pdfData.slice(0));
    const task = pdfjsLib.getDocument({
      data: clonedData,
      verbosity: 0,
      cMapUrl: '/pdfjs-cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs-standard-fonts/',
      wasmUrl: '/pdfjs-wasm/',
    });

    let isCancelled = false;

    task.promise.then(
      (doc) => {
        if (isCancelled) {
          doc.destroy();
          return;
        }
        setPdf(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
        if (onDocumentLoad) {
          onDocumentLoad(doc.numPages);
        }
        if (currentPage > doc.numPages) onChangePage(1);
      },
      (err) => {
        if (!isCancelled) {
          console.error('PDF load error:', err);
          setLoading(false);
        }
      }
    );

    return () => {
      isCancelled = true;
      task.destroy().catch(() => {});
    };
  }, [pdfData]);

  // ─── Container resize observer (debounced to avoid thrashing) ────────────
  const isFirstResize = useRef<boolean>(true);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0) {
          const newWidth = e.contentRect.width;
          if (isFirstResize.current) {
            isFirstResize.current = false;
            setContainerWidth(newWidth);
            return;
          }
          // Debounce: only commit width after 150ms of no resize events
          if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
          resizeDebounceRef.current = setTimeout(() => {
            setContainerWidth((prev) => {
              // Only update if width meaningfully changed (> 5px) to avoid
              // triggering canvas re-renders for hairline layout changes
              if (Math.abs(newWidth - prev) > 5) return newWidth;
              return prev;
            });
          }, 150);
        }
      }
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    };
  }, []);

  // ─── Mobile Touch Gestures: Pinch-to-zoom & Double-tap Zoom ───────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let initialPinchDistance = 0;
    let initialZoomOnPinch = 1.0;
    let isPinching = false;
    let lastTapTime = 0;

    const calcDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (toolMode !== 'view') return;

      if (e.touches.length === 2) {
        isPinching = true;
        initialPinchDistance = calcDistance(e.touches);
        initialZoomOnPinch = zoom;
      } else if (e.touches.length === 1) {
        // Do not double-tap zoom if user is tapping or selecting text inside the text layer!
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.closest('.textLayer') ||
            target.closest('.text-selection-bar') ||
            target.closest('button') ||
            target.closest('input'))
        ) {
          return;
        }
        const now = Date.now();
        if (now - lastTapTime < 300) {
          // Double-tap toggle between fit-to-width (1.0) and comfortable mobile reading zoom (1.6)
          setZoom((prev) => (prev <= 1.1 ? 1.6 : 1.0));
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPinching || e.touches.length !== 2 || toolMode !== 'view') return;

      const currentDistance = calcDistance(e.touches);
      if (initialPinchDistance > 0) {
        e.preventDefault();
        const ratio = currentDistance / initialPinchDistance;
        const targetZoom = Math.max(0.4, Math.min(3.0, Math.round(initialZoomOnPinch * ratio * 20) / 20));
        setZoom(targetZoom);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching = false;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [toolMode, zoom]);

  // ─── Fullscreen listener ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Deselect shape when clicking outside
  useEffect(() => {
    const handler = () => setSelectedShapeId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const toggleFullscreen = () => {
    const el = document.getElementById('pdf-reader-root');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // ─── Continuous Scroll: Scroll spy to update currentPage ──────────────────
  useEffect(() => {
    if (!isContinuous || !containerRef.current) return;

    const container = containerRef.current;
    let ticking = false;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          ticking = false;
          if (!container) return;

          const pageElements = container.querySelectorAll<HTMLElement>('.pdf-page-container');
          if (!pageElements.length) return;

          const containerRect = container.getBoundingClientRect();
          const containerMid = containerRect.top + containerRect.height / 3;

          let currentBestPage = currentPage;
          let minDistance = Infinity;

          pageElements.forEach((el) => {
            const pageNum = parseInt(el.dataset.pageNumber || '1', 10);
            const rect = el.getBoundingClientRect();
            const distance = Math.abs(rect.top - containerMid);
            if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
              if (distance < minDistance) {
                minDistance = distance;
                currentBestPage = pageNum;
              }
            }
          });

          if (currentBestPage !== currentPage && currentBestPage >= 1 && currentBestPage <= totalPages) {
            lastScrolledPage.current = currentBestPage;
            onChangePage(currentBestPage);
          }
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isContinuous, currentPage, totalPages, onChangePage]);

  // ─── Scroll target page into view on page change ──────────────────────────
  const scrollToPage = useCallback((pageNum: number, behavior: ScrollBehavior = 'smooth') => {
    if (!containerRef.current) return;
    const targetEl = containerRef.current.querySelector<HTMLElement>(
      `[data-page-number="${pageNum}"]`
    );
    if (targetEl) {
      isScrollingProgrammatically.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      const containerTop = containerRef.current.scrollTop;
      const containerRect = containerRef.current.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const targetScrollTop = containerTop + (targetRect.top - containerRect.top);

      containerRef.current.scrollTo({
        top: targetScrollTop - 16,
        behavior,
      });

      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 700);
    }
  }, []);

  // ─── External page change sync (from AnnotationPanel, search, sidebar, etc.) ─
  const lastScrolledPage = useRef(currentPage);
  useEffect(() => {
    // Only invoke programmatic scrollToPage if this page change was NOT caused by user continuous scrolling
    if (lastScrolledPage.current !== currentPage) {
      lastScrolledPage.current = currentPage;
      if (isContinuous && !isScrollingProgrammatically.current) {
        scrollToPage(currentPage, 'smooth');
      }
    }
  }, [currentPage, isContinuous, scrollToPage]);

  // ─── Selected Note sync (open note card and jump to note on click) ──────────
  useEffect(() => {
    if (selectedNoteId && notes.length > 0) {
      const match = notes.find((n) => n.id === selectedNoteId);
      if (match) {
        setSelectedNote(match);
        if (match.page !== currentPage) {
          onChangePage(match.page);
        }
        if (isContinuous) {
          scrollToPage(match.page, 'smooth');
        }
      }
    }
  }, [selectedNoteId, notes, currentPage, isContinuous, onChangePage, scrollToPage]);

  const handlePageSelectAndScroll = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      onChangePage(pageNum);
      if (isContinuous) {
        scrollToPage(pageNum, 'smooth');
      }
    }
  };

  // ─── Zoom helpers ─────────────────────────────────────────────────────────
  const fitToWidth = useCallback(() => {
    setZoom(1.0);
  }, []);

  const fitToPage = useCallback(() => {
    if (!pdf || !containerRef.current) return;
    pdf.getPage(currentPage).then((page: any) => {
      const vp = page.getViewport({ scale: 1.0 });
      const containerH = containerRef.current!.clientHeight - 32;
      const effectiveW = (containerWidth > 0 ? containerWidth : containerRef.current!.clientWidth) - 32;

      const widthScale = effectiveW / vp.width;
      const heightScale = containerH / vp.height;

      const targetZoom = Math.min(widthScale, heightScale) / widthScale;
      setZoom(Math.max(0.3, Math.min(3.0, targetZoom)));
    }).catch(console.error);
  }, [pdf, currentPage, containerWidth]);

  // ─── Stabilised annotation callbacks (React.memo equality) ───────────────
  const stableOnAddHighlight = useCallback(onAddHighlight, []);
  const stableOnDeleteHighlight = useCallback(onDeleteHighlight, []);
  const stableOnAddNote = useCallback(onAddNote, []);
  const stableOnDeleteNote = useCallback(onDeleteNote, []);
  const stableOnAddInkStroke = useCallback(onAddInkStroke, []);
  const stableOnDeleteInkStroke = useCallback(onDeleteInkStroke, []);
  const stableOnAddShape = useCallback(onAddShape, []);
  const stableOnDeleteShape = useCallback(onDeleteShape, []);
  const stableOnAddTextBox = useCallback(onAddTextBox, []);
  const stableOnDeleteTextBox = useCallback(onDeleteTextBox, []);
  const stableOnSelectShapeId = useCallback(setSelectedShapeId, []);
  const stableOnSelectNote = useCallback(setSelectedNote, []);

  /** Populate the pageSizeCache so spacer divs match real page heights. */
  const handlePageSizeChange = useCallback((num: number, size: { w: number; h: number }) => {
    pageSizeCache.current.set(`${num}-${zoom}`, size);
  // zoom is stable during a single scroll cycle; adding it as a dep is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // ─── Palette & toolbar helpers ────────────────────────────────────────────
  const paletteColors = [
    '#fa5d19', '#ff7a3d', '#10b981', '#ef4444',
    '#3b82f6', '#9061ff', '#ec4899', '#000000',
  ];

  const toolBtn = (
    id: string,
    mode: ToolMode,
    icon: React.ReactNode,
    label: string,
    extraActive?: boolean
  ) => {
    const active = toolMode === mode || extraActive;
    return (
      <button
        id={id}
        onClick={() => {
          setToolMode(mode);
          setSelectedShapeId(null);
        }}
        title={label}
        className={`px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-all ${
          active
            ? 'bg-[#fa5d19] text-white shadow-xs'
            : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white'
        }`}
      >
        {icon}
        <span className="hidden lg:inline">{label}</span>
      </button>
    );
  };

  const shapeBtn = (kind: ShapeKind, icon: React.ReactNode, label: string) => (
    <button
      key={kind}
      onClick={() => {
        setToolMode('shape');
        setActiveShape(kind);
      }}
      title={label}
      className={`p-1.5 rounded-xl flex items-center gap-1 text-xs transition-all ${
        toolMode === 'shape' && activeShape === kind
          ? 'bg-[#fa5d19] text-white shadow-xs'
          : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-white'
      }`}
    >
      {icon}
    </button>
  );

  const divider = <div className="h-5 w-px mx-0.5 bg-(--color-outline-variant)" />;

  // ─── Virtualization: Compute the window of page numbers to mount ──────────
  // In continuous mode we only mount PRELOAD_WINDOW pages above and below the
  // current page. All others are replaced with height-preserving spacers.
  const renderedPageNums = useMemo((): Set<number> => {
    if (!isContinuous) return new Set([currentPage]);
    const start = Math.max(1, currentPage - PRELOAD_WINDOW);
    const end = Math.min(totalPages, currentPage + PRELOAD_WINDOW);
    const set = new Set<number>();
    for (let i = start; i <= end; i++) set.add(i);
    return set;
  }, [isContinuous, currentPage, totalPages]);

  // ─── Shared props object (memoised to avoid object identity churn) ─────────
  const sharedItemProps = useMemo(() => ({
    pdf,
    zoom,
    containerWidth,
    darkMode,
    toolMode,
    activeShape,
    annotColor,
    inkWidth,
    hlWidth,
    highlights,
    notes,
    inkStrokes,
    shapes,
    textBoxes,
    onAddHighlight: stableOnAddHighlight,
    onDeleteHighlight: stableOnDeleteHighlight,
    onAddNote: stableOnAddNote,
    onDeleteNote: stableOnDeleteNote,
    onAddInkStroke: stableOnAddInkStroke,
    onDeleteInkStroke: stableOnDeleteInkStroke,
    onAddShape: stableOnAddShape,
    onDeleteShape: stableOnDeleteShape,
    onAddTextBox: stableOnAddTextBox,
    onDeleteTextBox: stableOnDeleteTextBox,
    selectedShapeId,
    onSelectShapeId: stableOnSelectShapeId,
    onSelectNote: stableOnSelectNote,
    scrollContainer: containerRef.current,
    onPageSizeChange: handlePageSizeChange,
  }), [
    pdf, zoom, containerWidth, darkMode, toolMode, activeShape,
    annotColor, inkWidth, hlWidth,
    highlights, notes, inkStrokes, shapes, textBoxes,
    selectedShapeId,
    stableOnAddHighlight, stableOnDeleteHighlight,
    stableOnAddNote, stableOnDeleteNote,
    stableOnAddInkStroke, stableOnDeleteInkStroke,
    stableOnAddShape, stableOnDeleteShape,
    stableOnAddTextBox, stableOnDeleteTextBox,
    stableOnSelectShapeId, stableOnSelectNote,
    handlePageSizeChange,
  ]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      id="pdf-reader-root"
      className="flex flex-col h-full bg-transparent text-(--color-on-surface) transition-colors duration-300 overflow-hidden relative"
    >
      {/* ── Floating Reading Document Toolbar (Minimalist Clean Floating Style) ── */}
      <div className="z-20 px-3 sm:px-6 pt-3 pb-1 shrink-0 flex justify-center w-full pointer-events-none">
        <div className="flex items-center gap-1.5 sm:gap-2.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border border-stone-200/80 dark:border-stone-700/80 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_-2px_rgba(0,0,0,0.6)] pointer-events-auto select-none">
          {/* 1. Page navigation Pill */}
          <div className="flex items-center gap-0.5 shrink-0 bg-stone-100/80 dark:bg-stone-800/80 p-0.5 rounded-full border border-stone-200/60 dark:border-stone-700/60">
            <button
              id="reader-prev-btn"
              onClick={() => handlePageSelectAndScroll(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="p-1 rounded-full transition-colors text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-700 disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex items-center gap-0.5 text-xs font-medium px-1.5">
              <input
                id="reader-page-jump"
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= totalPages) handlePageSelectAndScroll(v);
                }}
                className="w-7 text-center bg-transparent outline-none font-bold text-[#fa5d19]"
              />
              <span className="text-stone-400 font-normal">/ {totalPages}</span>
            </div>
            <button
              id="reader-next-btn"
              onClick={() => handlePageSelectAndScroll(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="p-1 rounded-full transition-colors text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-700 disabled:opacity-30"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-0.5" />

          {/* 2. Core Reading Tools (Navigate / Highlight / Note / Pen) */}
          <div className="flex items-center gap-1 shrink-0">
            {toolBtn('tool-view', 'view', <MousePointer size={14} />, 'Navigate')}
            {toolBtn('tool-highlight', 'highlight', <Highlighter size={14} />, 'Highlight')}
            {toolBtn('tool-note', 'note', <MessageSquare size={14} />, 'Note')}
            {toolBtn('tool-ink', 'ink', <Pen size={14} />, 'Pen')}

            {/* Shapes Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShapesDropdownOpen((prev) => !prev);
                  setPaletteOpen(false);
                }}
                title="Geometric Shapes & Text"
                className={`px-2.5 py-1.5 rounded-full flex items-center gap-1 text-xs font-semibold transition-all ${
                  toolMode === 'shape' || toolMode === 'textbox'
                    ? 'bg-[#fa5d19] text-white shadow-xs'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <Shapes size={14} />
                <span className="hidden lg:inline capitalize">{toolMode === 'shape' ? activeShape : toolMode === 'textbox' ? 'Text' : 'Shapes'}</span>
                <ChevronDown size={12} className="opacity-70" />
              </button>

              {shapesDropdownOpen && (
                <div className="absolute top-full mt-2 left-0 z-50 p-1.5 bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 flex flex-col gap-1 min-w-[130px] animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      setToolMode('shape');
                      setActiveShape('rect');
                      setSelectedShapeId(null);
                      setShapesDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      toolMode === 'shape' && activeShape === 'rect' ? 'bg-[#fa5d19] text-white' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <Square size={14} />
                    <span>Rectangle</span>
                  </button>
                  <button
                    onClick={() => {
                      setToolMode('shape');
                      setActiveShape('circle');
                      setSelectedShapeId(null);
                      setShapesDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      toolMode === 'shape' && activeShape === 'circle' ? 'bg-[#fa5d19] text-white' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <Circle size={14} />
                    <span>Circle</span>
                  </button>
                  <button
                    onClick={() => {
                      setToolMode('shape');
                      setActiveShape('line');
                      setSelectedShapeId(null);
                      setShapesDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      toolMode === 'shape' && activeShape === 'line' ? 'bg-[#fa5d19] text-white' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <Minus size={14} />
                    <span>Line</span>
                  </button>
                  <button
                    onClick={() => {
                      setToolMode('shape');
                      setActiveShape('arrow');
                      setSelectedShapeId(null);
                      setShapesDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      toolMode === 'shape' && activeShape === 'arrow' ? 'bg-[#fa5d19] text-white' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <MoveRight size={14} />
                    <span>Arrow</span>
                  </button>
                  <div className="h-px bg-stone-200 dark:bg-stone-800 my-0.5" />
                  <button
                    onClick={() => {
                      setToolMode('textbox');
                      setSelectedShapeId(null);
                      setShapesDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      toolMode === 'textbox' ? 'bg-[#fa5d19] text-white' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <Type size={14} />
                    <span>Text Box</span>
                  </button>
                  <button
                    onClick={() => {
                      setToolMode('eraser');
                      setSelectedShapeId(null);
                      setShapesDropdownOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      toolMode === 'eraser' ? 'bg-[#fa5d19] text-white' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <Eraser size={14} />
                    <span>Eraser</span>
                  </button>
                </div>
              )}
            </div>

            {/* Colour Picker Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setPaletteOpen((prev) => !prev);
                  setShapesDropdownOpen(false);
                }}
                title="Annotation Color"
                className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-stone-800 shadow-xs transition-transform hover:scale-110"
                style={{ backgroundColor: annotColor }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white/70 shadow-xs" />
              </button>

              {paletteOpen && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-2 bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 grid grid-cols-4 gap-2 animate-in fade-in zoom-in-95 duration-100">
                  {paletteColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setAnnotColor(c);
                        setPaletteOpen(false);
                      }}
                      title={c}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                        annotColor === c ? 'scale-110 ring-2 ring-[#fa5d19] border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-0.5" />

          {/* 3. Zoom Controls & View Mode Stepper */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setZoom((p) => Math.max(0.4, p - 0.1))}
              className="p-1 rounded-full transition-colors text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => setZoom((p) => (p !== 1.0 ? 1.0 : 1.5))}
              className="text-[11px] font-mono px-2 py-0.5 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-center text-stone-700 dark:text-stone-300 font-semibold cursor-pointer"
              title="Click to toggle fit (100%) / 150%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((p) => Math.min(3.0, p + 0.1))}
              className="p-1 rounded-full transition-colors text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-0.5" />

          {/* 4. Secondary actions (Thumbnail Pages & Fullscreen) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsContinuous((prev) => !prev)}
              title={isContinuous ? 'Switch to Single Page' : 'Switch to Continuous'}
              className="p-1.5 rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              {isContinuous ? <ScrollText size={14} /> : <FileText size={14} />}
            </button>
            <button
              onClick={() => setThumbnailOpen((p) => !p)}
              title="Toggle Page Thumbnails"
              className={`p-1.5 rounded-full transition-all text-xs ${
                thumbnailOpen
                  ? 'bg-[#fa5d19] text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <AlignJustify size={14} />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="p-1.5 rounded-full transition-colors text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Mobile backdrop for thumbnail sidebar */}
        {thumbnailOpen && pdf && !loading && (
          <div
            onClick={() => setThumbnailOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 md:hidden"
          />
        )}

        {/* Thumbnail sidebar */}
        {thumbnailOpen && pdf && !loading && (
          <div className="fixed inset-y-0 left-0 z-40 md:static md:z-auto h-full shadow-2xl md:shadow-none">
            <ThumbnailSidebar
              pdf={pdf}
              totalPages={totalPages}
              currentPage={currentPage}
              onPageSelect={(page) => {
                handlePageSelectAndScroll(page);
                if (window.innerWidth < 768) {
                  setThumbnailOpen(false);
                }
              }}
              darkMode={darkMode}
            />
          </div>
        )}

        {/* Main scroll / canvas container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-2 sm:p-4 relative bg-stone-100/70 dark:bg-stone-950/70 selection:text-transparent"
        >
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-100/80 dark:bg-stone-900/80 backdrop-blur-sm z-50">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#fa5d19] border-t-transparent" />
              <p className="text-xs font-medium text-stone-600 dark:text-stone-400 animate-pulse">Rendering pages…</p>
            </div>
          )}

          {!loading && pdf && (
            <div className="w-full flex flex-col items-center min-h-full">
              {isContinuous ? (
                // ── Continuous Scroll with Virtualization ──
                // All page numbers are iterated; pages outside the render window
                // are rendered as height-preserving spacer divs instead.
                Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  if (renderedPageNums.has(pageNum)) {
                    return (
                      <PDFPageItem
                        key={pageNum}
                        pageNum={pageNum}
                        {...sharedItemProps}
                      />
                    );
                  }

                  // ── Spacer: preserves scrollbar height without mounting a canvas ──
                  const cacheKey = `${pageNum}-${zoom}`;
                  const cached = pageSizeCache.current.get(cacheKey);
                  // If we have a cached height, use it; otherwise estimate from A4 aspect ratio
                  const spacerH = cached
                    ? cached.h + 24 /* mb-6 */
                    : Math.round((containerWidth - 48) * (297 / 210)) + 24;

                  return (
                    <div
                      key={pageNum}
                      data-page-number={pageNum}
                      data-spacer="true"
                      className="pdf-page-container flex flex-col items-center mb-6 relative w-full"
                      style={{ height: spacerH, minHeight: 400 }}
                    >
                      <div className="text-[11px] font-mono font-medium text-zinc-400 mb-1.5 self-start ml-2 flex items-center gap-1.5 opacity-50">
                        <span className="w-2 h-2 rounded-full bg-zinc-400/30 inline-block" />
                        Page {pageNum}
                      </div>
                      <div
                        className="rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/30 dark:bg-zinc-900/10 w-full flex-1"
                        style={{ minHeight: 400 }}
                      />
                    </div>
                  );
                })
              ) : (
                // ── Single Page Mode ──
                <PDFPageItem
                  key={currentPage}
                  pageNum={currentPage}
                  {...sharedItemProps}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Selected note card ───────────────────────────────────────────── */}
      {selectedNote && (
        <div className="absolute top-20 right-6 z-50 p-4 w-72 rounded-2xl shadow-xl border border-(--color-outline-variant) bg-(--color-surface) text-(--color-on-surface)">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-(--color-outline-variant)">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Note — Page {selectedNote.page}
            </span>
            <button
              onClick={() => {
                setSelectedNote(null);
                onClearSelectedNoteId?.();
              }}
              className="p-1 text-zinc-400 hover:bg-(--color-surface-container-high) rounded"
            >
              <X size={13} />
            </button>
          </div>
          <p className="text-xs wrap-break-word whitespace-pre-wrap select-text leading-relaxed text-(--color-on-surface)">
            {selectedNote.text}
          </p>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-(--color-outline-variant)">
            <span className="text-[10px] font-mono text-zinc-400">
              {selectedNote.createdAt && !isNaN(new Date(selectedNote.createdAt).getTime())
                ? new Date(selectedNote.createdAt).toLocaleDateString()
                : 'Just now'}
            </span>
            <button
              onClick={() => {
                if (window.confirm('Delete note?')) {
                  onDeleteNote(selectedNote.id);
                  setSelectedNote(null);
                  onClearSelectedNoteId?.();
                }
              }}
              className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 font-medium cursor-pointer"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
