import React, { useEffect, useRef, useState } from 'react';
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
  Minimize
} from 'lucide-react';
import { Highlight, StickyNote } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PDFReaderProps {
  pdfData: ArrayBuffer;
  currentPage: number;
  onChangePage: (page: number) => void;
  highlights: Highlight[];
  notes: StickyNote[];
  onAddHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => void;
  onDeleteHighlight: (id: string) => void;
  onAddNote: (note: Omit<StickyNote, 'id' | 'createdAt'>) => void;
  onDeleteNote: (id: string) => void;
  darkMode: boolean;
  isPlaying?: boolean;
}

type ToolMode = 'view' | 'highlight' | 'note';

export default function PDFReader({
  pdfData,
  currentPage,
  onChangePage,
  highlights,
  notes,
  onAddHighlight,
  onDeleteHighlight,
  onAddNote,
  onDeleteNote,
  darkMode,
}: PDFReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [pdf, setPdf] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [toolMode, setToolMode] = useState<ToolMode>('view');
  const [highlightColor, setHighlightColor] = useState<string>('rgba(251, 191, 36, 0.4)'); // amber-400
  const [zoom, setZoom] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Drag-to-Highlight local state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Sticky Note placing active state
  const [notePopup, setNotePopup] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  
  // Selected note detail view state
  const [selectedNote, setSelectedNote] = useState<StickyNote | null>(null);

  // Load PDF document on mount or pdfData change
  useEffect(() => {
    setLoading(true);
    // Slice the ArrayBuffer to avoid detaching the buffer because of worker transfer
    const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
    loadingTask.promise.then(
      (loadedPdf) => {
        setPdf(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        setLoading(false);
        // Reset page if bounds exceeded
        if (currentPage > loadedPdf.numPages) {
          onChangePage(1);
        }
      },
      (error) => {
        console.error('Error loading PDF document:', error);
        setLoading(false);
      }
    );
  }, [pdfData]);

  // Handle ResizeObserver to maintain responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render the current page onto the canvas
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    
    setRendering(true);
    pdf.getPage(currentPage).then((page: any) => {
      // Calculate responsive scale factor
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const widthScale = (containerWidth - 32) / unscaledViewport.width;
      const computedScale = widthScale * zoom;

      const viewport = page.getViewport({ scale: computedScale });
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTask.promise.then(() => {
          setRendering(false);
        }).catch((err: any) => {
          console.error('Page render error:', err);
          setRendering(false);
        });
      }
    });
  }, [pdf, currentPage, zoom, containerWidth]);

  // Handle Drag-to-Highlight logic
  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'highlight' || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setDragStart({ x, y });
    setDragRect({ x, y, w: 0, h: 0 });
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragStart || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const calculatedX = Math.min(dragStart.x, x);
    const calculatedY = Math.min(dragStart.y, y);
    const calculatedW = Math.abs(dragStart.x - x);
    const calculatedH = Math.abs(dragStart.y - y);

    setDragRect({
      x: calculatedX,
      y: calculatedY,
      w: calculatedW,
      h: calculatedH,
    });
  };

  const handleOverlayMouseUp = () => {
    if (!isDrawing || !dragRect || !overlayRef.current) return;
    setIsDrawing(false);

    const rect = overlayRef.current.getBoundingClientRect();
    const widthPercentage = (dragRect.w / rect.width) * 100;
    const heightPercentage = (dragRect.h / rect.height) * 100;

    // Avoid tiny accidental highlights (minimum size 1.5% of canvas width/height)
    if (widthPercentage > 1.5 && heightPercentage > 1.5) {
      const xPercentage = (dragRect.x / rect.width) * 100;
      const yPercentage = (dragRect.y / rect.height) * 100;

      onAddHighlight({
        page: currentPage,
        x: xPercentage,
        y: yPercentage,
        width: widthPercentage,
        height: heightPercentage,
        color: highlightColor,
        text: `Highlight at Page ${currentPage}`,
      });
    }

    setDragStart(null);
    setDragRect(null);
  };

  // Click handler to drop Sticky Notes
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'note' || !overlayRef.current || isDrawing) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercentage = (x / rect.width) * 100;
    const yPercentage = (y / rect.height) * 100;

    setNotePopup({
      x: xPercentage,
      y: yPercentage,
    });
    setNoteText('');
  };

  const handleSaveNote = () => {
    if (!notePopup || !noteText.trim()) return;

    onAddNote({
      page: currentPage,
      x: notePopup.x,
      y: notePopup.y,
      color: '#f59e0b', // amber-500
      text: noteText.trim(),
    });

    setNotePopup(null);
    setNoteText('');
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onChangePage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onChangePage(currentPage + 1);
    }
  };

  const toggleFullscreen = () => {
    const readerNode = document.getElementById('book-reader-container');
    if (!readerNode) return;

    if (!document.fullscreenElement) {
      readerNode.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Keep fullscreen state accurate in case of ESC key exit
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Filter current page's highlights & notes
  const currentPageHighlights = highlights.filter(h => h.page === currentPage);
  const currentPageNotes = notes.filter(n => n.page === currentPage);

  const colors = [
    { name: 'Amber', value: 'rgba(251, 191, 36, 0.4)' },
    { name: 'Emerald', value: 'rgba(52, 211, 153, 0.4)' },
    { name: 'Rose', value: 'rgba(251, 113, 133, 0.4)' },
    { name: 'Sky', value: 'rgba(56, 189, 248, 0.4)' },
    { name: 'Violet', value: 'rgba(192, 132, 252, 0.4)' },
  ];

  return (
    <div 
      id="book-reader-container"
      className={`flex flex-col h-full rounded-2xl border transition-colors duration-300 ${
        darkMode 
          ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
          : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      {/* Reader Toolbar Header */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b ${
        darkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-100 bg-zinc-50/50'
      }`}>
        {/* Navigation */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading}
            id="reader-prev-btn"
            className={`p-2 rounded-lg transition-colors ${
              darkMode 
                ? 'hover:bg-zinc-800 text-zinc-400 disabled:text-zinc-700 disabled:hover:bg-transparent' 
                : 'hover:bg-light-100 text-zinc-600 disabled:text-zinc-300 disabled:hover:bg-transparent'
            }`}
            title="Previous Page"
          >
            <ChevronLeft size={20} />
          </button>
          
          <span className="text-sm font-medium font-mono min-w-[70px] text-center">
            {currentPage} / {totalPages}
          </span>

          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (val >= 1 && val <= totalPages) {
                onChangePage(val);
              }
            }}
            id="reader-page-jump"
            className={`w-14 px-2 py-1 text-center text-xs ml-1 rounded-md border font-mono transition-shadow focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              darkMode 
                ? 'bg-zinc-800 border-zinc-700 text-zinc-100' 
                : 'bg-white border-zinc-200 text-zinc-800'
            }`}
            title="Jump to page"
          />

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading}
            id="reader-next-btn"
            className={`p-2 rounded-lg transition-colors ${
              darkMode 
                ? 'hover:bg-zinc-800 text-zinc-400 disabled:text-zinc-700 disabled:hover:bg-transparent' 
                : 'hover:bg-light-100 text-zinc-600 disabled:text-zinc-300 disabled:hover:bg-transparent'
            }`}
            title="Next Page"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Toolbar Middle: Tools Selector */}
        <div className="flex items-center space-x-1 p-0.5 rounded-lg border border-transparent">
          {/* View Tool */}
          <button
            onClick={() => { setToolMode('view'); setNotePopup(null); }}
            id="reader-tool-view"
            className={`p-2 rounded-lg flex items-center space-x-1.5 text-xs font-medium transition-colors ${
              toolMode === 'view'
                ? 'bg-amber-100 text-amber-800 scale-102 font-semibold shadow-xs'
                : darkMode ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            title="Navigate / View Mode"
          >
            <MousePointer size={16} />
            <span className="hidden sm:inline">Navigate</span>
          </button>

          {/* Highlight Tool */}
          <button
            onClick={() => { setToolMode('highlight'); setNotePopup(null); }}
            id="reader-tool-highlight"
            className={`p-2 rounded-lg flex items-center space-x-1.5 text-xs font-medium transition-colors ${
              toolMode === 'highlight'
                ? 'bg-amber-500 text-white font-semibold shadow-xs'
                : darkMode ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            title="Drag-to-Highlight Text Mode"
          >
            <Highlighter size={16} />
            <span className="hidden sm:inline">Highlight</span>
          </button>

          {/* Sticky Note Tool */}
          <button
            onClick={() => { setToolMode('note'); setNotePopup(null); }}
            id="reader-tool-note"
            className={`p-2 rounded-lg flex items-center space-x-1.5 text-xs font-medium transition-colors ${
              toolMode === 'note'
                ? 'bg-amber-100 text-amber-800 scale-102 font-semibold shadow-xs'
                : darkMode ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
            title="Click to Drop Comment Note"
          >
            <MessageSquare size={16} />
            <span className="hidden sm:inline">Note</span>
          </button>
        </div>

        {/* Color Palette if Highlighting */}
        {toolMode === 'highlight' && (
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80">
            {colors.map((color) => (
              <button
                key={color.name}
                onClick={() => setHighlightColor(color.value)}
                className={`w-5 h-5 rounded-full border transition-transform ${
                  highlightColor === color.value ? 'scale-120 border-zinc-900 ring-2 ring-white dark:ring-zinc-950' : 'border-black/10'
                }`}
                style={{ backgroundColor: color.value.replace('0.4', '1.0') }}
                title={`${color.name} Highlighter`}
              />
            ))}
          </div>
        )}

        {/* Right Toolbar Actions */}
        <div className="flex items-center space-x-2">
          {/* Zoom controls */}
          <button
            onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          
          <span className="text-xs font-mono font-medium max-w-[40px] text-zinc-500">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={() => setZoom(prev => Math.min(3.0, prev + 0.1))}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>

          <span className="h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
            }`}
            title={isFullscreen ? "Exit Fullscreen" : "Full Screen Reading"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {/* Main Canvas + Interactive Annotations Layer */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-auto flex justify-center items-start p-6 relative select-none ${
          darkMode ? 'bg-zinc-950' : 'bg-zinc-100/50'
        }`}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-zinc-900/5 backdrop-blur-xs">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm font-medium text-zinc-500 animate-pulse font-sans">Reading file content...</p>
          </div>
        )}

        {!loading && (
          <div 
            className="relative select-none"
            style={{ width: canvasRef.current?.width || 'auto', height: canvasRef.current?.height || 'auto' }}
          >
            {/* Native Canvas used to render PDF pages */}
            <canvas
              ref={canvasRef}
              style={{
                filter: darkMode ? 'invert(0.92) hue-rotate(180deg) brightness(1.05) contrast(0.95)' : 'none',
              }}
              className="rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800"
            />

            {/* Interactive Overlay Layer for Highlight/Note Events */}
            <div
              ref={overlayRef}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              onClick={handleOverlayClick}
              className={`absolute inset-0 z-10 ${
                toolMode === 'view' ? 'cursor-default' : toolMode === 'highlight' ? 'cursor-crosshair' : 'cursor-cell'
              }`}
            >
              {/* Render Existing Highlights on Page */}
              {currentPageHighlights.map((highlight) => (
                <div
                  key={highlight.id}
                  className="absolute pointer-events-auto cursor-pointer group"
                  style={{
                    left: `${highlight.x}%`,
                    top: `${highlight.y}%`,
                    width: `${highlight.width}%`,
                    height: `${highlight.height}%`,
                    backgroundColor: highlight.color,
                  }}
                  title="Double click to delete highlight"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this highlight?')) {
                      onDeleteHighlight(highlight.id);
                    }
                  }}
                >
                  {/* Small floating deletion icon on hover */}
                  <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-bl-md pointer-events-auto">
                    <Trash2 
                      size={10} 
                      className="hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this highlight?')) {
                          onDeleteHighlight(highlight.id);
                        }
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Render Active Temporary Drawing Highlight Frame */}
              {isDrawing && dragRect && (
                <div
                  className="absolute border border-dashed border-zinc-900 pointer-events-none"
                  style={{
                    left: dragRect.x,
                    top: dragRect.y,
                    width: dragRect.w,
                    height: dragRect.h,
                    backgroundColor: highlightColor,
                  }}
                />
              )}

              {/* Render Existing Sticky Notes (Pins) on Page */}
              {currentPageNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNote(note);
                  }}
                  className="absolute z-20 pointer-events-auto p-1.5 rounded-full bg-amber-500 hover:bg-amber-600 border border-white text-white shadow-md cursor-pointer transition-transform hover:scale-115"
                  style={{
                    left: `${note.x}%`,
                    top: `${note.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  title="Click to view sticky note"
                >
                  <MessageSquare size={14} className="fill-white" />
                </div>
              ))}

              {/* Render Active Sticky Note placement Dialog Popover */}
              {notePopup && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute z-30 p-4 w-60 rounded-xl shadow-xl border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800"
                  style={{
                    left: `${notePopup.x}%`,
                    top: `${notePopup.y}%`,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Add Sticky Note</span>
                    <button 
                      onClick={() => setNotePopup(null)}
                      className="p-1 rounded-sm text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Write your note/bookmark progress comment here..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full text-xs p-2 border rounded-md resize-none outline-none ring-0 border-zinc-200 dark:border-zinc-700 bg-transparent dark:text-zinc-100 placeholder-zinc-400 font-sans"
                    autoFocus
                  />
                  <div className="flex justify-end space-x-1.5 mt-2">
                    <button
                      onClick={() => setNotePopup(null)}
                      className="px-2 py-1 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      disabled={!noteText.trim()}
                      className="px-2 py-1 rounded text-[10px] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium font-sans"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Note viewing Sidebar popup Card Modal */}
      {selectedNote && (
        <div className="absolute top-20 right-6 z-40 p-4 w-72 rounded-xl shadow-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-950 dark:text-zinc-50">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Sticky Note — Page {selectedNote.page}</span>
            <button 
              onClick={() => setSelectedNote(null)}
              className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-sm font-sans break-words whitespace-pre-wrap select-text leading-relaxed text-zinc-700 dark:text-zinc-300">
            {selectedNote.text}
          </p>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-zinc-50 dark:border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-400">
              {new Date(selectedNote.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this note?')) {
                  onDeleteNote(selectedNote.id);
                  setSelectedNote(null);
                }
              }}
              className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center space-x-1"
            >
              <Trash2 size={12} />
              <span>Delete Note</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
