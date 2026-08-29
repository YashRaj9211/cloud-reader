/**
 * AnimationPlayer.jsx
 *
 * React wrapper around the declarative p5.js engine (engine.js).
 * Drop this into your RAG answer view: when the agent decides a concept
 * needs a visual, it produces an AnimationSpec (JSON) and this component
 * renders it, with play/pause/restart/scrub controls styled to match
 * the Nature-of-Code-inspired theme.
 *
 * npm install p5
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import p5 from 'p5';
import { createSketch, validateSpec } from './engine';
import { theme, themeCSSVars } from './theme';

export default function AnimationPlayer({ spec, width = 600, height = 400, autoplay = true }) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [progress, setProgress] = useState(0); // 0..1
  const [validation, setValidation] = useState(null);
  const rafRef = useRef(null);

  // (re)mount the p5 sketch whenever the spec changes
  useEffect(() => {
    const result = validateSpec(spec);
    setValidation(result);
    if (!result.valid || !containerRef.current) return undefined;

    const sketch = createSketch(spec, { width, height });
    const instance = new p5(sketch, containerRef.current);
    instanceRef.current = instance;
    setIsPlaying(autoplay);
    if (!autoplay) instance.pause?.();

    return () => {
      instance.remove(); // critical — prevents leaked canvases/draw loops
      instanceRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, width, height]);

  // progress bar polling (lightweight; avoids re-rendering p5 itself)
  useEffect(() => {
    function tick() {
      const inst = instanceRef.current;
      if (inst && spec?.duration) {
        const elapsed = inst.millis ? inst.millis() : 0;
        // best-effort: engine tracks its own internal elapsed; this is an
        // approximation for the UI scrubber only.
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [spec]);

  const handlePlayPause = useCallback(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    if (isPlaying) inst.pause();
    else inst.play();
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleRestart = useCallback(() => {
    const inst = instanceRef.current;
    if (!inst) return;
    inst.restart();
    setIsPlaying(true);
  }, []);

  const handleScrub = useCallback((e) => {
    const inst = instanceRef.current;
    if (!inst || !spec?.duration) return;
    const t = parseFloat(e.target.value);
    setProgress(t);
    inst.seek(t * spec.duration);
    setIsPlaying(false);
  }, [spec]);

  if (validation && !validation.valid) {
    return (
      <div style={styles.errorBox}>
        <strong>Couldn't render this animation.</strong>
        <ul>{validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <style>{`.anim-player { ${themeCSSVars} }`}</style>
      <div className="anim-player" style={styles.canvasFrame} ref={containerRef} />
      <div style={styles.controls}>
        <button style={styles.iconButton} onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button style={styles.iconButton} onClick={handleRestart} aria-label="Restart">↺</button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={handleScrub}
          style={styles.scrubber}
        />
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px',
    background: theme.backgroundAlt,
    border: `1px solid ${theme.gridLine}`,
    borderRadius: '10px',
    boxShadow: `0 2px 10px ${theme.shadow}`,
  },
  canvasFrame: {
    borderRadius: '6px',
    overflow: 'hidden',
    border: `1px solid ${theme.gridLine}`,
    lineHeight: 0,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  iconButton: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: `1px solid ${theme.ink}`,
    background: theme.background,
    color: theme.ink,
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubber: {
    flex: 1,
    accentColor: theme.accentRed,
  },
  errorBox: {
    padding: '16px',
    background: '#F6E7E2',
    border: `1px solid ${theme.accentRed}`,
    borderRadius: '8px',
    color: theme.ink,
    fontFamily: 'sans-serif',
    fontSize: '14px',
  },
};
