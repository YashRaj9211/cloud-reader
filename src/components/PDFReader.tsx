import React, { useEffect, useRef, useState, useCallback } from 'react';
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

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolMode = 'view' | 'highlight' | 'note' | 'ink' | 'eraser' | 'shape' | 'textbox';

interface PDFReaderProps {
  pdfData: ArrayBuffer;
  currentPage: number;
  onChangePage: (page: number) => void;
  highlights: Highlight[];
  notes: StickyNote[];
  inkStrokes: InkStroke[];
  shapes: ShapeAnnotation[];
  textBoxes: TextBox[];
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
  darkMode: boolean;
}

function pxToPercent(val: number, total: number) {
  return (val / total) * 100;
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
  darkMode,
}: PDFReaderProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ── PDF state ─────────────────────────────────────────────────────────────
  const [pdf, setPdf] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  // svgSize drives SVG overlay dimensions — kept as state so the SVG re-renders
  // when page/zoom changes. The actual canvas is sized imperatively in the effect
  // (never via JSX props) so React never clears the painted canvas.
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Keep a ref alias so the render-effect callback can read the latest size
  // without a stale-closure problem.
  const svgSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // ── Tool & zoom state ─────────────────────────────────────────────────────
  const [toolMode, setToolMode] = useState<ToolMode>('view');
  const [activeShape, setActiveShape] = useState<ShapeKind>('rect');
  const [zoom, setZoom] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [thumbnailOpen, setThumbnailOpen] = useState<boolean>(true);

  // ── Annotation colours & sizes ────────────────────────────────────────────
  const [annotColor, setAnnotColor] = useState<string>('#f59e0b');
  const [inkWidth, setInkWidth] = useState<number>(3);
  const [hlWidth, setHlWidth] = useState<number>(18); // highlighter brush width

  // ── Shared drag / draw state ──────────────────────────────────────────────
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ── Ink / Highlight freehand state ────────────────────────────────────────
  const [inkDrawing, setInkDrawing] = useState<boolean>(false);
  const inkPointsRef = useRef<{ x: number; y: number }[]>([]);

  // ── Eraser state ──────────────────────────────────────────────────────────
  const [eraserActive, setEraserActive] = useState<boolean>(false);
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const eraserRadius = 20; // px
  const eraserPathRef = useRef<{ x: number; y: number }[]>([]);

  // ── Shape selection (for delete) ──────────────────────────────────────────
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // ── Sticky note state ─────────────────────────────────────────────────────
  const [notePopup, setNotePopup] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [selectedNote, setSelectedNote] = useState<StickyNote | null>(null);

  // ── Text box state ────────────────────────────────────────────────────────
  const [activeTextBox, setActiveTextBox] = useState<{
    x: number; y: number; text: string;
  } | null>(null);

  // ─── Load PDF ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const task = pdfjsLib.getDocument({
      data: pdfData,
      verbosity: 0,
      cMapUrl: '/pdfjs-cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs-standard-fonts/',
      wasmUrl: '/pdfjs-wasm/',
    });
    task.promise.then(
      (doc) => {
        setPdf(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
        if (currentPage > doc.numPages) onChangePage(1);
      },
      (err) => {
        console.error('PDF load error:', err);
        setLoading(false);
      }
    );
  }, [pdfData]);

  // ─── Container resize ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ─── Render PDF page ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let renderTask: any = null;
    let isCancelled = false;

    pdf.getPage(currentPage).then((page: any) => {
      if (isCancelled) return;

      const unscaled = page.getViewport({ scale: 1.0 });
      // Use the real container width; fall back to 800 when not yet measured
      const effectiveWidth = containerWidth > 0 ? containerWidth : 800;
      const widthScale = (effectiveWidth - 32) / unscaled.width;
      const scale = widthScale * zoom;
      const vp = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas || isCancelled) return;

      // Size canvases imperatively — NEVER via JSX props — so React never
      // resets the canvas content when state changes trigger a re-render.
      canvas.width = vp.width;
      canvas.height = vp.height;

      if (inkCanvasRef.current) {
        inkCanvasRef.current.width = vp.width;
        inkCanvasRef.current.height = vp.height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx || isCancelled) return;

      renderTask = page.render({ canvasContext: ctx, viewport: vp });
      renderTask.promise.then(() => {
        if (isCancelled) return;
        // Only update SVG size state AFTER the render is done so the React
        // re-render caused by setSvgSize does not race with canvas painting.
        const newSize = { w: vp.width, h: vp.height };
        svgSizeRef.current = newSize;
        setSvgSize(newSize);
      }).catch((err: any) => {
        if (err && err.name !== 'RenderingCancelledException') {
          console.error('PDF rendering error:', err);
        }
      });
    }).catch((err: any) => {
      if (!isCancelled) {
        console.error('Error fetching PDF page:', err);
      }
    });

    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, currentPage, zoom, containerWidth]);

  // ─── Fullscreen listener ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Deselect shape when clicking elsewhere
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

  // ─── Zoom helpers ─────────────────────────────────────────────────────────
  const fitToWidth = useCallback(() => { setZoom(1.0); }, []);

  const fitToPage = useCallback(() => {
    if (!pdf || !containerRef.current) return;
    pdf.getPage(currentPage).then((page: any) => {
      const vp = page.getViewport({ scale: 1.0 });
      const containerH = containerRef.current!.clientHeight - 32;
      const containerW = containerRef.current!.clientWidth - 32;
      const widthScale = containerW / vp.width;
      const heightScale = containerH / vp.height;
      setZoom(Math.min(widthScale, heightScale) / widthScale);
    });
  }, [pdf, currentPage]);

  // ─── Current page filters ─────────────────────────────────────────────────
  const pageHighlights = highlights.filter((h) => h.page === currentPage);
  const pageNotes = notes.filter((n) => n.page === currentPage);
  const pageInkStrokes = inkStrokes.filter((s) => s.page === currentPage);
  const pageShapes = shapes.filter((s) => s.page === currentPage);
  const pageTextBoxes = textBoxes.filter((t) => t.page === currentPage);

  // ─── Cursor ───────────────────────────────────────────────────────────────
  const cursorStyle: React.CSSProperties =
    toolMode === 'eraser'
      ? { cursor: 'none' }   // we show a custom circle
      : toolMode === 'view'
      ? { cursor: 'default' }
      : toolMode === 'note'
      ? { cursor: 'cell' }
      : toolMode === 'textbox'
      ? { cursor: 'text' }
      : { cursor: 'crosshair' };

  // ─── Relative position helper ─────────────────────────────────────────────
  const getRelPos = (e: React.MouseEvent<HTMLElement>) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ══════════════════════════════════════════════════════════════════════════
  // TOOL: HIGHLIGHT (freehand thick semi-transparent stroke)
  // ══════════════════════════════════════════════════════════════════════════

  const onHlDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setInkDrawing(true);
    inkPointsRef.current = [{ x, y }];
    drawOnInkCanvas(x, y, true, hlWidth, annotColor, 0.35);
  };

  const onHlMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!inkDrawing) return;
    const { x, y } = getRelPos(e);
    inkPointsRef.current.push({ x, y });
    drawOnInkCanvas(x, y, false, hlWidth, annotColor, 0.35);
  };

  const onHlUp = () => {
    if (!inkDrawing || !overlayRef.current) return;
    setInkDrawing(false);
    clearInkCanvas();
    const rect = overlayRef.current.getBoundingClientRect();
    if (inkPointsRef.current.length > 1) {
      onAddInkStroke({
        page: currentPage,
        points: inkPointsRef.current.map((p) => ({
          x: pxToPercent(p.x, rect.width),
          y: pxToPercent(p.y, rect.height),
        })),
        color: annotColor,
        width: hlWidth,
        opacity: 0.38,
        isHighlight: true,
      });
    }
    inkPointsRef.current = [];
  };

  // ══════════════════════════════════════════════════════════════════════════
  // TOOL: PEN INK
  // ══════════════════════════════════════════════════════════════════════════

  const onInkDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setInkDrawing(true);
    inkPointsRef.current = [{ x, y }];
    drawOnInkCanvas(x, y, true, inkWidth, annotColor, 1.0);
  };

  const onInkMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!inkDrawing) return;
    const { x, y } = getRelPos(e);
    inkPointsRef.current.push({ x, y });
    drawOnInkCanvas(x, y, false, inkWidth, annotColor, 1.0);
  };

  const onInkUp = () => {
    if (!inkDrawing || !overlayRef.current) return;
    setInkDrawing(false);
    clearInkCanvas();
    const rect = overlayRef.current.getBoundingClientRect();
    if (inkPointsRef.current.length > 1) {
      onAddInkStroke({
        page: currentPage,
        points: inkPointsRef.current.map((p) => ({
          x: pxToPercent(p.x, rect.width),
          y: pxToPercent(p.y, rect.height),
        })),
        color: annotColor,
        width: inkWidth,
        opacity: 1.0,
        isHighlight: false,
      });
    }
    inkPointsRef.current = [];
  };

  // Shared canvas drawing helper
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
    const ctx = canvas.getContext('2d')!;
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
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // TOOL: ERASER  (stroke-level: erases any ink stroke the eraser touches)
  // ══════════════════════════════════════════════════════════════════════════

  const onEraserDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setEraserActive(true);
    setEraserPos({ x, y });
    eraserPathRef.current = [{ x, y }];
  };

  const onEraserMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setEraserPos({ x, y });
    if (!eraserActive) return;
    eraserPathRef.current.push({ x, y });
  };

  const onEraserUp = () => {
    if (!eraserActive || !overlayRef.current) return;
    setEraserActive(false);

    const rect = overlayRef.current.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // Convert eraser path to percentage coords
    const eraserPctPath = eraserPathRef.current.map((p) => ({
      x: pxToPercent(p.x, W),
      y: pxToPercent(p.y, H),
    }));

    // For each ink stroke on this page, check if any of its points is within
    // eraserRadius (in percentage units) of any eraser path point.
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
  };

  const onEraserLeave = () => {
    setEraserPos(null);
    if (eraserActive) onEraserUp();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // TOOL: SHAPE (drag to draw)
  // ══════════════════════════════════════════════════════════════════════════

  const onShapeDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getRelPos(e);
    setIsDrawing(true);
    setDragStart({ x, y });
    setDragRect({ x, y, w: 0, h: 0 });
  };

  const onShapeMove = (e: React.MouseEvent<HTMLDivElement>) => {
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
        page: currentPage,
        kind: activeShape,
        x: (dragRect.x / rect.width) * 100,
        y: (dragRect.y / rect.height) * 100,
        width: (dragRect.w / rect.width) * 100,
        height: (dragRect.h / rect.height) * 100,
        color: annotColor,
        strokeWidth: 2,
      });
    }
    setDragStart(null);
    setDragRect(null);
  };

  // ─── Unified mouse handlers ───────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode === 'highlight') onHlDown(e);
    else if (toolMode === 'ink') onInkDown(e);
    else if (toolMode === 'eraser') onEraserDown(e);
    else if (toolMode === 'shape') onShapeDown(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode === 'highlight') onHlMove(e);
    else if (toolMode === 'ink') onInkMove(e);
    else if (toolMode === 'eraser') onEraserMove(e);
    else if (toolMode === 'shape') onShapeMove(e);
  };

  const handleMouseUp = () => {
    if (toolMode === 'highlight') onHlUp();
    else if (toolMode === 'ink') onInkUp();
    else if (toolMode === 'eraser') onEraserUp();
    else if (toolMode === 'shape') onShapeUp();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode === 'note' && !isDrawing) {
      const { x, y } = getRelPos(e);
      const rect = overlayRef.current!.getBoundingClientRect();
      setNotePopup({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 });
      setNoteText('');
    } else if (toolMode === 'textbox') {
      const { x, y } = getRelPos(e);
      const rect = overlayRef.current!.getBoundingClientRect();
      setActiveTextBox({ x: (x / rect.width) * 100, y: (y / rect.height) * 100, text: '' });
    } else {
      // Deselect shape if clicking on blank overlay area
      setSelectedShapeId(null);
    }
  };

  const handleSaveNote = () => {
    if (!notePopup || !noteText.trim()) return;
    onAddNote({ page: currentPage, x: notePopup.x, y: notePopup.y, color: '#f59e0b', text: noteText.trim() });
    setNotePopup(null);
    setNoteText('');
  };

  const handleSaveTextBox = () => {
    if (!activeTextBox || !activeTextBox.text.trim()) { setActiveTextBox(null); return; }
    onAddTextBox({
      page: currentPage,
      x: activeTextBox.x,
      y: activeTextBox.y,
      text: activeTextBox.text.trim(),
      color: annotColor,
      fontSize: 13,
    });
    setActiveTextBox(null);
  };

  // ─── SVG shape renderer ───────────────────────────────────────────────────

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
            setSelectedShapeId(shape.id === selectedShapeId ? null : shape.id);
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
              x1={px} y1={py + ph / 2}
              x2={px + pw} y2={py + ph / 2}
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

  // ─── Ink SVG path builder ─────────────────────────────────────────────────

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

  // ─── Live shape preview ───────────────────────────────────────────────────

  const previewShape = () => {
    if (!isDrawing || !dragRect || !svgSize.w || toolMode !== 'shape') return null;
    const svgW = svgSize.w;
    const svgH = svgSize.h;
    const preview: ShapeAnnotation = {
      id: '__preview__',
      page: currentPage,
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

  // ─── Selected shape floating delete button ────────────────────────────────

  const selectedShape = selectedShapeId
    ? pageShapes.find((s) => s.id === selectedShapeId)
    : null;

  const selectedShapeDeletePos = selectedShape && svgSize.w
    ? {
        left: `${selectedShape.x}%`,
        top: `calc(${selectedShape.y}% - 28px)`,
      }
    : null;

  // ─── Palette & toolbar helpers ────────────────────────────────────────────

  const paletteColors = [
    '#f59e0b', '#10b981', '#ef4444',
    '#3b82f6', '#8b5cf6', '#ec4899', '#000000',
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
        onClick={() => { setToolMode(mode); setNotePopup(null); setActiveTextBox(null); setSelectedShapeId(null); }}
        title={label}
        className={`p-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
          active
            ? 'bg-amber-500 text-white shadow-sm'
            : darkMode
            ? 'text-zinc-400 hover:bg-zinc-800'
            : 'text-zinc-600 hover:bg-zinc-100'
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
      onClick={() => { setToolMode('shape'); setActiveShape(kind); setNotePopup(null); }}
      title={label}
      className={`p-2 rounded-lg flex items-center gap-1 text-xs transition-all ${
        toolMode === 'shape' && activeShape === kind
          ? 'bg-amber-500 text-white shadow-sm'
          : darkMode
          ? 'text-zinc-400 hover:bg-zinc-800'
          : 'text-zinc-600 hover:bg-zinc-100'
      }`}
    >
      {icon}
    </button>
  );

  const divider = <div className={`h-5 w-px mx-0.5 ${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`} />;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      id="pdf-reader-root"
      className={`flex flex-col h-full rounded-2xl border transition-colors duration-300 overflow-hidden ${
        darkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div
        className={`flex flex-wrap items-center gap-2 px-4 py-2.5 border-b shrink-0 ${
          darkMode ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-100 bg-zinc-50'
        }`}
      >
        {/* Page navigation */}
        <div className="flex items-center gap-1.5">
          <button
            id="reader-prev-btn"
            onClick={() => currentPage > 1 && onChangePage(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
          >
            <ChevronLeft size={18} />
          </button>
          <div className={`flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-lg border ${
            darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
          }`}>
            <input
              id="reader-page-jump"
              type="number" min={1} max={totalPages} value={currentPage}
              onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) onChangePage(v); }}
              className="w-10 text-center bg-transparent outline-none"
            />
            <span className="text-zinc-400">/ {totalPages}</span>
          </div>
          <button
            id="reader-next-btn"
            onClick={() => currentPage < totalPages && onChangePage(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {divider}

        {/* ── View + Highlight + Note ── */}
        <div className="flex items-center gap-0.5">
          {toolBtn('tool-view', 'view', <MousePointer size={15} />, 'Navigate')}
          {toolBtn('tool-highlight', 'highlight', <Highlighter size={15} />, 'Highlight')}
          {/* Highlighter size selector */}
          {toolMode === 'highlight' && (
            <div className="flex items-center gap-1 ml-1">
              {[10, 16, 22, 30].map((w) => (
                <button
                  key={w}
                  onClick={() => setHlWidth(w)}
                  title={`${w}px highlighter`}
                  className={`rounded-full border-2 transition-all ${
                    hlWidth === w
                      ? 'border-amber-500 scale-110'
                      : darkMode ? 'border-zinc-600 hover:border-zinc-400' : 'border-zinc-300 hover:border-zinc-500'
                  }`}
                  style={{ width: Math.max(10, w * 0.6), height: Math.max(10, w * 0.6), backgroundColor: annotColor + '88' }}
                />
              ))}
            </div>
          )}
          {toolBtn('tool-note', 'note', <MessageSquare size={15} />, 'Note')}
        </div>

        {divider}

        {/* ── Pen + Eraser ── */}
        <div className="flex items-center gap-0.5">
          {toolBtn('tool-ink', 'ink', <Pen size={15} />, 'Pen')}
          {toolMode === 'ink' && (
            <select
              value={inkWidth}
              onChange={(e) => setInkWidth(Number(e.target.value))}
              className={`text-xs rounded-md px-1 py-1 border outline-none ${
                darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-700'
              }`}
            >
              {[1, 2, 3, 5, 8].map((w) => <option key={w} value={w}>{w}px</option>)}
            </select>
          )}
          {toolBtn('tool-eraser', 'eraser', <Eraser size={15} />, 'Eraser')}
        </div>

        {divider}

        {/* ── Shapes + Text ── */}
        <div className="flex items-center gap-0.5">
          {shapeBtn('rect', <Square size={15} />, 'Rectangle')}
          {shapeBtn('circle', <Circle size={15} />, 'Circle')}
          {shapeBtn('line', <Minus size={15} />, 'Line')}
          {shapeBtn('arrow', <MoveRight size={15} />, 'Arrow')}
          {toolBtn('tool-textbox', 'textbox', <Type size={15} />, 'Text')}
        </div>

        {divider}

        {/* ── Colour palette ── */}
        <div className="flex items-center gap-1">
          {paletteColors.map((c) => (
            <button
              key={c}
              onClick={() => setAnnotColor(c)}
              title={c}
              className={`rounded-full border-2 transition-transform hover:scale-110 ${
                annotColor === c ? 'scale-125 border-white shadow-md ring-2 ring-zinc-400' : 'border-transparent'
              }`}
              style={{ backgroundColor: c, width: 17, height: 17 }}
            />
          ))}
        </div>

        {divider}

        {/* ── Zoom ── */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setZoom((p) => Math.max(0.4, p - 0.1))}
            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
            title="Zoom Out"><ZoomOut size={16} /></button>
          <span className="text-xs font-mono w-9 text-center text-zinc-500">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((p) => Math.min(3.0, p + 0.1))}
            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
            title="Zoom In"><ZoomIn size={16} /></button>
          <button onClick={fitToWidth} title="Fit to Width"
            className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}>
            Width
          </button>
          <button onClick={fitToPage} title="Fit to Page"
            className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}>
            Page
          </button>
        </div>

        {divider}

        {/* ── View toggles ── */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setThumbnailOpen((p) => !p)}
            title="Toggle thumbnails"
            className={`p-1.5 rounded-lg transition-colors ${
              thumbnailOpen
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                : darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
          >
            <AlignJustify size={16} />
          </button>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}>
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Thumbnail sidebar */}
        {thumbnailOpen && pdf && !loading && (
          <ThumbnailSidebar
            pdf={pdf}
            totalPages={totalPages}
            currentPage={currentPage}
            onPageSelect={onChangePage}
            darkMode={darkMode}
          />
        )}

        {/* Main canvas area */}
        <div
          ref={containerRef}
          className={`flex-1 overflow-auto flex justify-center items-start p-4 relative select-none ${
            darkMode ? 'bg-zinc-950' : 'bg-zinc-100/60'
          }`}
        >
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/5 backdrop-blur-sm z-50">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent" />
              <p className="text-sm font-medium text-zinc-500 animate-pulse">Reading file…</p>
            </div>
          )}

          {!loading && (
            <div
              className="relative select-none"
              style={{ width: svgSize.w || 'auto', height: svgSize.h || 'auto' }}
            >
              {/* 1 ── PDF render canvas: width/height are controlled imperatively
                       in the useEffect above so React never resets canvas content. */}
              <canvas
                ref={canvasRef}
                style={{
                  filter: darkMode ? 'invert(0.92) hue-rotate(180deg) brightness(1.05) contrast(0.95)' : 'none',
                  display: 'block',
                }}
                className="rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800"
              />

              {/* 2 ── SVG annotation layer: highlights (rects) + ink strokes + shapes */}
              <svg
                ref={svgRef}
                className="absolute inset-0 z-10"
                width={svgSize.w}
                height={svgSize.h}
                viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
                style={{ overflow: 'visible', pointerEvents: 'none' }}
              >
                {/* Legacy rect highlights */}
                {pageHighlights.map((h) => (
                  <rect
                    key={h.id}
                    x={`${h.x}%`} y={`${h.y}%`}
                    width={`${h.width}%`} height={`${h.height}%`}
                    fill={h.color}
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    onDoubleClick={() => { if (window.confirm('Delete highlight?')) onDeleteHighlight(h.id); }}
                  />
                ))}

                {/* Ink strokes + freehand highlights */}
                {pageInkStrokes.map((s) => inkSvgPath(s, svgSize.w, svgSize.h))}

                {/* Shapes (interactive in view mode) */}
                {pageShapes.map((s) =>
                  renderSvgShape(s, svgSize.w, svgSize.h, toolMode === 'view')
                )}

                {/* Live shape preview while dragging */}
                {previewShape()}
              </svg>

              {/* 3 ── Live ink/highlight canvas: sized imperatively, no JSX width/height */}
              <canvas
                ref={inkCanvasRef}
                className="absolute inset-0 z-20 pointer-events-none"
                style={{ display: (toolMode === 'ink' || toolMode === 'highlight') ? 'block' : 'none' }}
              />

              {/* 4 ── Interactive overlay div */}
              <div
                ref={overlayRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={toolMode === 'eraser' ? onEraserLeave : undefined}
                onClick={handleOverlayClick}
                className="absolute inset-0 z-30"
                style={cursorStyle}
              >
                {/* ── Eraser visual ring ── */}
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

                {/* ── Selected shape: floating delete button ── */}
                {selectedShape && selectedShapeDeletePos && (
                  <div
                    className="absolute z-50 flex items-center gap-1.5 pointer-events-auto"
                    style={selectedShapeDeletePos}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg shadow-lg border text-xs font-medium ${
                      darkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'
                    }`}>
                      <span className="text-zinc-500 text-[10px] capitalize">{selectedShape.kind}</span>
                      <button
                        onClick={() => { onDeleteShape(selectedShape.id); setSelectedShapeId(null); }}
                        className="flex items-center gap-0.5 text-red-500 hover:text-red-600 ml-1 font-semibold"
                        title="Delete shape"
                      >
                        <Trash2 size={11} />
                        <span>Delete</span>
                      </button>
                      <button
                        onClick={() => setSelectedShapeId(null)}
                        className="text-zinc-400 hover:text-zinc-600 ml-0.5"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Sticky note pins ── */}
                {pageNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedNote(note); }}
                    className="absolute z-40 p-1.5 rounded-full bg-amber-500 hover:bg-amber-600 border-2 border-white text-white shadow-md cursor-pointer transition-transform hover:scale-110"
                    style={{ left: `${note.x}%`, top: `${note.y}%`, transform: 'translate(-50%,-50%)' }}
                    title="Click to view note"
                  >
                    <MessageSquare size={12} className="fill-white" />
                  </div>
                ))}

                {/* ── Text boxes (static rendered) ── */}
                {pageTextBoxes.map((tb) => (
                  <div
                    key={tb.id}
                    className="absolute z-40 group"
                    style={{ left: `${tb.x}%`, top: `${tb.y}%` }}
                  >
                    <div
                      className="px-1.5 py-0.5 rounded border text-xs whitespace-pre-wrap max-w-[200px] shadow-sm"
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
                      onClick={(e) => { e.stopPropagation(); onDeleteTextBox(tb.id); }}
                      className="absolute -top-2 -right-2 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}

                {/* ── Note placement popup ── */}
                {notePopup && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute z-50 p-4 w-60 rounded-xl shadow-xl border ${
                      darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
                    }`}
                    style={{ left: `${notePopup.x}%`, top: `${notePopup.y}%` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-zinc-500">Add Sticky Note</span>
                      <button onClick={() => setNotePopup(null)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                        <X size={12} />
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Type your note…"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className={`w-full text-xs p-2 border rounded-lg resize-none outline-none focus:ring-1 focus:ring-amber-500 ${
                        darkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-800 placeholder-zinc-400'
                      }`}
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5 mt-2">
                      <button onClick={() => setNotePopup(null)} className="px-2 py-1 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">Cancel</button>
                      <button onClick={handleSaveNote} disabled={!noteText.trim()} className="px-2 py-1 rounded text-[10px] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium">Save</button>
                    </div>
                  </div>
                )}

                {/* ── Text box placement input ── */}
                {activeTextBox && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute z-50"
                    style={{ left: `${activeTextBox.x}%`, top: `${activeTextBox.y}%` }}
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
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveTextBox(); }
                      }}
                      className="text-xs px-2 py-1 rounded border min-w-[120px] outline-none resize-none shadow-md"
                      style={{
                        color: annotColor,
                        borderColor: annotColor + '88',
                        backgroundColor: darkMode ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.97)',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Selected note card ───────────────────────────────────────────── */}
      {selectedNote && (
        <div className={`absolute top-20 right-6 z-50 p-4 w-72 rounded-xl shadow-xl border ${
          darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
        }`}>
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Note — Page {selectedNote.page}</span>
            <button onClick={() => setSelectedNote(null)} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
              <X size={13} />
            </button>
          </div>
          <p className="text-sm break-words whitespace-pre-wrap select-text leading-relaxed text-zinc-700 dark:text-zinc-300">
            {selectedNote.text}
          </p>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400">{new Date(selectedNote.createdAt).toLocaleDateString()}</span>
            <button
              onClick={() => { if (window.confirm('Delete note?')) { onDeleteNote(selectedNote.id); setSelectedNote(null); } }}
              className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
