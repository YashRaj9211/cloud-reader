import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Code2,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store';

interface AnimationStudioWindowProps {
  onJumpToPage?: (pageNumber: number, documentId?: string) => void;
}

export const AnimationStudioWindow: React.FC<AnimationStudioWindowProps> = memo(
  function AnimationStudioWindow({ onJumpToPage }) {
    const {
      activeAnimation,
      animationStudioOpen,
      setAnimationStudioOpen,
      setActiveAnimation,
      activeBookPage,
      books,
      activeBookId,
      setChatOpen,
    } = useAppStore();

    const [isDocked, setIsDocked] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [isPlaying, setIsPlaying] = useState(true);
    const [showCode, setShowCode] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Interactive Parameter Playground state (customizable sliders that can inject values)
    const [paramA, setParamA] = useState(0.42);
    const [paramB, setParamB] = useState(0.55);
    const [paramLikelihood, setParamLikelihood] = useState(0.55);

    const iframeRef = useRef<HTMLIFrameElement>(null);

    // If not open or no animation, do not render
    if (!animationStudioOpen || !activeAnimation) {
      return null;
    }

    const cleanCode = activeAnimation.code
      .replace(/^```(?:p5js|p5\.js|p5|javascript|js|html|xml)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim();

    // Calculate live result display
    const bayesResult =
      paramB > 0 ? ((paramLikelihood * paramA) / paramB).toFixed(3) : '0.000';

    // Build the sandboxed HTML document with p5.js script
    const buildSrcdoc = () => {
      const isFullHtml = /<!DOCTYPE\s+html|<html[\s>]|<body[\s>]/i.test(cleanCode);

      if (isFullHtml) {
        let html = cleanCode;
        html = html.replace(
          /<canvas\s+([^>]*?)id=["']canvas["']([^>]*?)>[\s\S]*?<\/canvas>/gi,
          '<div $1id="canvas"$2 style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;"></div>'
        );

        const responsiveStyle = `
<style id="p5-studio-style">
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #09090b !important;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  canvas {
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
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
<script>
window.__STUDIO_SPEED__ = ${playbackSpeed};
window.__PARAM_A__ = ${paramA};
window.__PARAM_B__ = ${paramB};
window.onerror = function(msg, src, line) {
  var el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#ef4444;font-weight:bold;margin-bottom:6px;">Runtime Error</div><div style="color:#fca5a5;">' + msg + '</div>';
  }
  return true;
};
</script>
`;
        if (html.includes('</head>')) {
          html = html.replace('</head>', `${responsiveStyle}</head>`);
        } else {
          html = responsiveStyle + html;
        }

        if (!html.includes('p5.min.js') && !html.includes('p5.js')) {
          html = html.replace(
            '<head>',
            '<head><script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js"></script>'
          );
        }
        return html;
      }

      // Default JavaScript p5 wrapper
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #09090b;
    color: #e4e4e7;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }
  canvas {
    display: block !important;
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  #error-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(9, 9, 11, 0.95);
    color: #f87171;
    font: 12px/1.5 ui-monospace, monospace;
    padding: 16px;
    overflow: auto;
    z-index: 999;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js"></script>
</head>
<body>
<div id="error-overlay"></div>
<script>
window.__STUDIO_SPEED__ = ${playbackSpeed};
window.__PARAM_A__ = ${paramA};
window.__PARAM_B__ = ${paramB};

window.onerror = function(msg, src, line) {
  var el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#ef4444;font-weight:bold;margin-bottom:6px;">Runtime Error</div><div style="color:#fca5a5;">' + msg + '</div>';
  }
  return true;
};

if (typeof p5 !== 'undefined') {
  p5.disableFriendlyErrors = true;
}

try {
${cleanCode}
} catch(e) {
  var el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = '<div style="color:#ef4444;font-weight:bold;margin-bottom:6px;">Execution Error</div><div style="color:#fca5a5;">' + e.message + '</div>';
  }
}
</script>
</body>
</html>`;
    };

    const togglePlay = () => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      try {
        if (isPlaying) {
          (iframe.contentWindow as any).noLoop?.();
        } else {
          (iframe.contentWindow as any).loop?.();
        }
        setIsPlaying(!isPlaying);
      } catch {
        setIsPlaying(!isPlaying);
      }
    };

    const restartSketch = () => {
      if (!iframeRef.current) return;
      setIsPlaying(true);
      iframeRef.current.srcdoc = buildSrcdoc();
    };

    const handleSpeedChange = (speed: number) => {
      setPlaybackSpeed(speed);
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        try {
          (iframe.contentWindow as any).__STUDIO_SPEED__ = speed;
          if (typeof (iframe.contentWindow as any).frameRate === 'function') {
            (iframe.contentWindow as any).frameRate(60 * speed);
          }
        } catch {
          restartSketch();
        }
      }
    };

    const handleCopy = () => {
      navigator.clipboard.writeText(cleanCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    const currentDoc = books.find((b) => b.id === activeBookId);
    const groundedPageDisplay =
      activeAnimation.groundedPage || `Page ${activeBookPage || 1}`;

    return (
      <div
        id="animation-expanded-viewer"
        className={`absolute z-30 transition-all duration-300 flex flex-col overflow-hidden bg-white/95 dark:bg-[#121316]/98 backdrop-blur-xl border border-[#fa5d19]/25 rounded-2xl shadow-2xl ring-1 ring-black/5 ${
          isFullscreen
            ? 'inset-3 max-h-none'
            : isDocked
            ? 'bottom-3 right-6 w-96 max-h-[48px]'
            : 'bottom-3 left-4 right-4 md:left-6 md:right-6 max-h-[520px]'
        }`}
      >
        {/* ── Studio Header Bar ── */}
        <div className="h-12 px-4 border-b border-stone-200 dark:border-stone-800/80 bg-stone-50/90 dark:bg-stone-900/80 flex items-center justify-between flex-shrink-0 select-none">
          {/* Left: Brand icon, title, page badge */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-[#fa5d19] text-white flex items-center justify-center shadow-sm shrink-0">
                <Sparkles size={14} />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate max-w-[260px] sm:max-w-md">
                  {activeAnimation.title || 'Dynamic Concept Simulation'}
                </span>
                <button
                  onClick={() => {
                    if (onJumpToPage && activeAnimation.groundedPage) {
                      const pNum =
                        typeof activeAnimation.groundedPage === 'number'
                          ? activeAnimation.groundedPage
                          : parseInt(String(activeAnimation.groundedPage).replace(/\D/g, ''), 10) || 1;
                      onJumpToPage(pNum, activeAnimation.sourceDocId);
                    }
                  }}
                  className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#fa5d19]/10 text-[#fa5d19] border border-[#fa5d19]/20 hover:bg-[#fa5d19]/20 transition-colors shrink-0 cursor-pointer"
                  title="Jump to grounded section in document"
                >
                  <span>Grounded on {groundedPageDisplay}</span>
                  <ExternalLink size={9} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Speed buttons, Restart, Fullscreen, Dock, Close */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!isDocked && (
              <>
                {/* Playback speed selector */}
                <div className="flex items-center bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-0.5 shadow-xs mr-1">
                  {[0.5, 1, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                        playbackSpeed === speed
                          ? 'font-semibold bg-[#fa5d19]/15 text-[#fa5d19] shadow-xs'
                          : 'font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>

                {/* Restart */}
                <button
                  onClick={restartSketch}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  title="Restart Animation"
                >
                  <RotateCcw size={15} />
                </button>

                {/* Toggle Code / Canvas */}
                <button
                  onClick={() => setShowCode(!showCode)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    showCode
                      ? 'bg-[#fa5d19]/15 text-[#fa5d19]'
                      : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                  title={showCode ? 'Show Visual Canvas' : 'Inspect Code'}
                >
                  <Code2 size={15} />
                </button>

                {/* Fullscreen */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </>
            )}

            {/* Dock / Minimize button */}
            <button
              onClick={() => setIsDocked(!isDocked)}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title={isDocked ? 'Expand Window' : 'Dock to Bottom'}
            >
              {isDocked ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-0.5" />

            {/* Close Studio / Collapse to Chat */}
            <button
              onClick={() => {
                setAnimationStudioOpen(false);
              }}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title="Close / Collapse to Chat"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Studio Body (Split: 8-col Simulation Canvas + 4-col Parameter Playground) ── */}
        {!isDocked && (
          <div className="p-4 grid grid-cols-12 gap-4 items-stretch overflow-hidden bg-stone-100/60 dark:bg-stone-950 flex-1">
            {/* Main Interactive Canvas Area (8 cols on lg, 12 cols on mobile) */}
            <div className="col-span-12 lg:col-span-8 bg-white dark:bg-[#0d0e11] rounded-xl border border-stone-200 dark:border-stone-800/80 p-3.5 flex flex-col justify-between relative shadow-xs overflow-hidden">
              {/* Top simulation stats bar */}
              <div className="flex items-center justify-between z-10 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-stone-800 dark:text-stone-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Interactive Simulation Canvas • 60 FPS
                  </span>
                </div>
                <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-900 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-800">
                  Ω Universe Area = 1.000
                </div>
              </div>

              {/* Viewport Canvas or Code View */}
              <div className="relative flex-1 min-h-[220px] max-h-[340px] w-full flex items-center justify-center bg-[#09090b] rounded-lg overflow-hidden border border-stone-800/80">
                {!showCode ? (
                  <iframe
                    ref={iframeRef}
                    srcDoc={buildSrcdoc()}
                    sandbox="allow-scripts"
                    title="Interactive Concept Simulation"
                    className="w-full h-full border-0"
                    style={{ background: '#09090b' }}
                  />
                ) : (
                  <div className="w-full h-full overflow-auto p-3 text-[11px] font-mono text-stone-300 bg-stone-950 select-text">
                    <pre className="whitespace-pre-wrap">{cleanCode}</pre>
                  </div>
                )}
              </div>

              {/* Bottom Transport Controls Bar */}
              <div className="flex flex-wrap items-center justify-between border-t border-stone-200 dark:border-stone-800 pt-2.5 mt-2.5 gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={togglePlay}
                    className="w-7 h-7 rounded-md bg-[#fa5d19] text-white flex items-center justify-center hover:bg-[#e44e0e] shadow-xs transition-colors"
                    title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={restartSketch}
                    className="w-7 h-7 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 flex items-center justify-center transition-colors"
                    title="Replay from frame 0"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 ml-2 truncate">
                    Dynamic conditioning step • Active RAG context
                  </div>
                </div>

                <div className="text-[11px] text-stone-800 dark:text-stone-200 font-mono bg-[#fa5d19]/10 text-[#fa5d19] px-2.5 py-1 rounded-md border border-[#fa5d19]/25 flex items-center gap-1">
                  <strong>Live Result:</strong> P(A | B) = {bayesResult}
                </div>
              </div>
            </div>

            {/* Right Parameter Playground Panel (4 cols) */}
            <div className="col-span-12 lg:col-span-4 flex flex-col justify-between gap-3 bg-white dark:bg-[#0d0e11] rounded-xl border border-stone-200 dark:border-stone-800/80 p-3.5 shadow-xs">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <Sliders size={13} className="text-[#fa5d19]" />
                    Parameter Playground
                  </span>
                  <button
                    onClick={() => {
                      setParamA(0.42);
                      setParamB(0.55);
                      setParamLikelihood(0.55);
                      restartSketch();
                    }}
                    className="text-[10px] text-[#fa5d19] font-medium cursor-pointer hover:underline"
                  >
                    Reset values
                  </button>
                </div>

                {/* Slider 1: Prior P(A) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-600 dark:text-stone-400 font-medium">
                      Prior Probability P(A)
                    </span>
                    <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                      {paramA.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.01"
                    value={paramA}
                    onChange={(e) => {
                      setParamA(parseFloat(e.target.value));
                    }}
                    className="w-full accent-[#fa5d19] h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Slider 2: Evidence P(B) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-600 dark:text-stone-400 font-medium">
                      Evidence Occurrence P(B)
                    </span>
                    <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                      {paramB.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.01"
                    value={paramB}
                    onChange={(e) => {
                      setParamB(parseFloat(e.target.value));
                    }}
                    className="w-full accent-[#fa5d19] h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Slider 3: Likelihood P(B | A) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-stone-600 dark:text-stone-400 font-medium">
                      Likelihood P(B | A)
                    </span>
                    <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                      {paramLikelihood.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.01"
                    value={paramLikelihood}
                    onChange={(e) => {
                      setParamLikelihood(parseFloat(e.target.value));
                    }}
                    className="w-full accent-[#fa5d19] h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Visual Insight Card */}
                <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-stone-900/90 border border-stone-200/80 dark:border-stone-800 text-[11px] space-y-1">
                  <div className="font-medium text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <Lightbulb size={13} className="text-[#fa5d19]" />
                    <span>Visual Insight</span>
                  </div>
                  <p className="text-stone-500 dark:text-stone-400 text-[10px] leading-relaxed">
                    Adjusting parameters rescales the mass without needing cramped sub-windows in chat.
                    The simulation dynamically re-computes Bayesian posterior flow in 60 FPS.
                  </p>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                >
                  {copied ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                  <span>{copied ? 'Copied' : 'Copy Code'}</span>
                </button>

                <button
                  onClick={() => {
                    setAnimationStudioOpen(false);
                    setChatOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-[11px] font-medium transition-colors"
                >
                  Collapse to Chat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
