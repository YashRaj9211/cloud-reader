import React, { useEffect, useRef, useState } from 'react';
import {
  Highlight,
  StickyNote,
  InkStroke,
  ShapeAnnotation,
  ShapeKind,
  TextBox,
} from '../types';
import { Trash2, X, MessageSquare } from 'lucide-react';

export type ToolMode = 'view' | 'highlight' | 'note' |  'ink' | 'eraser' | 'shape' | 'textbox';

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
}

function pxToPercent(val: number, total: number) {
  return (val / total) * 100;
}

export default function PDFPageItem({
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
}: PDFPageItemProps) {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  // 1. Intersection Observer for lazy rendering
  // Use a very large margin so pages are preloaded well before they scroll into
  // view, and their canvases are kept alive long after they scroll out. This
  // prevents users from seeing blank blocks when scrolling quickly.
  useEffect(() => {
    const el = pageContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: '3000px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. Compute aspect ratio / initial dimension placeholder
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

  // 3. Render canvas when visible
  useEffect(() => {
    if (!pdf || !isVisible || !canvasRef.current) return;
    let renderTask: any = null;
    let isCancelled = false;

    pdf.getPage(pageNum).then((page: any) => {
      if (isCancelled) return;

      const dpr = typeof window !== 'undefined' ? Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2.5) : 1;
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

      // Hi-DPI backing store dimensions
      canvas.width = Math.floor(renderVp.width);
      canvas.height = Math.floor(renderVp.height);

      if (inkCanvasRef.current) {
        inkCanvasRef.current.width = cssW;
        inkCanvasRef.current.height = cssH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx || isCancelled) return;

      renderTask = page.render({ canvasContext: ctx, viewport: renderVp });
      renderTask.promise.then(() => {
        if (!isCancelled) {
          hasEverRendered.current = true;
          setRendered(true);
          setPageSize({ w: cssW, h: cssH });
        }
      }).catch((err: any) => {
        if (err && err.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      });
    }).catch(console.error);

    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
      // Do NOT reset rendered or zero canvas dimensions here.
      // Keeping the stale canvas visible prevents blank blocks from appearing
      // while the page is being re-rendered after scrolling back into view.
      // The canvas will simply be overwritten on the next successful render.
    };
  }, [pdf, pageNum, zoom, containerWidth, isVisible]);

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

  // Unified Stroke handlers (Ink & Highlight)
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
        page: pageNum,
        points: inkPointsRef.current.map((p) => ({
          x: pxToPercent(p.x, rect.width),
          y: pxToPercent(p.y, rect.height),
        })),
        color: annotColor,
        width: currentStrokeWidth,
        opacity: currentOpacity,
        isHighlight: isHighlighter,
      });
    }
    inkPointsRef.current = [];
  };

  // Eraser
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

  const onEraserUp = () => {
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
  };

  const onEraserLeave = () => {
    setEraserPos(null);
    if (eraserActive) onEraserUp();
  };

  // Shapes
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
        page: pageNum,
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

  // Touch handlers for mobile & tablet
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
    onAddNote({ page: pageNum, x: notePopup.x, y: notePopup.y, color: '#f59e0b', text: noteText.trim() });
    setNotePopup(null);
    setNoteText('');
  };

  const handleSaveTextBox = () => {
    if (!activeTextBox || !activeTextBox.text.trim()) {
      setActiveTextBox(null);
      return;
    }
    onAddTextBox({
      page: pageNum,
      x: activeTextBox.x,
      y: activeTextBox.y,
      text: activeTextBox.text.trim(),
      color: annotColor,
      fontSize: 13,
    });
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
        className="relative select-none rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 bg-white transition-all overflow-hidden"
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
          className={`absolute inset-0 z-30 ${toolMode !== 'view' ? 'touch-drawing-surface' : ''}`}
          style={cursorStyle}
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
              className="absolute z-40 p-1.5 rounded-full bg-[#fa5d19] hover:bg-[#ff7a3d] border-2 border-white text-white shadow-md cursor-pointer transition-transform hover:scale-110"
              style={{ left: `${note.x}%`, top: `${note.y}%`, transform: 'translate(-50%,-50%)' }}
              title="Click to view note"
            >
              <MessageSquare size={12} className="fill-white" />
            </div>
          ))}

          {/* Text Boxes */}
          {pageTextBoxes.map((tb) => (
            <div
              key={tb.id}
              className="absolute z-40 group"
              style={{ left: `${tb.x}%`, top: `${tb.y}%` }}
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
                className="absolute -top-2 -right-2 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={8} />
              </button>
            </div>
          ))}

          {/* Note placement popup */}
          {notePopup && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute z-50 p-4 w-60 rounded-xl shadow-xl border border-(--color-outline-variant) bg-(--color-surface) text-(--color-on-surface)"
              style={{ left: `${notePopup.x}%`, top: `${notePopup.y}%` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-zinc-500">Add Sticky Note</span>
                <button
                  onClick={() => setNotePopup(null)}
                  className="p-1 rounded hover:bg-(--color-surface-container-high) text-zinc-400"
                >
                  <X size={12} />
                </button>
              </div>
              <textarea
                rows={3}
                placeholder="Type your note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="input-field w-full text-xs p-2 resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-1.5 mt-2">
                <button
                  onClick={() => setNotePopup(null)}
                  className="btn-secondary h-7! px-2.5! py-0! text-[11px]!"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={!noteText.trim()}
                  className="btn-primary h-7! px-2.5! py-0! text-[11px]!"
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
