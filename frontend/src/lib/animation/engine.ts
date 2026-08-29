/**
 * engine.ts
 *
 * A tiny declarative animation engine on top of p5.js (instance mode).
 * It does NOT execute LLM-generated code. It interprets a plain-data
 * "AnimationSpec" (see types.ts / llm-schema.md) — a list of objects and a
 * timeline of actions — and draws it every frame. This keeps LLM output
 * sandboxed: the model can only ever produce data, never behavior.
 *
 * Usage:
 *   import p5 from 'p5';
 *   import { createSketch } from './engine';
 *   const sketch = createSketch(spec, { width, height });
 *   const instance = new p5(sketch, containerEl);
 *   instance.play() / .pause() / .restart() / .seek(ms)
 */

import type p5Type from 'p5';
import { theme } from './theme';
import type {
  AnimationSpec,
  AnimationObject,
  TimelineEvent,
  ValidationResult,
  Point,
} from './types';

// ---------- limits (guardrails against pathological LLM output) ----------
export const LIMITS = {
  MAX_OBJECTS: 40,
  MAX_TIMELINE_EVENTS: 200,
  MAX_DURATION_MS: 60_000,
  MAX_PATH_POINTS: 200,
} as const;

// ---------- easing ----------
const Easing: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic: (t) => t * t * t,
};

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// ---------- spec validation ----------
/**
 * Validates an AnimationSpec against basic shape/limit rules.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
export function validateSpec(spec: unknown): ValidationResult {
  const errors: string[] = [];
  const ALLOWED_TYPES = ['circle', 'rect', 'line', 'arrow', 'path', 'text', 'particle'];
  const ALLOWED_ACTIONS = [
    'fadeIn', 'fadeOut', 'moveTo', 'applyForce', 'oscillate',
    'followPath', 'rotateTo', 'pulse', 'setText', 'remove',
  ];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['spec must be an object'] };
  }

  const s = spec as Record<string, unknown>;

  if (typeof s.duration !== 'number' || s.duration <= 0) {
    errors.push('duration must be a positive number (ms)');
  }
  if (typeof s.duration === 'number' && s.duration > LIMITS.MAX_DURATION_MS) {
    errors.push(`duration exceeds max of ${LIMITS.MAX_DURATION_MS}ms`);
  }
  if (!Array.isArray(s.objects)) {
    errors.push('objects must be an array');
  } else {
    if (s.objects.length > LIMITS.MAX_OBJECTS) {
      errors.push(`too many objects (max ${LIMITS.MAX_OBJECTS})`);
    }
    const ids = new Set<string>();
    for (const obj of s.objects as AnimationObject[]) {
      if (!obj.id || typeof obj.id !== 'string') errors.push('every object needs a string id');
      if (ids.has(obj.id)) errors.push(`duplicate object id: ${obj.id}`);
      ids.add(obj.id);
      if (!ALLOWED_TYPES.includes(obj.type)) {
        errors.push(`object ${obj.id}: unknown type "${obj.type}"`);
      }
      if (obj.type === 'path' && Array.isArray(obj.points) && obj.points.length > LIMITS.MAX_PATH_POINTS) {
        errors.push(`object ${obj.id}: path has too many points`);
      }
    }
  }
  if (!Array.isArray(s.timeline)) {
    errors.push('timeline must be an array');
  } else {
    if (s.timeline.length > LIMITS.MAX_TIMELINE_EVENTS) {
      errors.push(`too many timeline events (max ${LIMITS.MAX_TIMELINE_EVENTS})`);
    }
    for (const ev of s.timeline as TimelineEvent[]) {
      if (typeof ev.at !== 'number' || ev.at < 0) errors.push('timeline event missing valid "at"');
      if (!ALLOWED_ACTIONS.includes(ev.action)) errors.push(`unknown action "${ev.action}"`);
      if (!ev.target || typeof ev.target !== 'string') errors.push('timeline event missing "target" id');
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------- runtime object state ----------
interface RuntimeObject {
  id: string;
  type: string;
  spec: AnimationObject;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWeight: number;
  text: string;
  vel: Point;
  acc: Point;
  mass: number;
  activeForces: Map<string, Point>;
  activeOscillations: Map<string, unknown>;
  removed: boolean;
}

function makeRuntimeObject(objSpec: AnimationObject, paletteIndex: number): RuntimeObject {
  const fallbackColor = theme.palette[paletteIndex % theme.palette.length];
  return {
    id: objSpec.id,
    type: objSpec.type,
    spec: objSpec,
    x: objSpec.x ?? objSpec.from?.x ?? 0,
    y: objSpec.y ?? objSpec.from?.y ?? 0,
    rotation: objSpec.rotation ?? 0,
    scale: 1,
    opacity: objSpec.props?.startVisible === false ? 0 : 1,
    fill: objSpec.props?.fill ?? fallbackColor,
    stroke: objSpec.props?.stroke ?? theme.ink,
    strokeWeight: objSpec.props?.strokeWeight ?? 2,
    text: objSpec.props?.text ?? '',
    vel: { x: 0, y: 0 },
    acc: { x: 0, y: 0 },
    mass: objSpec.props?.mass ?? 1,
    activeForces: new Map(),
    activeOscillations: new Map(),
    removed: false,
  };
}

// Extend AnimationObject type with from for convenience
declare module './types' {
  interface AnimationObject {
    from?: Point;
  }
}

// ---------- action runners ----------
function runFadeIn(obj: RuntimeObject, ev: TimelineEvent, elapsed: number) {
  const t = Easing[ev.easing || 'easeOutCubic'](clamp01(elapsed / (ev.duration ?? 500)));
  obj.opacity = lerp(0, 1, t);
}

function runFadeOut(obj: RuntimeObject, ev: TimelineEvent, elapsed: number) {
  const t = Easing[ev.easing || 'easeOutCubic'](clamp01(elapsed / (ev.duration ?? 500)));
  obj.opacity = lerp(1, 0, t);
}

function runMoveTo(obj: RuntimeObject, ev: TimelineEvent, elapsed: number, startPos: Point) {
  const t = Easing[ev.easing || 'easeInOutQuad'](clamp01(elapsed / (ev.duration ?? 1000)));
  const p = lerpPoint(startPos, ev.to!, t);
  obj.x = p.x;
  obj.y = p.y;
}

function runRotateTo(obj: RuntimeObject, ev: TimelineEvent, elapsed: number, startRot: number) {
  const t = Easing[ev.easing || 'easeInOutQuad'](clamp01(elapsed / (ev.duration ?? 1000)));
  obj.rotation = lerp(startRot, ev.to as unknown as number, t);
}

function runPulse(obj: RuntimeObject, ev: TimelineEvent, elapsed: number) {
  const dur = ev.duration ?? 600;
  const t = clamp01(elapsed / dur);
  const peak = ev.scale ?? 1.3;
  obj.scale = 1 + (peak - 1) * Math.sin(Math.PI * t);
}

function runApplyForce(obj: RuntimeObject, dtSec: number) {
  let fx = 0, fy = 0;
  for (const f of obj.activeForces.values()) {
    fx += f.x;
    fy += f.y;
  }
  obj.acc.x = fx / obj.mass;
  obj.acc.y = fy / obj.mass;
  obj.vel.x += obj.acc.x * dtSec * 60;
  obj.vel.y += obj.acc.y * dtSec * 60;
  obj.x += obj.vel.x * dtSec * 60;
  obj.y += obj.vel.y * dtSec * 60;
}

function runOscillate(obj: RuntimeObject, ev: TimelineEvent, elapsedTotalSec: number, origin: Point) {
  const amp = ev.amplitude ?? 20;
  const freq = ev.frequency ?? 1;
  const axis = ev.axis || 'y';
  const offset = amp * Math.sin(2 * Math.PI * freq * elapsedTotalSec);
  if (axis === 'y') obj.y = origin.y + offset;
  else obj.x = origin.x + offset;
}

function runFollowPath(obj: RuntimeObject, ev: TimelineEvent, elapsed: number) {
  const pts = ev.path || obj.spec.points || [];
  if (pts.length < 2) return;
  const dur = ev.duration ?? 2000;
  const t = clamp01(elapsed / dur);
  const segT = t * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(segT));
  const localT = segT - i;
  const p = lerpPoint(pts[i], pts[i + 1], localT);
  obj.x = p.x;
  obj.y = p.y;
}

// ---------- draw helpers ----------
function withStyle(p: p5Type, obj: RuntimeObject, drawFn: () => void) {
  p.push();
  p.translate(obj.x, obj.y);
  p.rotate(obj.rotation);
  p.scale(obj.scale);
  const a = clamp01(obj.opacity);
  const fillC = p.color(obj.fill);
  const strokeC = p.color(obj.stroke);
  p.fill(p.red(fillC), p.green(fillC), p.blue(fillC), a * 255);
  p.stroke(p.red(strokeC), p.green(strokeC), p.blue(strokeC), a * 255);
  p.strokeWeight(obj.strokeWeight);
  drawFn();
  p.pop();
}

function drawArrowhead(p: p5Type, len = 10, width = 6) {
  p.push();
  p.noStroke();
  p.triangle(0, 0, -len, width / 2, -len, -width / 2);
  p.pop();
}

function drawObject(p: p5Type, obj: RuntimeObject) {
  if (obj.removed || obj.opacity <= 0) return;
  const s = obj.spec;
  switch (obj.type) {
    case 'circle': {
      const r = s.props?.r ?? 20;
      withStyle(p, obj, () => p.circle(0, 0, r * 2));
      break;
    }
    case 'rect': {
      const w = s.props?.w ?? 40, h = s.props?.h ?? 40;
      withStyle(p, obj, () => { p.rectMode(p.CENTER); p.rect(0, 0, w, h, 4); });
      break;
    }
    case 'particle': {
      const r = s.props?.r ?? 6;
      withStyle(p, obj, () => p.circle(0, 0, r * 2));
      break;
    }
    case 'line': {
      const to = s.to || { x: obj.x + 50, y: obj.y };
      withStyle(p, obj, () => p.line(0, 0, to.x - obj.x, to.y - obj.y));
      break;
    }
    case 'arrow': {
      let dx = (s.to?.x ?? obj.x + 60) - obj.x;
      let dy = (s.to?.y ?? obj.y) - obj.y;
      if (s.props?.followVelocity) {
        const scaleF = s.props?.velocityScale ?? 10;
        dx = obj.vel.x * scaleF;
        dy = obj.vel.y * scaleF;
      }
      withStyle(p, obj, () => {
        p.line(0, 0, dx, dy);
        p.push();
        p.translate(dx, dy);
        p.rotate(Math.atan2(dy, dx));
        drawArrowhead(p);
        p.pop();
      });
      break;
    }
    case 'path': {
      const pts = s.points || [];
      p.push();
      const a = clamp01(obj.opacity);
      const strokeC = p.color(obj.stroke);
      p.noFill();
      p.stroke(p.red(strokeC), p.green(strokeC), p.blue(strokeC), a * 255);
      p.strokeWeight(obj.strokeWeight);
      p.beginShape();
      for (const pt of pts) p.vertex(pt.x, pt.y);
      p.endShape();
      p.pop();
      break;
    }
    case 'text': {
      p.push();
      p.translate(obj.x, obj.y);
      const a = clamp01(obj.opacity);
      const inkC = p.color(obj.fill || theme.ink);
      p.fill(p.red(inkC), p.green(inkC), p.blue(inkC), a * 255);
      p.noStroke();
      p.textSize(s.props?.size ?? 16);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(obj.text, 0, 0);
      p.pop();
      break;
    }
    default:
      break;
  }
}

// ---------- timeline event state (stored on ev objects) ----------
// We annotate runtime data directly onto event objects (avoids a separate Map).
type RuntimeEvent = TimelineEvent & {
  __startPos?: Point;
  __startRot?: number;
  __origin?: Point;
};

// ---------- the sketch factory ----------
export interface SketchOptions {
  width?: number;
  height?: number;
  loop?: boolean;
  background?: string;
  parentId?: string;
}

/**
 * createSketch(spec, opts) -> p5 instance-mode sketch function
 */
export function createSketch(spec: AnimationSpec, opts: SketchOptions = {}) {
  const width = opts.width ?? 600;
  const height = opts.height ?? 400;
  const bg = opts.background ?? spec.background ?? theme.background;
  const shouldLoop = opts.loop ?? spec.loop ?? false;

  return function sketch(p: p5Type) {
    let objects = new Map<string, RuntimeObject>();

    function initObjects() {
      objects = new Map();
      // Reset runtime state on timeline events too
      for (const ev of spec.timeline) {
        const re = ev as RuntimeEvent;
        delete re.__startPos;
        delete re.__startRot;
        delete re.__origin;
      }
      spec.objects.forEach((o, idx) => objects.set(o.id, makeRuntimeObject(o, idx)));
    }

    let startTimeMs = 0;
    let pausedAtMs: number | null = null;
    let manualSeekMs: number | null = null;

    function elapsedMs(): number {
      if (manualSeekMs !== null) return manualSeekMs;
      if (pausedAtMs !== null) return pausedAtMs;
      return p.millis() - startTimeMs;
    }

    p.setup = () => {
      const canvas = p.createCanvas(width, height);
      // Explicitly parent the canvas into the container element.
      // When opts.parentId is set, use that id; otherwise fall back to
      // p._userNode which is the DOM element passed to `new p5(sketch, el)`.
      // Without this explicit call, p5 falls back to appending to document.body.
      if (opts.parentId) {
        canvas.parent(opts.parentId);
      } else if ((p as any)._userNode) {
        canvas.parent((p as any)._userNode);
      }
      p.frameRate(60);
      initObjects();
      startTimeMs = p.millis();
    };

    p.draw = () => {
      p.background(bg);

      let elapsed = elapsedMs();
      if (shouldLoop && elapsed > spec.duration) {
        startTimeMs = p.millis();
        elapsed = 0;
        initObjects();
      }
      const dtSec = 1 / 60;

      // process timeline
      for (const ev of spec.timeline) {
        const re = ev as RuntimeEvent;
        const obj = objects.get(ev.target);
        if (!obj) continue;
        const evElapsed = elapsed - ev.at;
        const evDuration = ev.duration ?? 0;
        const isActive = evElapsed >= 0 && (evDuration === 0 || evElapsed <= evDuration);
        const evKey = `${ev.target}:${ev.action}:${ev.at}`;

        if (!isActive) {
          if (ev.action === 'applyForce') obj.activeForces.delete(evKey);
          continue;
        }

        switch (ev.action) {
          case 'fadeIn':    runFadeIn(obj, ev, evElapsed); break;
          case 'fadeOut':   runFadeOut(obj, ev, evElapsed); break;
          case 'pulse':     runPulse(obj, ev, evElapsed); break;
          case 'moveTo': {
            re.__startPos = re.__startPos || { x: obj.spec.x ?? obj.x, y: obj.spec.y ?? obj.y };
            runMoveTo(obj, ev, evElapsed, re.__startPos);
            break;
          }
          case 'rotateTo': {
            re.__startRot = re.__startRot ?? (obj.spec.rotation ?? 0);
            runRotateTo(obj, ev, evElapsed, re.__startRot);
            break;
          }
          case 'applyForce': {
            obj.activeForces.set(evKey, ev.force || { x: 0, y: 0 });
            runApplyForce(obj, dtSec);
            break;
          }
          case 'oscillate': {
            re.__origin = re.__origin || { x: obj.spec.x ?? obj.x, y: obj.spec.y ?? obj.y };
            runOscillate(obj, ev, elapsed / 1000, re.__origin);
            break;
          }
          case 'followPath': runFollowPath(obj, ev, evElapsed); break;
          case 'setText':    obj.text = ev.text ?? obj.text; break;
          case 'remove':     obj.removed = true; break;
          default: break;
        }
      }

      // sync "attached" objects (e.g. force arrow that tracks mover position)
      for (const o of spec.objects) {
        if (!o.attachTo) continue;
        const obj = objects.get(o.id);
        const target = objects.get(o.attachTo);
        if (!obj || !target) continue;
        obj.x = target.x;
        obj.y = target.y;
        obj.vel = target.vel;
      }

      // draw in declared order (z-order = array order)
      for (const o of spec.objects) {
        const obj = objects.get(o.id);
        if (obj) drawObject(p, obj);
      }
    };

    // ---- transport controls exposed on the p5 instance ----
    (p as any).play = () => {
      if (pausedAtMs !== null) {
        startTimeMs = p.millis() - pausedAtMs;
        pausedAtMs = null;
      }
      manualSeekMs = null;
      p.loop();
    };
    (p as any).pause = () => {
      pausedAtMs = elapsedMs();
      p.noLoop();
    };
    (p as any).restart = () => {
      startTimeMs = p.millis();
      pausedAtMs = null;
      manualSeekMs = null;
      initObjects();
      p.loop();
    };
    (p as any).seek = (ms: number) => {
      manualSeekMs = Math.max(0, Math.min(spec.duration, ms));
      initObjects();
    };
    (p as any).getElapsed = (): number => elapsedMs();
  };
}
