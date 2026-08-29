import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import p5 from 'p5';
import {
  Play, Pause, RotateCcw, Maximize2, X, AlertTriangle,
  Minimize2, Expand
} from 'lucide-react';
import { createSketch, validateSpec } from '../lib/animation/engine';
import { theme, themeCSSVars } from '../lib/animation/theme';
import type { AnimationSpec } from '../lib/animation/types';

interface AnimationPlayerProps {
  spec: AnimationSpec;
  width?: number;
  height?: number;
  autoplay?: boolean;
}

type P5Instance = p5 & {
  play: () => void;
  pause: () => void;
  restart: () => void;
  seek: (ms: number) => void;
  getElapsed: () => number;
};

/**
 * AnimationPlayer
 *
 * React wrapper around the declarative p5.js engine.
 * Validates the AnimationSpec before mounting. Exposes play/pause/restart/scrub
 * transport controls. Supports a prominent fullscreen view outside the chat panel.
 */
const AnimationPlayer = memo(function AnimationPlayer({
  spec,
  width = 560,
  height = 340,
  autoplay = true,
}: AnimationPlayerProps) {
  const inlineContainerRef  = useRef<HTMLDivElement>(null);
  const modalContainerRef   = useRef<HTMLDivElement>(null);
  const modalWrapRef        = useRef<HTMLDivElement>(null);
  const instanceRef         = useRef<P5Instance | null>(null);
  const modalInstanceRef    = useRef<P5Instance | null>(null);
  const backdropMouseDownRef = useRef(false);
  const rafRef              = useRef<number | null>(null);

  const [isPlaying,    setIsPlaying]    = useState(autoplay);
  const [progress,     setProgress]     = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNativeFS,   setIsNativeFS]   = useState(false); // browser native fullscreen

  // Validate before mounting anything
  const validation = validateSpec(spec);

  // ── Inline p5 instance ────────────────────────────────────────────────────
  useEffect(() => {
    if (!validation.valid || !inlineContainerRef.current) return;
    inlineContainerRef.current.innerHTML = '';

    const sketch = createSketch(spec, { width, height });
    const instance = new p5(sketch, inlineContainerRef.current) as P5Instance;
    instanceRef.current = instance;

    setIsPlaying(autoplay);
    setProgress(0);
    if (!autoplay) instance.pause?.();

    return () => {
      instance.remove();
      instanceRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, width, height]);

  // ── Progress bar polling ─────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const inst = instanceRef.current;
      if (inst && spec?.duration) {
        const elapsed = inst.getElapsed?.() ?? 0;
        setProgress(Math.min(1, elapsed / spec.duration));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [spec]);

  // ── Close fullscreen on Escape ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
        setIsNativeFS(false);
      }
    };
    const onFSChange = () => {
      if (!document.fullscreenElement) setIsNativeFS(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFSChange);
    };
  }, []);

  // ── Modal p5 instance — mounts when fullscreen opens ────────────────────
  useEffect(() => {
    if (!isFullscreen || !validation.valid) return;

    // Wait one frame for the modal DOM to be ready
    const frame = requestAnimationFrame(() => {
      if (!modalContainerRef.current) return;
      modalContainerRef.current.innerHTML = '';

      // Scale to fill the modal viewport minus chrome (top bar + footer)
      const vw = Math.min(window.innerWidth  - 32, 1400);
      const vh = Math.min(window.innerHeight - 120, 900);
      // Preserve aspect ratio
      const aspect = width / height;
      let mw = vw, mh = Math.round(vw / aspect);
      if (mh > vh) { mh = vh; mw = Math.round(vh * aspect); }

      const sketch = createSketch(spec, { width: mw, height: mh });
      const inst = new p5(sketch, modalContainerRef.current) as P5Instance;
      modalInstanceRef.current = inst;
    });

    return () => {
      cancelAnimationFrame(frame);
      modalInstanceRef.current?.remove();
      modalInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, spec]);

  // ── Transport ─────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    if (isPlaying) { inst.pause(); setIsPlaying(false); }
    else           { inst.play();  setIsPlaying(true);  }
  }, [isPlaying]);

  const handleRestart = useCallback(() => {
    instanceRef.current?.restart();
    modalInstanceRef.current?.restart();
    setIsPlaying(true);
    setProgress(0);
  }, []);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!spec?.duration) return;
    const t = parseFloat(e.target.value);
    setProgress(t);
    const ms = t * spec.duration;
    instanceRef.current?.seek(ms);
    setIsPlaying(false);
  }, [spec]);

  // ── Native browser fullscreen ─────────────────────────────────────────────
  const handleNativeFS = useCallback(() => {
    const el = modalWrapRef.current;
    if (!el) return;
    if (!isNativeFS) {
      el.requestFullscreen?.().then(() => setIsNativeFS(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsNativeFS(false)).catch(() => {});
    }
  }, [isNativeFS]);

  // ── Error state ────────────────────────────────────────────────────────────
  if (!validation.valid) {
    return (
      <div
        style={{ fontFamily: 'monospace' }}
        className="my-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <div className="flex items-center gap-2 font-semibold mb-2">
          <AlertTriangle size={15} />
          Animation spec is invalid
        </div>
        <ul className="list-disc ml-5 space-y-0.5 text-xs">
          {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
        </ul>
      </div>
    );
  }

  // ── Mini control bar (inline only) ────────────────────────────────────────
  const MiniBar = () => (
    <div
      className="flex items-center justify-between px-3 py-2 border-b select-none"
      style={{ borderColor: theme.gridLine, background: theme.backgroundAlt }}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: theme.accentRed   }} />
          <div className="w-2 h-2 rounded-full" style={{ background: theme.accentBlue  }} />
          <div className="w-2 h-2 rounded-full" style={{ background: theme.accentGreen }} />
        </div>
        <span className="text-[10px] font-mono font-semibold tracking-wide" style={{ color: theme.inkSoft }}>
          p5.js · AnimationSpec
        </span>
        {spec.loop && (
          <span className="text-[9px] px-1 py-0.5 rounded font-mono"
            style={{ background: theme.gridLine, color: theme.inkSoft }}>loop</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={handlePlayPause}
          className="p-1.5 rounded-lg transition-colors hover:bg-[#DCD5C2]/60"
          style={{ color: theme.inkSoft }} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button onClick={handleRestart}
          className="p-1.5 rounded-lg transition-colors hover:bg-[#DCD5C2]/60"
          style={{ color: theme.inkSoft }} title="Restart">
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );

  // ── Scrubber ──────────────────────────────────────────────────────────────
  const Scrubber = ({ onScrub }: { onScrub?: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div className="flex items-center gap-2 px-3 py-2 border-t"
      style={{ borderColor: theme.gridLine, background: `${theme.backgroundAlt}99` }}>
      <span className="text-[10px] font-mono tabular-nums" style={{ color: theme.inkSoft }}>
        {(progress * spec.duration / 1000).toFixed(1)}s
      </span>
      <input type="range" min={0} max={1} step={0.001} value={progress}
        onChange={onScrub ?? handleScrub}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: theme.accentRed }}
      />
      <span className="text-[10px] font-mono tabular-nums" style={{ color: theme.inkSoft }}>
        {(spec.duration / 1000).toFixed(0)}s
      </span>
    </div>
  );

  // ── Modal header ──────────────────────────────────────────────────────────
  const ModalHeader = () => (
    <div
      className="flex items-center justify-between px-5 py-3 border-b select-none shrink-0"
      style={{ borderColor: theme.gridLine, background: theme.backgroundAlt }}
    >
      {/* Left: info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: theme.accentRed   }} />
          <div className="w-3 h-3 rounded-full" style={{ background: theme.accentBlue  }} />
          <div className="w-3 h-3 rounded-full" style={{ background: theme.accentGreen }} />
        </div>
        <span className="text-sm font-semibold" style={{ color: theme.ink }}>
          Visual Explanation
        </span>
        <span className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: theme.gridLine, color: theme.inkSoft }}>
          {spec.objects.length} objects · {spec.timeline.length} events · {spec.duration / 1000}s
        </span>
        {spec.loop && (
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: `${theme.accentBlue}22`, color: theme.accentBlue }}>
            ↻ loop
          </span>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        <button onClick={() => modalInstanceRef.current?.restart()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: theme.gridLine, color: theme.ink }}
          title="Restart">
          <RotateCcw size={13} /> Restart
        </button>

        {/* Native fullscreen toggle */}
        <button
          onClick={handleNativeFS}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: `${theme.accentBlue}22`, color: theme.accentBlue }}
          title={isNativeFS ? 'Exit Native Fullscreen' : 'Enter True Fullscreen'}
        >
          {isNativeFS ? <Minimize2 size={13} /> : <Expand size={13} />}
          {isNativeFS ? 'Exit True FS' : 'True Fullscreen'}
        </button>

        {/* Close */}
        <button
          onClick={() => { setIsFullscreen(false); setIsNativeFS(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: `${theme.accentRed}18`, color: theme.accentRed }}
          title="Close (Esc)"
        >
          <X size={13} /> Close
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`.anim-player-wrap { ${themeCSSVars} }`}</style>

      {/* ── Inline player ── */}
      <div
        className="anim-player-wrap my-3 rounded-2xl overflow-hidden border shadow-sm"
        style={{
          borderColor: theme.gridLine,
          background: theme.backgroundAlt,
          boxShadow: `0 2px 14px ${theme.shadow}`,
          maxWidth: '100%',
        }}
      >
        <MiniBar />

        {/* Canvas */}
        <div
          ref={inlineContainerRef}
          className="overflow-hidden"
          style={{ background: theme.background, lineHeight: 0, height, width: '100%' }}
        />

        <Scrubber />

        {/* ── Prominent Fullscreen CTA ── */}
        <button
          onClick={() => setIsFullscreen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold tracking-wide transition-all hover:opacity-80 active:scale-[0.99]"
          style={{
            background: `linear-gradient(135deg, ${theme.backgroundAlt} 0%, ${theme.gridLine} 100%)`,
            color: theme.ink,
            borderTop: `1px solid ${theme.gridLine}`,
            letterSpacing: '0.04em',
          }}
        >
          <Maximize2 size={13} style={{ color: theme.accentBlue }} />
          View Fullscreen — Open in Large View
          <Maximize2 size={13} style={{ color: theme.accentBlue }} />
        </button>
      </div>

      {/* ── Fullscreen Modal ── */}
      {isFullscreen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.72)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget && backdropMouseDownRef.current) {
                setIsFullscreen(false);
              }
              backdropMouseDownRef.current = false;
            }}
            onMouseDown={(e) => {
              backdropMouseDownRef.current = e.target === e.currentTarget;
            }}
          >
            {/* Noise/blur backdrop layer */}
            <div
              className="fixed inset-0 backdrop-blur-xl -z-10"
              style={{ background: 'rgba(20,18,15,0.75)' }}
              aria-hidden="true"
            />

            {/* ── Main modal card ── */}
            <div
              ref={modalWrapRef}
              className="relative m-auto flex flex-col rounded-3xl overflow-hidden shadow-2xl"
              style={{
                width: 'min(calc(100vw - 40px), 1440px)',
                height: 'min(calc(100vh - 40px), 960px)',
                background: theme.background,
                border: `1.5px solid ${theme.gridLine}`,
                boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <ModalHeader />

              {/* Canvas area */}
              <div
                ref={modalContainerRef}
                className="flex-1 flex items-center justify-center overflow-hidden"
                style={{ background: theme.background, lineHeight: 0 }}
              />

              {/* Modal scrubber + footer */}
              <div>
                <Scrubber />
                <div
                  className="px-5 py-2 flex items-center justify-between text-[11px]"
                  style={{ background: theme.backgroundAlt, color: theme.inkSoft, borderTop: `1px solid ${theme.gridLine}` }}
                >
                  <span className="flex items-center gap-1.5">
                    Press{' '}
                    <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                      style={{ border: `1px solid ${theme.gridLine}`, background: theme.background, color: theme.ink }}>
                      Esc
                    </kbd>{' '}
                    or click outside to close
                  </span>
                  <span className="font-mono text-[10px]">
                    Declarative p5.js · AnimationSpec Engine
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
});

export default AnimationPlayer;
