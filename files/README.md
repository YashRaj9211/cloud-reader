# Concept Animation Library (p5.js + React)

A tiny, LLM-safe declarative animation library, styled after
[natureofcode.com](https://natureofcode.com/), for illustrating concepts
inside your RAG book-Q&A app.

## Why declarative, not "let the LLM write p5.js"

The LLM never produces executable code — only a JSON **AnimationSpec**
(objects + a timeline of actions). `engine.js` is the only thing that
actually calls p5.js functions. This means:
- No `eval`, no arbitrary script execution risk.
- Cheap validation (`validateSpec`) before you ever render anything.
- Predictable, capped resource usage (object/timeline/duration limits).
- The LLM's job is narrow and easy to get right consistently.

## Files
- `theme.js` — Nature-of-Code-style color palette (warm paper, muted ink, desaturated accents).
- `engine.js` — the interpreter: turns a spec into a running p5.js sketch. Exports `createSketch()` and `validateSpec()`.
- `AnimationPlayer.jsx` — React component: mounts the sketch, gives you play/pause/restart/scrub UI.
- `llm-schema.md` — paste into your animation-generation system prompt.
- `example-spec.json` — a worked "ball under gravity" example.

## Install

```bash
npm install p5
```

## Wiring it into your RAG pipeline

1. User asks a question → your RAG pipeline retrieves context + generates the text answer, as today.
2. Your agent decides (a classifier prompt, or just always-offer) whether the
   concept would benefit from a visual.
3. If yes, make a **second** LLM call: system prompt = contents of
   `llm-schema.md` + your book excerpt/answer as context. Force JSON output
   (e.g. Claude's `response_format`/tool-use JSON mode, or just instruct
   "respond with only the JSON object").
4. `JSON.parse()` the result, run it through `validateSpec()`.
   - If invalid: log it, fall back to text-only (don't show a broken player).
   - If valid: pass it straight into `<AnimationPlayer spec={parsedSpec} />`.

```jsx
import AnimationPlayer from './animation-lib/AnimationPlayer';

function AnswerWithVisual({ answerText, animationSpec }) {
  return (
    <div>
      <p>{answerText}</p>
      {animationSpec && (
        <AnimationPlayer spec={animationSpec} width={520} height={340} />
      )}
    </div>
  );
}
```

## Extending the schema

The engine is intentionally small. Natural next additions, each a small,
contained change to `engine.js`:
- `field` object type (draws a grid of small arrows — e.g. a vector field, straight out of Nature of Code ch.1/4).
- `collide` action (simple boundary bounce, for "particles in a box" demos).
- `spawner` meta-object (periodically creates `particle` instances — for Perlin-noise / random-walk chapters).

Keep new actions/types **data-only** (parameters, not code) to preserve the
sandboxing property.

## Known simplifications (fine for v1, revisit if needed)
- `seek()` reinitializes objects and replays actions up to that point rather
  than storing keyframed snapshots — fine for specs under ~60s / 40 objects,
  but not free computationally if you expose fine-grained scrubbing on long specs.
- Physics integration is a simple Euler step normalized to 60fps, matching
  Nature of Code's own examples — not frame-rate-independent in a rigorous
  sense, but p5 targets 60fps by default so this is a reasonable trade-off.
