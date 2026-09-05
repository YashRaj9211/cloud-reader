import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, Maximize2, X, Code2, Copy, Check, Sparkles, AlertCircle, Sliders } from 'lucide-react';
import { useAppStore } from '../store';

interface P5RendererProps {
  code: string;
}

/**
 * Renders a p5.js sketch inside a sandboxed iframe.
 * Supports inline rendering inside chat messages as well as
 * an expansive full-screen lightbox modal.
 */
const P5Renderer = memo(function P5Renderer({ code }: P5RendererProps) {
  const inlineIframeRef = useRef<HTMLIFrameElement>(null);
  const modalIframeRef = useRef<HTMLIFrameElement>(null);
  const backdropMouseDownRef = useRef(false);

  const cleanCode = code
    .replace(/^```(?:p5js|p5\.js|p5|javascript|js|html|xml)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  const { setActiveAnimation, setAnimationStudioOpen, activeBookPage, activeBookId } = useAppStore();

  // Extract a readable title if present in comment or code
  const titleMatch = cleanCode.match(/\/\/\s*(?:Title:|Topic:)?\s*([^\n\r]+)/i);
  const detectedTitle = titleMatch ? titleMatch[1].trim() : 'Dynamic Concept Simulation';

  // Check if the sketch has the minimum structure to run
  const isComplete =
    /<!DOCTYPE\s+html|<html[\s>]|<body[\s>]/i.test(cleanCode) ||
    /function\s+setup\s*\(|setup\s*=\s*(?:function|\()/.test(cleanCode) ||
    /createCanvas\s*\(/.test(cleanCode);

  const [debouncedCode, setDebouncedCode] = useState(cleanCode);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Debounce code updates to avoid spamming the iframe during token streaming
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(cleanCode);
      setHasError(false);
      setErrorMessage(null);
    }, 350);
    return () => clearTimeout(timer);
  }, [cleanCode]);

  // Listen for runtime error messages from the iframe sandbox
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'p5-error') {
        setHasError(true);
        setErrorMessage(e.data.error || 'Animation runtime error');
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  // Build the sandboxed HTML document
  const buildSrcdoc = useCallback(() => {
    const isFullHtml = /<!DOCTYPE\s+html|<html[\s>]|<body[\s>]/i.test(debouncedCode);

    if (isFullHtml) {
      let html = debouncedCode;

      // Fix the common bug where code targets <canvas id="canvas"> with canvas.parent('canvas')
      // A <canvas> tag cannot render child canvas elements (they are treated as fallback content).
      // Replace <canvas id="canvas"> with <div id="canvas"> so p5 attaches properly.
      html = html.replace(
        /<canvas\s+([^>]*?)id=["']canvas["']([^>]*?)>[\s\S]*?<\/canvas>/gi,
        '<div $1id="canvas"$2 style="display:flex;justify-content:center;align-items:center;width:100%;"></div>'
      );

      // Ensure canvas scaling and dark theme within the full HTML
      const responsiveStyle = `
<style id="p5-container-style">
  canvas {
    max-width: 100% !important;
    height: auto !important;
    object-fit: contain;
  }
  #error-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(9, 9, 11, 0.95);
    color: #f87171;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 16px;
    overflow: auto;
    z-index: 99999;
  }
</style>
<script id="p5-error-handler">
window.onerror = function(msg, src, line, col, err) {
  var el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#ef4444;font-weight:bold;margin-bottom:6px;">Runtime Error (line ' + line + ')</div>' +
                   '<div style="color:#fca5a5;white-space:pre-wrap;">' + msg + '</div>';
  }
  try {
    window.parent.postMessage({ type: 'p5-error', error: msg, line: line }, '*');
  } catch(e) {}
  return true;
};
</script>
`;
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${responsiveStyle}</head>`);
      } else {
        html = responsiveStyle + html;
      }

      if (!html.includes('id="error-overlay"')) {
        if (html.includes('<body>')) {
          html = html.replace('<body>', '<body><div id="error-overlay"></div>');
        } else {
          html = '<div id="error-overlay"></div>' + html;
        }
      }

      // Ensure p5 library is available if missing
      if (!html.includes('p5.min.js') && !html.includes('p5.js')) {
        html = html.replace(
          '<head>',
          '<head><script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js"></script>'
        );
      }

      return html;
    }

    // Standard JavaScript p5.js sketch: wrap in custom sandbox template
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #09090b;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
  }
  canvas {
    display: block !important;
    max-width: 100% !important;
    max-height: 100% !important;
    border-radius: 6px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  }
  #error-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(9, 9, 11, 0.95);
    color: #f87171;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 16px;
    overflow: auto;
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
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#ef4444;font-weight:bold;margin-bottom:6px;">Runtime Error (line ' + line + ')</div>' +
                   '<div style="color:#fca5a5;white-space:pre-wrap;">' + msg + '</div>';
  }
  try {
    window.parent.postMessage({ type: 'p5-error', error: msg, line: line }, '*');
  } catch(e) {}
  return true;
};

if (typeof p5 !== 'undefined') {
  p5.disableFriendlyErrors = true;
}

try {
${debouncedCode}
} catch(e) {
  var el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#ef4444;font-weight:bold;margin-bottom:6px;">Parse / Execution Error</div>' +
                   '<div style="color:#fca5a5;white-space:pre-wrap;">' + e.message + '</div>';
  }
  try {
    window.parent.postMessage({ type: 'p5-error', error: e.message }, '*');
  } catch(err) {}
}
<\/script>
</body>
</html>`;
  }, [debouncedCode]);

  // Handle keyboard shortcuts (Esc, Space, R) when fullscreen is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      } else if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isPlaying]);

  const togglePlay = (e?: React.MouseEvent, targetIframe?: HTMLIFrameElement | null) => {
    if (e) e.stopPropagation();
    const iframe = targetIframe || (isFullscreen ? modalIframeRef.current : inlineIframeRef.current);
    if (!iframe?.contentWindow) return;
    try {
      if (isPlaying) {
        (iframe.contentWindow as any).noLoop?.();
      } else {
        (iframe.contentWindow as any).loop?.();
      }
      setIsPlaying(!isPlaying);
    } catch {
      /* cross-origin fallback */
    }
  };

  const restart = (e?: React.MouseEvent, targetIframe?: HTMLIFrameElement | null) => {
    if (e) e.stopPropagation();
    const iframe = targetIframe || (isFullscreen ? modalIframeRef.current : inlineIframeRef.current);
    if (!iframe) return;
    setHasError(false);
    setErrorMessage(null);
    setIsPlaying(true);
    iframe.srcdoc = buildSrcdoc();
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cleanCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

  // Render Toolbar controls
  const renderControls = (isModal: boolean) => (
    <div
      className="flex items-center justify-between px-3 py-2 border-b border-stone-800 bg-stone-900/90 backdrop-blur-sm select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80 shadow-sm" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80 shadow-sm" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 shadow-sm" />
        </div>
        <div className="flex items-center gap-1.5 ml-1">
          <Sparkles size={11} className="text-[#fa5d19]" />
          <span className="text-[11px] font-mono text-stone-300 font-semibold tracking-wide">
            {isModal ? 'p5.js Interactive Animation' : 'p5.js Canvas'}
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700/60">
            60 FPS
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Toggle Code / Canvas View */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCode((s) => !s);
          }}
          className={`p-1.5 rounded-lg transition-colors ${
            showCode
              ? 'bg-[#fa5d19]/20 text-[#fa5d19]'
              : 'hover:bg-stone-800 text-stone-400 hover:text-stone-200'
          }`}
          title={showCode ? 'View Animation' : 'View Code'}
        >
          <Code2 size={13} />
        </button>

        {/* Copy Code */}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors"
          title={copied ? 'Copied!' : 'Copy Code'}
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>

        {/* Play / Pause */}
        <button
          onClick={(e) => togglePlay(e, isModal ? modalIframeRef.current : inlineIframeRef.current)}
          className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors"
          title={isPlaying ? 'Pause Animation (Space)' : 'Play Animation (Space)'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>

        {/* Restart */}
        <button
          onClick={(e) => restart(e, isModal ? modalIframeRef.current : inlineIframeRef.current)}
          className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors"
          title="Restart Animation (R)"
        >
          <RotateCcw size={13} />
        </button>

        {/* Open in Interactive Animation Studio */}
        {!isModal && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveAnimation({
                code: cleanCode,
                title: detectedTitle,
                groundedPage: activeBookPage || 1,
                sourceDocId: activeBookId || undefined,
              });
              setAnimationStudioOpen(true);
            }}
            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-[#fa5d19] transition-colors"
            title="Open in Animation Studio (Interactive Split Window)"
          >
            <Sliders size={13} />
          </button>
        )}

        {/* Fullscreen or Close */}
        {isModal ? (
          <button
            onClick={closeFullscreen}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors ml-1"
            title="Exit Fullscreen (Esc)"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            onClick={openFullscreen}
            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-[#fa5d19] transition-colors"
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
        className={`my-3 rounded-xl overflow-hidden border shadow-lg transition-all ${
          hasError
            ? 'border-red-500/40 bg-stone-950'
            : 'border-stone-800 bg-stone-950'
        }`}
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {renderControls(false)}

        {/* Incomplete / Generating State */}
        {!isComplete ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-stone-950 text-stone-300 min-h-[220px]">
            <div className="w-10 h-10 rounded-full bg-[#fa5d19]/10 border border-[#fa5d19]/20 flex items-center justify-center text-[#fa5d19] mb-3">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <span className="text-xs font-mono font-medium text-stone-200">
              Generating p5.js Animation...
            </span>
            <span className="text-[11px] text-stone-500 mt-1">
              Constructing simulation logic & visual frames
            </span>
          </div>
        ) : !showCode ? (
          /* Inline Canvas */
          <div className="relative w-full bg-[#09090b] overflow-hidden flex items-center justify-center min-h-[240px]">
            <iframe
              ref={inlineIframeRef}
              srcDoc={buildSrcdoc()}
              sandbox="allow-scripts"
              title="p5.js animation"
              className="w-full border-0"
              style={{
                height: 260,
                background: '#09090b',
                display: 'block',
              }}
            />

            {/* Quick action buttons overlay */}
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveAnimation({
                    code: cleanCode,
                    title: detectedTitle,
                    groundedPage: activeBookPage || 1,
                    sourceDocId: activeBookId || undefined,
                  });
                  setAnimationStudioOpen(true);
                }}
                className="px-2 py-1 rounded-md bg-[#fa5d19]/90 hover:bg-[#fa5d19] text-[10px] text-white font-medium shadow-md backdrop-blur-sm border border-[#fa5d19]/40 transition-all flex items-center gap-1.5"
                title="Open interactive animation window with parameter controls"
              >
                <Sliders size={10} />
                Open in Studio
              </button>
              <button
                onClick={openFullscreen}
                className="px-2 py-1 rounded-md bg-stone-900/85 hover:bg-stone-800 text-[10px] text-stone-300 shadow-md backdrop-blur-sm border border-stone-700/60 transition-all opacity-85 hover:opacity-100 flex items-center gap-1.5"
              >
                <Maximize2 size={10} className="text-[#fa5d19]" />
                Fullscreen
              </button>
            </div>
          </div>
        ) : (
          /* Inline Code Inspector */
          <div className="overflow-auto custom-scrollbar text-[11px] font-mono text-stone-300 bg-stone-950 p-3.5 max-h-[260px]">
            <pre className="whitespace-pre-wrap leading-relaxed select-text">{cleanCode}</pre>
          </div>
        )}

        {/* Error notification banner if any */}
        {hasError && errorMessage && (
          <div className="px-3 py-1.5 bg-red-950/40 border-t border-red-900/50 flex items-center justify-between text-[11px] text-red-300">
            <div className="flex items-center gap-1.5 truncate mr-2">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
            <button
              onClick={(e) => restart(e, inlineIframeRef.current)}
              className="text-[10px] underline hover:text-red-200 shrink-0"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Fullscreen Lightbox Modal (Portal) ── */}
      {isFullscreen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 md:p-10"
            onClick={(e) => {
              if (e.target === e.currentTarget && backdropMouseDownRef.current) {
                closeFullscreen(e);
              }
              backdropMouseDownRef.current = false;
            }}
            onMouseDown={(e) => {
              backdropMouseDownRef.current = e.target === e.currentTarget;
            }}
          >
            {/* Backdrop: Darkened & Blurred */}
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity -z-10"
              aria-hidden="true"
            />

            {/* Modal Dialog Card */}
            <div
              className="relative w-full max-w-5xl h-[88vh] max-h-[900px] bg-stone-950 rounded-2xl shadow-2xl border border-stone-800 overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {renderControls(true)}

              <div className="flex-1 relative w-full bg-[#09090b] flex items-center justify-center p-2 overflow-hidden">
                {!showCode ? (
                  <iframe
                    ref={modalIframeRef}
                    srcDoc={buildSrcdoc()}
                    sandbox="allow-scripts"
                    title="p5.js fullscreen animation"
                    className="w-full h-full border-0"
                    style={{
                      background: '#09090b',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar text-xs font-mono text-stone-200 bg-stone-950 p-6 select-text">
                    <pre className="whitespace-pre-wrap leading-relaxed">{cleanCode}</pre>
                  </div>
                )}
              </div>

              {/* Modal Footer helper with keyboard hints */}
              <div className="px-4 py-2.5 border-t border-stone-800 bg-stone-900/60 flex items-center justify-between text-[11px] text-stone-400">
                <div className="flex items-center gap-3">
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-[10px] font-mono text-stone-300">Space</kbd> Play / Pause
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-[10px] font-mono text-stone-300">R</kbd> Restart
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-[10px] font-mono text-stone-300">Esc</kbd> Exit
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[#fa5d19] font-mono text-[10px]">
                  <Sparkles size={11} />
                  <span>Interactive Simulation Canvas</span>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
});

export default P5Renderer;
