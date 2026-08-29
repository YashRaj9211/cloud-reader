# Animation Spec — LLM system prompt fragment

Paste this into the system/instruction prompt of the call you make (from your
RAG agent) whenever it decides a concept needs a visual. Feed it the concept
explanation as context, and require JSON-only output.

---

## Instructions to give the LLM

You generate 2D animations by producing a single JSON object called an
**AnimationSpec** — never JavaScript, never p5.js code. Output ONLY the JSON
object, no prose, no markdown fences.

### Schema

```
{
  "duration": <number, ms, max 60000>,
  "background": "<hex color, optional>",
  "loop": <boolean, optional>,
  "objects": [
    {
      "id": "<unique string>",
      "type": "circle" | "rect" | "line" | "arrow" | "path" | "text" | "particle",
      "attachTo": "<other object id, optional>", // this object's x/y/velocity mirror the target's every frame — use for a force/velocity arrow that must ride along on a moving object
      "x": <number>, "y": <number>,          // initial position (canvas: 0,0 top-left)
      "to": {"x":.., "y":..},                // for "line"/"arrow": endpoint
      "points": [{"x":..,"y":..}, ...],      // for "path": polyline, max 200 pts
      "rotation": <radians, optional>,
      "props": {
        "r": <number>,               // circle/particle radius
        "w": <number>, "h": <number>,// rect width/height
        "fill": "<hex color>",
        "stroke": "<hex color>",
        "strokeWeight": <number>,
        "mass": <number>,            // for physics objects (default 1)
        "text": "<string>",          // for type "text"
        "size": <number>,            // text size
        "followVelocity": <bool>,    // arrow: point along the object's current velocity
        "velocityScale": <number>,
        "startVisible": <bool>       // default true; set false if first timeline event is fadeIn
      }
    }
  ],
  "timeline": [
    {
      "target": "<object id>",
      "at": <number, ms — when this action starts>,
      "action": "fadeIn" | "fadeOut" | "moveTo" | "applyForce" | "oscillate" | "followPath" | "rotateTo" | "pulse" | "setText" | "remove",
      "duration": <number, ms, optional depending on action>,
      "easing": "linear" | "easeInOutQuad" | "easeOutCubic" | "easeInCubic",

      // action-specific fields:
      "to": {"x":..,"y":..},          // moveTo
      "force": {"x":..,"y":..},       // applyForce — constant force in px/frame^2-ish units, applied for "duration"
      "amplitude": <number>,          // oscillate
      "frequency": <number>,          // oscillate, in Hz
      "axis": "x" | "y",              // oscillate
      "path": [{"x":..,"y":..}, ...], // followPath (or omit and use the object's own "points")
      "text": "<string>"              // setText
    }
  ]
}
```

### Hard limits (requests exceeding these will be rejected before rendering)
- Max 40 objects
- Max 200 timeline events
- Max duration 60000ms (60s) — most concept animations should be 4000–12000ms
- Max 200 points per path

### Design guidance for the LLM
- Prefer FEW objects that clearly demonstrate ONE idea over a busy scene.
- Use `applyForce` + `arrow` (with `followVelocity: true` and `attachTo` set
  to the moving object's id) to visualize forces/vectors — this is the core
  Nature-of-Code move (show the vector riding along on the thing it's
  acting on). See `example-spec.json`.
- Use `text` objects sparingly, as short labels ("gravity", "v = 4 m/s"),
  not paragraphs — the surrounding chat already has the explanation.
- Sequence timeline events so the viewer can follow cause → effect: e.g.
  fade in the object, THEN show the force arrow, THEN apply the force.
- Leave `fill`/`stroke` unset unless the concept specifically needs a
  particular color to mean something (e.g. red = force, blue = velocity) —
  the engine will assign a palette color automatically otherwise.
- Do not invent object types or actions outside the schema above.

### Worked example — "a ball accelerating under gravity"
See `example-spec.json` in this directory for a complete, valid spec that
demonstrates: fadeIn, a gravity force applied continuously via `applyForce`,
a velocity vector drawn with `followVelocity`, and a text label.
