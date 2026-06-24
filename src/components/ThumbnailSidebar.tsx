import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';


interface ThumbnailSidebarProps {
  pdf: any; // pdfjs PDFDocumentProxy
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  darkMode: boolean;
}

interface ThumbnailEntry {
  page: number;
  dataUrl: string | null;
  rendering: boolean;
}

export default function ThumbnailSidebar({
  pdf,
  totalPages,
  currentPage,
  onPageSelect,
  darkMode,
}: ThumbnailSidebarProps) {
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const renderQueue = useRef<Set<number>>(new Set());

  // Initialise blank thumbnail slots when pdf loads
  useEffect(() => {
    if (!pdf) return;
    const entries: ThumbnailEntry[] = Array.from({ length: totalPages }, (_, i) => ({
      page: i + 1,
      dataUrl: null,
      rendering: false,
    }));
    setThumbnails(entries);
    renderQueue.current.clear();
  }, [pdf, totalPages]);

  const renderThumbnail = useCallback(
    async (pageNum: number) => {
      if (!pdf || renderQueue.current.has(pageNum)) return;
      renderQueue.current.add(pageNum);

      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        
        // Paint white background so transparency doesn't turn black in JPEG output
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        setThumbnails((prev) =>
          prev.map((t) =>
            t.page === pageNum ? { ...t, dataUrl, rendering: false } : t
          )
        );
      } catch {
        // silently fail for individual page errors
        renderQueue.current.delete(pageNum);
      }
    },
    [pdf]
  );

  // Set up IntersectionObserver for lazy rendering
  useEffect(() => {
    if (thumbnails.length === 0) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(
            (entry.target as HTMLElement).dataset.page || '0'
          );
          if (pageNum <= 0) return;

          if (entry.isIntersecting) {
            renderThumbnail(pageNum);
          } else {
            // Evict thumbnail image data URL from memory when scrolled out of view
            setThumbnails((prev) =>
              prev.map((t) =>
                t.page === pageNum && t.dataUrl ? { ...t, dataUrl: null } : t
              )
            );
            renderQueue.current.delete(pageNum);
          }
        });
      },
      { 
        rootMargin: '400px 0px', // Buffer zone to load before and keep slightly after viewport
        threshold: 0.0 
      }
    );

    thumbRefs.current.forEach((el) => {
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [thumbnails.length, renderThumbnail]);

  // Auto-scroll active thumbnail into view
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentPage]);

  return (
    <div
      className={`w-24 flex-shrink-0 flex flex-col border-r overflow-y-auto transition-colors duration-300 custom-scrollbar ${
        darkMode
          ? 'bg-zinc-900 border-zinc-800'
          : 'bg-zinc-50 border-zinc-200'
      }`}
    >
      <div
        className={`px-2 py-2 text-[9px] font-semibold uppercase tracking-widest text-center border-b ${
          darkMode ? 'text-zinc-600 border-zinc-800' : 'text-zinc-400 border-zinc-200'
        }`}
      >
        Pages
      </div>

      <div className="flex flex-col items-center gap-2 py-2 px-1.5">
        {thumbnails.map((thumb, i) => {
          const isActive = thumb.page === currentPage;
          return (
            <div
              key={thumb.page}
              ref={(el) => {
                thumbRefs.current[i] = el;
                if (isActive) activeRef.current = el;
              }}
              data-page={thumb.page}
              onClick={() => onPageSelect(thumb.page)}
              className={`w-full cursor-pointer rounded-md overflow-hidden transition-all duration-150 select-none ${
                isActive
                  ? 'ring-2 ring-amber-500 shadow-md scale-[1.03]'
                  : darkMode
                  ? 'ring-1 ring-zinc-700 hover:ring-zinc-500'
                  : 'ring-1 ring-zinc-200 hover:ring-zinc-400'
              }`}
            >
              {thumb.dataUrl ? (
                <img
                  src={thumb.dataUrl}
                  alt={`Page ${thumb.page}`}
                  className={`w-full h-auto block ${
                    darkMode
                      ? 'filter invert-[0.92] hue-rotate-180 brightness-105 contrast-95'
                      : ''
                  }`}
                  draggable={false}
                />
              ) : (
                <div
                  className={`w-full aspect-[3/4] flex items-center justify-center animate-pulse ${
                    darkMode ? 'bg-zinc-800' : 'bg-zinc-200'
                  }`}
                >
                  <span className="text-[9px] text-zinc-500">{thumb.page}</span>
                </div>
              )}
              <div
                className={`text-center text-[8px] font-mono py-0.5 ${
                  isActive
                    ? 'text-amber-500 font-bold'
                    : darkMode
                    ? 'text-zinc-600'
                    : 'text-zinc-400'
                }`}
              >
                {thumb.page}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
