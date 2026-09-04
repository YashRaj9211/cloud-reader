import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Highlight,
  StickyNote,
  InkStroke,
  ShapeAnnotation,
  ShapeKind,
  TextBox,
} from '../types';
import { Trash2, X, MessageSquare } from 'lucide-react';

export type ToolMode = 'view' | 'highlight' | 'note' | 'ink' | 'eraser' | 'shape' | 'textbox';

export interface AnnotationData {
  highlights: Highlight[];
  notes: StickyNote[];
  inkStrokes: InkStroke[];
  shapes: ShapeAnnotation[];
  textBoxes: TextBox[];
}

export interface AnnotationHandlers {
  onAddHighlight: (h: Omit<Highlight, 'id' | 'createdAt'>) => void;
  onDeleteHighlight: (id: string) => void;
  onAddNote: (n: Omit<StickyNote, 'id' | 'createdAt'>) => void;
  onDeleteNote: (id: string) => void;
  onAddInkStroke: (s: Omit<InkStroke, 'id' | 'createdAt'>) => void;
  onDeleteInkStroke: (id: string) => void;
  onAddShape: (s: Omit<ShapeAnnotation, 'id' | 'createdAt'>) => void;
  onDeleteShape: (id: string) => void;
  onAddTextBox: (t: Omit<TextBox, 'id' | 'createdAt'>) => void;
  onDeleteTextBox: (id: string) => void;
}

interface PDFPageItemProps extends AnnotationData, AnnotationHandlers {
  key?: React.Key;
  pdf: any;
  pageNum: number;
  zoom: number;
  containerWidth: number;
  darkMode: boolean;
  toolMode: ToolMode;
  activeShape: ShapeKind;
  annotColor: string;
  inkWidth: number;
  hlWidth: number;
  selectedShapeId: string | null;
  onSelectShapeId: (id: string | null) => void;
  onSelectNote: (note: StickyNote | null) => void;
  scrollContainer?: HTMLElement | null;
  /** Optional callback so parent can cache exact page dimensions for spacers */
  onPageSizeChange?: (pageNum: number, size: { w: number; h: number }) => void;
}

function pxToPercent(val: number, total: number) {
  return (val / total) * 100;
}

// ── Detect mobile/low-end device ───────────────────────────────────────────
function getCapDPR(): number {
  if (typeof window === 'undefined') return 1;
  const isMobile = window.innerWidth < 768;
  // Use lower DPR cap on mobile to avoid giant canvases
  const cap = isMobile ? 1.5 : 2.0;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), cap);
}

// ── Page-level render task manager ─────────────────────────────────────────
// Shared map so that even during React StrictMode double-invoke, we can cancel
// the previous task before starting a new one.
const activeRenderTasks = new Map<string, { cancel: () => void }>();

function cancelRenderTask(key: string) {
  const task = activeRenderTasks.get(key);
  if (task) {
    task.cancel();
    activeRenderTasks.delete(key);
  }
}

// ── Text layer task manager ──────────────────────────────────────────────────
// Cancellable TextLayer instance per page, keyed the same way as canvas tasks.
const activeTextTasks = new Map<string, { cancel: () => void }>();

function cancelTextTask(key: string) {
  const task = activeTextTasks.get(key);
  if (task) {
    try { task.cancel(); } catch { /* ignore */ }
    activeTextTasks.delete(key);
  }
}

// ────────────────────────────────────────────────────────────────────────────

function PDFPageItemInner({
  pdf,
  pageNum,
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
  selectedShapeId,
  onSelectShapeId,
  onSelectNote,
  scrollContainer,
  onPageSizeChange,
}: PDFPageItemProps) {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Div that PDF.js TextLayer populates with transparent, selectable spans */
  const textLayerRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver visibility — uses a tight margin for actual DOM render
  const [isVisible, setIsVisible] = useState(false);
  const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Track whether this page has EVER been rendered. Once true, never show the
  // loading skeleton again — a stale canvas is far better than a blank block.
  const hasEverRendered = useRef(false);
  const [rendered, setRendered] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Ink state
  const [inkDrawing, setInkDrawing] = useState(false);
  const inkPointsRef = useRef<{ x: number; y: number }[]>([]);

  // Eraser state
  const [eraserActive, setEraserActive] = useState(false);
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const eraserRadius = 20;
  const eraserPathRef = useRef<{ x: number; y: number }[]>([]);

  // Local popups
  const [notePopup, setNotePopup] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [activeTextBox, setActiveTextBox] = useState<{ x: number; y: number; text: string } | null>(null);

  // ── Text-selection action bar state ──────────────────────────────────────
  interface SelectionBar {
    /** Percentages relative to the page container */
    x: number;
    y: number;
    text: string;
    /** Raw DOMRects for Highlight creation */
    rects: DOMRect[];
  }
  const [selectionBar, setSelectionBar] = useState<SelectionBar | null>(null);

  // Unique render task key for this page instance
  const renderTaskKey = `page-${pageNum}`;

  // ── 1. IntersectionObserver — tight margin for rendering, wide for keeping alive ──
  useEffect(() => {
    const el = pageContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        setIsVisible(visible);

        // When page moves far out of view, evict canvas AND text layer memory
        if (!visible && hasEverRendered.current) {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            // Release backing store memory by zeroing dimensions
            canvas.width = 0;
            canvas.height = 0;
          }
          // Cancel any in-flight render task
          cancelRenderTask(renderTaskKey);
          // Evict text layer DOM & cancel in-flight text task
          cancelTextTask(renderTaskKey);
          if (textLayerRef.current) {
            textLayerRef.current.innerHTML = '';
          }
          // Hide selection bar if shown for this page
          setSelectionBar(null);
        }
      },
      {
        // Preload pages 1000px above/below viewport; evict immediately after that window
        rootMargin: '1000px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Compute aspect ratio / initial dimension placeholder ───────────────
  useEffect(() => {
    if (!pdf) return;
    let isMounted = true;

    pdf.getPage(pageNum).then((page: any) => {
      if (!isMounted) return;
      const unscaled = page.getViewport({ scale: 1.0 });
      const effectiveWidth = containerWidth > 0 ? containerWidth : 800;
      const marginOffset = typeof window !== 'undefined' && window.innerWidth < 768 ? 16 : 48;
      const widthScale = Math.max(0.1, (effectiveWidth - marginOffset) / unscaled.width);
      const scale = widthScale * zoom;
      const vp = page.getViewport({ scale });
      setPageSize({ w: Math.floor(vp.width), h: Math.floor(vp.height) });
    }).catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [pdf, pageNum, zoom, containerWidth]);

  // ── 3. Render canvas when visible ─────────────────────────────────────────
  useEffect(() => {
    if (!pdf || !isVisible || !canvasRef.current) return;

    let isCancelled = false;

    // Cancel any previous in-flight render for this page
    cancelRenderTask(renderTaskKey);

    pdf.getPage(pageNum).then((page: any) => {
      if (isCancelled) return;

      const dpr = getCapDPR();
      const unscaled = page.getViewport({ scale: 1.0 });
      const effectiveWidth = containerWidth > 0 ? containerWidth : 800;
      const marginOffset = typeof window !== 'undefined' && window.innerWidth < 768 ? 16 : 48;
      const widthScale = Math.max(0.1, (effectiveWidth - marginOffset) / unscaled.width);
      const displayScale = widthScale * zoom;

      const cssVp = page.getViewport({ scale: displayScale });
      const renderVp = page.getViewport({ scale: displayScale * dpr });

      const canvas = canvasRef.current;
      if (!canvas || isCancelled) return;

      const cssW = Math.floor(cssVp.width);
      const cssH = Math.floor(cssVp.height);

      // Only resize canvas if dimensions actually changed (avoid expensive realloc)
      const newW = Math.floor(renderVp.width);
      const newH = Math.floor(renderVp.height);
      if (canvas.width !== newW) canvas.width = newW;
      if (canvas.height !== newH) canvas.height = newH;

      if (inkCanvasRef.current) {
        if (inkCanvasRef.current.width !== cssW) inkCanvasRef.current.width = cssW;
        if (inkCanvasRef.current.height !== cssH) inkCanvasRef.current.height = cssH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx || isCancelled) return;

      const task = page.render({ canvasContext: ctx, viewport: renderVp });

      // Register in the global task map so the next effect cleanup can cancel it
      activeRenderTasks.set(renderTaskKey, {
        cancel: () => {
          try { task.cancel(); } catch { /* ignore */ }
        },
      });

      task.promise.then(() => {
        if (!isCancelled) {
          activeRenderTasks.delete(renderTaskKey);
          hasEverRendered.current = true;
          setRendered(true);
          const newSize = { w: cssW, h: cssH };
          setPageSize(newSize);
          onPageSizeChange?.(pageNum, newSize);
        }
      }).catch((err: any) => {
        activeRenderTasks.delete(renderTaskKey);
        if (err && err.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      });
    }).catch(console.error);

    return () => {
      isCancelled = true;
      cancelRenderTask(renderTaskKey);
      // Do NOT reset rendered or zero canvas dimensions here.
      // Keeping the stale canvas visible prevents blank blocks from appearing
      // while the page is being re-rendered after scrolling back into view.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, zoom, containerWidth, isVisible]);

  // ── 4. Render text layer when visible ─────────────────────────────────────
  // Runs independently of the canvas render. A cancellable TextLayer instance
  // streams text spans into textLayerRef and positions them with CSS variables
  // that match the CSS viewport (cssVp), so text aligns with the rendered PDF.
  useEffect(() => {
    const container = textLayerRef.current;
    if (!pdf || !isVisible || !container) return;

    let isCancelled = false;

    // Cancel any in-flight text task for this page before starting a new one
    cancelTextTask(renderTaskKey);

    pdf.getPage(pageNum).then((page: any) => {
      if (isCancelled || !textLayerRef.current) return;

      const unscaled = page.getViewport({ scale: 1.0 });
      const effectiveWidth = containerWidth > 0 ? containerWidth : 800;
      const marginOffset = typeof window !== 'undefined' && window.innerWidth < 768 ? 16 : 48;
      const widthScale = Math.max(0.1, (effectiveWidth - marginOffset) / unscaled.width);
      const displayScale = widthScale * zoom;
      const cssVp = page.getViewport({ scale: displayScale });

      // Clear previous text layer content
      container.innerHTML = '';

      // Provide --scale-factor so setLayerDimensions (called inside TextLayer
      // constructor) can derive --total-scale-factor = scale-factor * user-unit
      container.style.setProperty('--scale-factor', String(displayScale));
      // total-scale-factor: PDF.js web/pdf_viewer.css defines this as
      // calc(var(--scale-factor) * var(--user-unit)), but we're not using the
      // full web viewer wrapper, so set it directly.
      container.style.setProperty('--total-scale-factor', String(displayScale));

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: cssVp,
      });

      activeTextTasks.set(renderTaskKey, {
        cancel: () => { try { textLayer.cancel(); } catch { /* ignore */ } },
      });

      textLayer.render().then(() => {
        if (!isCancelled) {
          activeTextTasks.delete(renderTaskKey);
        }
      }).catch((err: any) => {
        activeTextTasks.delete(renderTaskKey);
        if (err && err.name !== 'AbortException' && err.message !== 'TextLayer task cancelled.') {
          console.error(`Page ${pageNum} text layer error:`, err);
        }
      });
    }).catch(console.error);

    return () => {
      isCancelled = true;
      cancelTextTask(renderTaskKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, zoom, containerWidth, isVisible]);

  // ── 5. Text-selection listener ────────────────────────────────────────────
  // In view mode, listens for mouseup events on the text layer and computes the
  // selection bounds as page-relative percentages to show the action bar.
  const handleTextLayerMouseUp = useCallback(() => {
    if (toolMode !== 'view') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelectionBar(null);
      return;
    }
    const container = textLayerRef.current;
    if (!container) { setSelectionBar(null); return; }

    // Ensure the selection is actually within this page's text layer
    const anchorNode = sel.anchorNode;
    if (!anchorNode || !container.contains(anchorNode)) {
      setSelectionBar(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    if (rects.length === 0) { setSelectionBar(null); return; }

    const pageBox = container.getBoundingClientRect();
    // Position the bar just above the first (topmost) rect of the selection
    const topRect = rects.reduce((a, b) => a.top < b.top ? a : b);
    const barX = ((topRect.left + topRect.right) / 2 - pageBox.left) / pageBox.width * 100;
    const barY = (topRect.top - pageBox.top) / pageBox.height * 100;

    setSelectionBar({
      x: Math.min(Math.max(barX, 5), 95),
      y: Math.max(barY - 5, 1), // 5% above the selection, at least 1%
      text: sel.toString(),
      rects,
    });
  }, [toolMode]);

  // ── Clear selection bar when tool mode changes or selection collapses ──────
  useEffect(() => {
    setSelectionBar(null);
    if (toolMode !== 'view') {
      window.getSelection()?.removeAllRanges();
    }
  }, [toolMode]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionBar(null);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // ── Filtered annotation data for this page ─────────────────────────────────
  const pageHighlights = highlights.filter((h) => h.page === pageNum);
  const pageNotes = notes.filter((n) => n.page === pageNum);
  const pageInkStrokes = inkStrokes.filter((s) => s.page === pageNum);
  const pageShapes = shapes.filter((s) => s.page === pageNum);
  const pageTextBoxes = textBoxes.filter((t) => t.page === pageNum);

  const getRelPos = (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX - rect.left, y: e.changedTouches[0].clientY - rect.top };
    }
    const me = e as React.MouseEvent<HTMLElement>;
    return { x: me.clientX - rect.left, y: me.clientY - rect.top };
  };

  const drawOnInkCanvas = (
    x: number,
    y: number,
    start: boolean,
    width: number,
    color: string,
    opacity: number
  ) => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (start) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const clearInkCanvas = () => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // ── Unified Stroke handlers (Ink & Highlight) ─────────────────────────────
  const isHighlighter = toolMode === 'highlight';
  const currentStrokeWidth = isHighlighter ? hlWidth : inkWidth;
  const currentOpacity = isHighlighter ? 0.35 : 1.0;

  const onStrokeDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setInkDrawing(true);
    inkPointsRef.current = [{ x, y }];
    drawOnInkCanvas(x, y, true, currentStrokeWidth, annotColor, currentOpacity);
  };

  const onStrokeMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!inkDrawing) return;
    const { x, y } = getRelPos(e);
    inkPointsRef.current.push({ x, y });
    drawOnInkCanvas(x, y, false, currentStrokeWidth, annotColor, currentOpacity);
  };

  const onStrokeUp = () => {
    if (!inkDrawing || !overlayRef.current) return;
    setInkDrawing(false);
    clearInkCanvas();
    const rect = overlayRef.current.getBoundingClientRect();
    if (inkPointsRef.current.length > 1) {
      onAddInkStroke({
        id: `ink-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        page: pageNum,
        points: inkPointsRef.current.map((p) => ({
          x: pxToPercent(p.x, rect.width),
          y: pxToPercent(p.y, rect.height),
        })),
        color: annotColor,
        width: currentStrokeWidth,
        opacity: currentOpacity,
        isHighlight: isHighlighter,
        createdAt: new Date().toISOString(),
      } as any);
    }
    inkPointsRef.current = [];
  };

  // ── Eraser ────────────────────────────────────────────────────────────────
  const onEraserDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setEraserActive(true);
    setEraserPos({ x, y });
    eraserPathRef.current = [{ x, y }];
  };

  const onEraserMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setEraserPos({ x, y });
    if (!eraserActive) return;
    eraserPathRef.current.push({ x, y });
  };

  const onEraserUp = useCallback(() => {
    if (!eraserActive || !overlayRef.current) return;
    setEraserActive(false);
    const rect = overlayRef.current.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    const eraserPctPath = eraserPathRef.current.map((p) => ({
      x: pxToPercent(p.x, W),
      y: pxToPercent(p.y, H),
    }));

    const radiusPctX = pxToPercent(eraserRadius, W);
    const radiusPctY = pxToPercent(eraserRadius, H);

    const strokesToDelete = pageInkStrokes.filter((stroke) =>
      stroke.points.some((sp) =>
        eraserPctPath.some((ep) => {
          const dx = (sp.x - ep.x) / radiusPctX;
          const dy = (sp.y - ep.y) / radiusPctY;
          return dx * dx + dy * dy <= 1;
        })
      )
    );

    strokesToDelete.forEach((s) => onDeleteInkStroke(s.id));
    eraserPathRef.current = [];
  }, [eraserActive, pageInkStrokes, onDeleteInkStroke]);

  const onEraserLeave = () => {
    setEraserPos(null);
    if (eraserActive) onEraserUp();
  };

  // ── Shapes ────────────────────────────────────────────────────────────────
  const onShapeDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setIsDrawing(true);
    setDragStart({ x, y });
    setDragRect({ x, y, w: 0, h: 0 });
  };

  const onShapeMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragStart) return;
    const { x, y } = getRelPos(e);
    setDragRect({
      x: Math.min(dragStart.x, x),
      y: Math.min(dragStart.y, y),
      w: Math.abs(x - dragStart.x),
      h: Math.abs(y - dragStart.y),
    });
  };

  const onShapeUp = () => {
    if (!isDrawing || !dragRect || !overlayRef.current) return;
    setIsDrawing(false);
    const rect = overlayRef.current.getBoundingClientRect();
    if (dragRect.w > 5 && dragRect.h > 5) {
      onAddShape({
        id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        page: pageNum,
        kind: activeShape,
        x: (dragRect.x / rect.width) * 100,
        y: (dragRect.y / rect.height) * 100,
        width: (dragRect.w / rect.width) * 100,
        height: (dragRect.h / rect.height) * 100,
        color: annotColor,
        strokeWidth: 2,
        createdAt: new Date().toISOString(),
      } as any);
    }
    setDragStart(null);
    setDragRect(null);
  };

  const handlePointerAction = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    phase: 'down' | 'move' | 'up'
  ) => {
    if (toolMode === 'view') return;
    if (phase === 'down') {
      if (toolMode === 'highlight' || toolMode === 'ink') onStrokeDown(e);
      else if (toolMode === 'eraser') onEraserDown(e);
      else if (toolMode === 'shape') onShapeDown(e);
    } else if (phase === 'move') {
      if (toolMode === 'highlight' || toolMode === 'ink') onStrokeMove(e);
      else if (toolMode === 'eraser') onEraserMove(e);
      else if (toolMode === 'shape') onShapeMove(e);
    } else if (phase === 'up') {
      if (toolMode === 'highlight' || toolMode === 'ink') onStrokeUp();
      else if (toolMode === 'eraser') onEraserUp();
      else if (toolMode === 'shape') onShapeUp();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => handlePointerAction(e, 'down');
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => handlePointerAction(e, 'move');
  const handleMouseUp = () => handlePointerAction({} as any, 'up');

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (toolMode === 'view') return;
    e.preventDefault();
    handlePointerAction(e, 'down');
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (toolMode === 'view') return;
    e.preventDefault();
    handlePointerAction(e, 'move');
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (toolMode === 'view') return;
    e.preventDefault();
    handlePointerAction(e, 'up');
    if (toolMode === 'note' || toolMode === 'textbox') {
      placeTextOrNote(e, toolMode);
    }
  };

  const placeTextOrNote = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    mode: 'note' | 'textbox'
  ) => {
    const { x, y } = getRelPos(e);
    const rect = overlayRef.current!.getBoundingClientRect();
    const pos = {
      x: Math.min(80, Math.max(5, (x / rect.width) * 100)),
      y: Math.min(80, Math.max(5, (y / rect.height) * 100)),
    };
    if (mode === 'note') {
      setNotePopup(pos);
      setNoteText('');
    } else {
      setActiveTextBox({ ...pos, text: '' });
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode === 'note' && !isDrawing) {
      placeTextOrNote(e, 'note');
    } else if (toolMode === 'textbox') {
      placeTextOrNote(e, 'textbox');
    } else {
      onSelectShapeId(null);
    }
  };

  const handleSaveNote = () => {
    if (!notePopup || !noteText.trim()) return;
    const now = new Date().toISOString();
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    onAddNote({
      id,
      page: pageNum,
      x: notePopup.x,
      y: notePopup.y,
      color: '#f59e0b',
      text: noteText.trim(),
      createdAt: now,
    } as any);
    setNotePopup(null);
    setNoteText('');
  };

  const handleSaveTextBox = () => {
    if (!activeTextBox || !activeTextBox.text.trim()) {
      setActiveTextBox(null);
      return;
    }
    const now = new Date().toISOString();
    const id = `tb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    onAddTextBox({
      id,
      page: pageNum,
      x: activeTextBox.x,
      y: activeTextBox.y,
      text: activeTextBox.text.trim(),
      color: annotColor,
      fontSize: 13,
      createdAt: now,
    } as any);
    setActiveTextBox(null);
  };

  const renderSvgShape = (
    shape: ShapeAnnotation,
    svgW: number,
    svgH: number,
    interactive = false
  ) => {
    const px = (shape.x / 100) * svgW;
    const py = (shape.y / 100) * svgH;
    const pw = (shape.width / 100) * svgW;
    const ph = (shape.height / 100) * svgH;
    const isSelected = selectedShapeId === shape.id;

    const strokeColor = isSelected ? '#f59e0b' : shape.color;
    const strokeW = isSelected ? shape.strokeWidth + 1.5 : shape.strokeWidth;

    const common: React.SVGAttributes<SVGElement> = {
      fill: 'none',
      stroke: strokeColor,
      strokeWidth: strokeW,
      style: interactive ? { cursor: 'pointer', pointerEvents: 'all' } : {},
      onClick: interactive
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelectShapeId(shape.id === selectedShapeId ? null : shape.id);
          }
        : undefined,
    };

    switch (shape.kind) {
      case 'rect':
        return <rect key={shape.id} x={px} y={py} width={pw} height={ph} {...common} rx={3} />;
      case 'circle':
        return (
          <ellipse
            key={shape.id}
            cx={px + pw / 2}
            cy={py + ph / 2}
            rx={pw / 2}
            ry={ph / 2}
            {...common}
          />
        );
      case 'line':
        return (
          <line key={shape.id} x1={px} y1={py} x2={px + pw} y2={py + ph} {...common} />
        );
      case 'arrow': {
        const markerId = `arrow-${shape.id}`;
        return (
          <g key={shape.id}>
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={strokeColor} />
              </marker>
            </defs>
            <line
              x1={px}
              y1={py + ph / 2}
              x2={px + pw}
              y2={py + ph / 2}
              stroke={strokeColor}
              strokeWidth={strokeW}
              markerEnd={`url(#${markerId})`}
              style={common.style}
              onClick={common.onClick as any}
            />
          </g>
        );
      }
    }
  };

  const inkSvgPath = (stroke: InkStroke, svgW: number, svgH: number) => {
    if (stroke.points.length < 2) return null;
    const d = stroke.points
      .map((p, i) => {
        const x = (p.x / 100) * svgW;
        const y = (p.y / 100) * svgH;
        return i === 0 ? `M${x},${y}` : `L${x},${y}`;
      })
      .join(' ');
    return (
      <path
        key={stroke.id}
        d={d}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={stroke.opacity ?? 1}
      />
    );
  };

  const previewShape = () => {
    if (!isDrawing || !dragRect || !pageSize.w || toolMode !== 'shape') return null;
    const svgW = pageSize.w;
    const svgH = pageSize.h;
    const preview: ShapeAnnotation = {
      id: '__preview__',
      page: pageNum,
      kind: activeShape,
      x: (dragRect.x / svgW) * 100,
      y: (dragRect.y / svgH) * 100,
      width: (dragRect.w / svgW) * 100,
      height: (dragRect.h / svgH) * 100,
      color: annotColor,
      strokeWidth: 2,
      createdAt: '',
    };
    return renderSvgShape(preview, svgW, svgH, false);
  };

  const selectedShape = selectedShapeId
    ? pageShapes.find((s) => s.id === selectedShapeId)
    : null;

  const cursorStyle: React.CSSProperties =
    toolMode === 'eraser'
      ? { cursor: 'none' }
      : toolMode === 'view'
      ? { cursor: 'default' }
      : toolMode === 'note'
      ? { cursor: 'cell' }
      : toolMode === 'textbox'
      ? { cursor: 'text' }
      : { cursor: 'crosshair' };

  // In view mode the overlay is invisible to pointer events so the text layer
  // underneath can receive mouse/touch for native text selection.
  const overlayPointerEvents: React.CSSProperties =
    toolMode === 'view' ? { pointerEvents: 'none' } : { pointerEvents: 'auto' };

  // ── Highlight from text selection ─────────────────────────────────────────
  const handleSelectionHighlight = useCallback(() => {
    if (!selectionBar || !textLayerRef.current) return;
    const pageBox = textLayerRef.current.getBoundingClientRect();
    const pw = pageBox.width;
    const ph = pageBox.height;

    // Merge all rects into a single bounding box (simplest correct approach)
    const merged = selectionBar.rects.reduce(
      (acc, r) => ({
        left: Math.min(acc.left, r.left),
        top: Math.min(acc.top, r.top),
        right: Math.max(acc.right, r.right),
        bottom: Math.max(acc.bottom, r.bottom),
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    );

    const x = ((merged.left - pageBox.left) / pw) * 100;
    const y = ((merged.top - pageBox.top) / ph) * 100;
    const width = ((merged.right - merged.left) / pw) * 100;
    const height = ((merged.bottom - merged.top) / ph) * 100;

    onAddHighlight({
      id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      page: pageNum,
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(100 - Math.max(0, x), width),
      height: Math.min(100 - Math.max(0, y), height),
      color: 'rgba(250,200,0,0.35)',
      text: selectionBar.text,
      createdAt: new Date().toISOString(),
    } as any);

    window.getSelection()?.removeAllRanges();
    setSelectionBar(null);
  }, [selectionBar, pageNum, onAddHighlight]);

  const handleSelectionCopy = useCallback(() => {
    if (!selectionBar) return;
    navigator.clipboard.writeText(selectionBar.text).catch(console.error);
    window.getSelection()?.removeAllRanges();
    setSelectionBar(null);
  }, [selectionBar]);

  const handleSelectionNote = useCallback(() => {
    if (!selectionBar) return;
    setNotePopup({ x: selectionBar.x, y: selectionBar.y });
    setNoteText(selectionBar.text);
    window.getSelection()?.removeAllRanges();
    setSelectionBar(null);
  }, [selectionBar]);

  return (
    <div
      ref={pageContainerRef}
      data-page-number={pageNum}
      className="pdf-page-container flex flex-col items-center mb-6 relative"
    >
      {/* Page indicator pill above each page in continuous scroll */}
      <div className="text-[11px] font-mono font-medium text-zinc-400 mb-1.5 self-start ml-2 flex items-center gap-1.5 opacity-75">
        <span className="w-2 h-2 rounded-full bg-amber-500/60 inline-block" />
        Page {pageNum}
      </div>

      <div
        className="relative rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 bg-white transition-all overflow-hidden"
        style={{
          width: pageSize.w > 0 ? pageSize.w : '100%',
          height: pageSize.h > 0 ? pageSize.h : 900,
          minHeight: 400,
        }}
      >
        {/* Placeholder skeleton — only shown on first load, never after re-renders */}
        {!rendered && !hasEverRendered.current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-900/60 animate-pulse text-zinc-400">
            <span className="text-xs font-mono">Loading page {pageNum}…</span>
          </div>
        )}

        {/* 1 ── PDF Page Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            filter: darkMode ? 'invert(0.92) hue-rotate(180deg) brightness(1.05) contrast(0.95)' : 'none',
            display: 'block',
            width: pageSize.w > 0 ? pageSize.w : 'auto',
            height: pageSize.h > 0 ? pageSize.h : 'auto',
          }}
        />

        {/* 1b ── Text Layer — transparent, selectable spans from PDF.js TextLayer */}
        {/* z-index: 5 (defined in .textLayer CSS), above canvas (0), below SVG (10) */}
        <div
          ref={textLayerRef}
          className="textLayer selection:text-transparent"
          onMouseUp={handleTextLayerMouseUp}
        />

        {/* Selection Action Bar */}
        {selectionBar && toolMode === 'view' && (
          <div
            className="text-selection-bar"
            style={{
              left: `${selectionBar.x}%`,
              top: `calc(${selectionBar.y}% - 36px)`,
              transform: 'translateX(-50%)',
            }}
          >
            <button className="selbar-highlight" title="Highlight selected text" onClick={handleSelectionHighlight}>
              ✦ Highlight
            </button>
            <div className="selbar-sep" />
            <button className="selbar-copy" title="Copy selected text" onClick={handleSelectionCopy}>
              ⌘ Copy
            </button>
            <div className="selbar-sep" />
            <button className="selbar-note" title="Add note from selection" onClick={handleSelectionNote}>
              ✎ Note
            </button>
          </div>
        )}

        {/* 2 ── SVG Annotation Layer */}
        {pageSize.w > 0 && (
          <svg
            ref={svgRef}
            className="absolute inset-0 z-10"
            width={pageSize.w}
            height={pageSize.h}
            viewBox={`0 0 ${pageSize.w} ${pageSize.h}`}
            style={{ overflow: 'visible', pointerEvents: 'none' }}
          >
            {/* Legacy rect highlights */}
            {pageHighlights.map((h) => (
              <rect
                key={h.id}
                x={`${h.x}%`}
                y={`${h.y}%`}
                width={`${h.width}%`}
                height={`${h.height}%`}
                fill={h.color}
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onDoubleClick={() => {
                  if (window.confirm('Delete highlight?')) onDeleteHighlight(h.id);
                }}
              />
            ))}

            {/* Ink strokes + freehand highlights */}
            {pageInkStrokes.map((s) => inkSvgPath(s, pageSize.w, pageSize.h))}

            {/* Shapes */}
            {pageShapes.map((s) =>
              renderSvgShape(s, pageSize.w, pageSize.h, toolMode === 'view')
            )}

            {/* Live shape preview while dragging */}
            {previewShape()}
          </svg>
        )}

        {/* 3 ── Live Ink / Highlight temporary canvas */}
        <canvas
          ref={inkCanvasRef}
          className="absolute inset-0 z-20 pointer-events-none"
          style={{ display: (toolMode === 'ink' || toolMode === 'highlight') ? 'block' : 'none' }}
        />

        {/* 4 ── Interactive Overlay */}
        {/* pointer-events: none in view mode — lets the text layer receive events for selection */}
        <div
          ref={overlayRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={toolMode === 'eraser' ? onEraserLeave : undefined}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleOverlayClick}
          className={`absolute inset-0 z-30 ${toolMode !== 'view' ? 'touch-drawing-surface select-none' : ''}`}
          style={{ ...cursorStyle, ...overlayPointerEvents }}
        >
          {/* Eraser cursor ring */}
          {toolMode === 'eraser' && eraserPos && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-red-400 bg-red-400/10"
              style={{
                width: eraserRadius * 2,
                height: eraserRadius * 2,
                left: eraserPos.x - eraserRadius,
                top: eraserPos.y - eraserRadius,
                transition: 'left 0ms, top 0ms',
              }}
            />
          )}

          {/* Selected shape delete bar */}
          {selectedShape && pageSize.w > 0 && (
            <div
              className="absolute z-50 flex items-center gap-1.5 pointer-events-auto"
              style={{
                left: `${selectedShape.x}%`,
                top: `calc(${selectedShape.y}% - 28px)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-lg shadow-lg border text-xs font-medium ${
                  darkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'
                }`}
              >
                <span className="text-zinc-500 text-[10px] capitalize">{selectedShape.kind}</span>
                <button
                  onClick={() => {
                    onDeleteShape(selectedShape.id);
                    onSelectShapeId(null);
                  }}
                  className="flex items-center gap-0.5 text-red-500 hover:text-red-600 ml-1 font-semibold"
                  title="Delete shape"
                >
                  <Trash2 size={11} />
                  <span>Delete</span>
                </button>
                <button
                  onClick={() => onSelectShapeId(null)}
                  className="text-zinc-400 hover:text-zinc-600 ml-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Sticky Notes */}
          {pageNotes.map((note) => (
            <div
              key={note.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNote(note);
              }}
              className="absolute z-40 p-1.5 rounded-full bg-[#fa5d19] hover:bg-[#ff7a3d] border-2 border-white text-white shadow-md cursor-pointer transition-transform hover:scale-110 pointer-events-auto"
              style={{ left: `${note.x}%`, top: `${note.y}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'auto' }}
              title="Click to view note"
            >
              <MessageSquare size={12} className="fill-white" />
            </div>
          ))}

          {/* Text Boxes */}
          {pageTextBoxes.map((tb) => (
            <div
              key={tb.id}
              className="absolute z-40 group pointer-events-auto"
              style={{ left: `${tb.x}%`, top: `${tb.y}%`, pointerEvents: 'auto' }}
            >
              <div
                className="px-1.5 py-0.5 rounded border text-xs whitespace-pre-wrap max-w-50 shadow-sm"
                style={{
                  color: tb.color,
                  fontSize: tb.fontSize,
                  borderColor: tb.color + '55',
                  backgroundColor: tb.color + '12',
                }}
              >
                {tb.text}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTextBox(tb.id);
                }}
                className="absolute -top-2 -right-2 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X size={8} />
              </button>
            </div>
          ))}

          {/* Note placement popup */}
          {notePopup && (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute z-50 p-4 w-64 rounded-xl shadow-2xl border border-(--color-outline-variant) bg-(--color-surface) text-(--color-on-surface) pointer-events-auto"
              style={{
                left: `${Math.max(2, Math.min(notePopup.x, 70))}%`,
                top: `${Math.max(2, Math.min(notePopup.y, 80))}%`,
                pointerEvents: 'auto',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-zinc-500">Add Sticky Note</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotePopup(null);
                    setNoteText('');
                  }}
                  className="p-1 rounded hover:bg-(--color-surface-container-high) text-zinc-400 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
              <textarea
                rows={3}
                placeholder="Type your note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSaveNote();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setNotePopup(null);
                    setNoteText('');
                  }
                }}
                className="input-field w-full text-xs p-2 resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotePopup(null);
                    setNoteText('');
                  }}
                  className="btn-secondary h-7! px-2.5! py-0! text-[11px]! cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveNote();
                  }}
                  disabled={!noteText.trim()}
                  className="btn-primary h-7! px-2.5! py-0! text-[11px]! cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Text Box placement popup */}
          {activeTextBox && (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute z-50 pointer-events-auto"
              style={{
                left: `${activeTextBox.x}%`,
                top: `${activeTextBox.y}%`,
                pointerEvents: 'auto',
              }}
            >
              <textarea
                rows={2}
                autoFocus
                placeholder="Type text…"
                value={activeTextBox.text}
                onChange={(e) => setActiveTextBox({ ...activeTextBox, text: e.target.value })}
                onBlur={handleSaveTextBox}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setActiveTextBox(null);
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveTextBox();
                  }
                }}
                className="text-xs px-2 py-1 rounded border min-w-30 outline-none resize-none shadow-md"
                style={{
                  color: annotColor,
                  borderColor: annotColor + '88',
                  backgroundColor: 'var(--color-surface)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── React.memo: prevents re-render unless props that actually affect rendering change.
// Annotation callbacks and color/tool state changes won't cause canvas re-renders.
export default React.memo(PDFPageItemInner);
