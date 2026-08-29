import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, Maximize2, X, Code2 } from 'lucide-react';

interface P5RendererProps {
  code: string;
}

/**
 * Renders a p5.js sketch inside a sandboxed iframe.
 * Supports inline rendering inside the chat bubble as well as
 * a full-screen lightbox modal with blurred/darkened backdrop.
 */
const P5Renderer = memo(function P5Renderer({ code }: P5RendererProps) {
  const inlineIframeRef = useRef<HTMLIFrameElement>(null);
  const modalIframeRef = useRef<HTMLIFrameElement>(null);
  const backdropMouseDownRef = useRef(false);
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // Build the srcdoc HTML that loads p5.js and executes the sketch
  const buildSrcdoc = useCallback(() => {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #FAF3F0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  canvas {
    display: block !important;
    max-width: 96% !important;
    max-height: 96% !important;
    width: auto !important;
    height: auto !important;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
  }
  #error-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(250,243,240,0.95);
    color: #c44; font: 12px/1.5 monospace;
    padding: 16px; overflow: auto;
    z-index: 999;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js"><\/script>
</head>
<body>
<div id="error-overlay"></div>
<script>
window.onerror = function(msg, src, line, col, err) {
  var el = document.getElementById('error-overlay');
  el.style.display = 'block';
  el.textContent = 'Error (line ' + line + '): ' + msg;
  return true;
};

try {
${code}
} catch(e) {
  var el = document.getElementById('error-overlay');
  el.style.display = 'block';
  el.textContent = 'Parse error: ' + e.message;
}
<\/script>
</body>
</html>`;
  }, [code]);

  // Handle escape key to close fullscreen modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const togglePlay = (e: React.MouseEvent, targetIframe?: HTMLIFrameElement | null) => {
    e.stopPropagation();
    const iframe = targetIframe || (isFullscreen ? modalIframeRef.current : inlineIframeRef.current);
    if (!iframe?.contentWindow) return;
    try {
      if (isPlaying) {
        (iframe.contentWindow as any).noLoop?.();
      } else {
        (iframe.contentWindow as any).loop?.();
      }
      setIsPlaying(!isPlaying);
    } catch { /* cross-origin fallback */ }
  };

  const restart = (e: React.MouseEvent, targetIframe?: HTMLIFrameElement | null) => {
    e.stopPropagation();
    const iframe = targetIframe || (isFullscreen ? modalIframeRef.current : inlineIframeRef.current);
    if (!iframe) return;
    setHasError(false);
    setIsPlaying(true);
    iframe.srcdoc = buildSrcdoc();
  };

  const openFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsFullscreen(true);
  };

  const closeFullscreen = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setIsFullscreen(false);
  };

  // Render Toolbar controls (reusable for both inline & modal)
  const renderControls = (isModal: boolean) => (
    <div
      className="flex items-center justify-between px-3 py-2 border-b border-[#d8bff0]/40 bg-[#f5eefa]/80 backdrop-blur-sm select-none"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffb6c1] shadow-sm" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#bae6b4] shadow-sm" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#b0e0e6] shadow-sm" />
        </div>
        <span className="ml-1 text-[10px] font-mono text-[#7e699b] font-semibold tracking-wide">
          {isModal ? 'p5.js Visual Explanation' : 'p5.js animation'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={e => {
            e.stopPropagation();
            setShowCode(s => !s);
          }}
          className={`p-1.5 rounded-lg transition-colors ${
            showCode ? 'bg-[#9061ff]/20 text-[#9061ff]' : 'hover:bg-[#d8bff0]/40 text-[#7e699b]'
          }`}
          title={showCode ? 'View Animation' : 'View Code'}
        >
          <Code2 size={13} />
        </button>
        <button
          onClick={e => togglePlay(e, isModal ? modalIframeRef.current : inlineIframeRef.current)}
          className="p-1.5 rounded-lg hover:bg-[#d8bff0]/40 text-[#7e699b] transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          onClick={e => restart(e, isModal ? modalIframeRef.current : inlineIframeRef.current)}
          className="p-1.5 rounded-lg hover:bg-[#d8bff0]/40 text-[#7e699b] transition-colors"
          title="Restart Animation"
        >
          <RotateCcw size={13} />
        </button>
        
        {isModal ? (
          <button
            onClick={closeFullscreen}
            className="p-1.5 rounded-lg bg-[#9061ff]/15 hover:bg-[#9061ff]/25 text-[#7c3aed] transition-colors ml-1"
            title="Exit Fullscreen (Esc)"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            onClick={openFullscreen}
            className="p-1.5 rounded-lg hover:bg-[#9061ff]/20 text-[#9061ff] transition-colors"
            title="Expand to Fullscreen"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Inline Chat Component ── */}
      <div
        className={`my-3 rounded-2xl overflow-hidden border shadow-sm transition-all ${
          hasError
            ? 'border-red-300 bg-red-50/50'
            : 'border-[#d8bff0]/70 bg-gradient-to-br from-[#faf3f0] to-[#f3ecf9]'
        }`}
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {renderControls(false)}

        {/* Inline Canvas */}
        {!showCode ? (
          <div className="relative w-full bg-[#FAF3F0] overflow-hidden flex items-center justify-center min-h-[220px]">
            <iframe
              ref={inlineIframeRef}
              srcDoc={buildSrcdoc()}
              sandbox="allow-scripts"
              title="p5.js animation"
              className="w-full border-0"
              style={{
                height: 240,
                background: '#FAF3F0',
                display: 'block',
              }}
            />
            {/* Quick full-screen overlay button hint on hover */}
            <button
              onClick={openFullscreen}
              className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-white/80 hover:bg-white text-[10px] text-[#7e699b] shadow-sm backdrop-blur-sm border border-[#d8bff0]/50 transition-all opacity-80 hover:opacity-100 flex items-center gap-1"
            >
              <Maximize2 size={10} />
              Expand
            </button>
          </div>
        ) : (
          <div className="overflow-auto custom-scrollbar text-[11px] font-mono text-[#58446b] bg-[#faf3f0] p-3 max-h-[240px]">
            <pre className="whitespace-pre-wrap">{code}</pre>
          </div>
        )}
      </div>

      {/* ── Fullscreen Lightbox Modal (Portal) ── */}
      {isFullscreen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 md:p-10"
            onClick={e => {
              // Only close if the click originated on this backdrop wrapper
              if (e.target === e.currentTarget && backdropMouseDownRef.current) {
                closeFullscreen(e);
              }
              backdropMouseDownRef.current = false;
            }}
            onMouseDown={e => {
              if (e.target === e.currentTarget) {
                backdropMouseDownRef.current = true;
              } else {
                backdropMouseDownRef.current = false;
              }
            }}
          >
            {/* Backdrop: Darkened & Blurred */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity -z-10"
              aria-hidden="true"
            />

            {/* Modal Dialog Card */}
            <div
              className="relative w-full max-w-5xl h-[85vh] max-h-[850px] bg-[#FAF3F0] rounded-2xl shadow-2xl border border-white/20 overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            >
              {renderControls(true)}

              <div className="flex-1 relative w-full bg-[#FAF3F0] flex items-center justify-center p-2 overflow-hidden">
                {!showCode ? (
                  <iframe
                    ref={modalIframeRef}
                    srcDoc={buildSrcdoc()}
                    sandbox="allow-scripts"
                    title="p5.js fullscreen animation"
                    className="w-full h-full border-0"
                    style={{
                      background: '#FAF3F0',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar text-xs font-mono text-[#58446b] bg-[#faf3f0] p-6">
                    <pre className="whitespace-pre-wrap leading-relaxed">{code}</pre>
                  </div>
                )}
              </div>

              {/* Modal Footer helper */}
              <div className="px-4 py-2 border-t border-[#d8bff0]/30 bg-[#f5eefa]/50 flex items-center justify-between text-[11px] text-[#8e7aab]">
                <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#d8bff0] text-[10px] font-mono text-zinc-600">Esc</kbd> or click outside to exit</span>
                <span className="font-mono text-[10px]">Pastel Interactive Canvas</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
});

export default P5Renderer;

