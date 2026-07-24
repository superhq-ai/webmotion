---
name: webmotion
description: "Author deterministic, browser-rendered videos with @superhq/webmotion, declarative <w-*> HTML scenes or a TypeScript API, live DOM preview, MP4 export via WebCodecs, no headless Chrome or FFmpeg. Includes 3D: glTF/GLB models with animation clips, turntable spins, studio lighting, runtime text on material slots, and app-defined TSL shader effects via <w-model>. Includes live mode: unbounded event-driven overlays (OBS browser sources, stream alerts, persistent widgets) via LiveStage. Use when the user wants motion graphics, title cards, launch/product videos, product turntables, kinetic typography, stream overlays, or programmatic video in the browser; mentions webmotion or @superhq/webmotion; or wants DOM/canvas/3D animation exported to MP4."
---

# WebMotion

Browser-native, deterministic video composition. The one rule that governs everything you write: **everything visible is a pure function of the current frame.** Never read `Date.now()`, `Math.random()`, wall-clock time, or `requestAnimationFrame` timestamps to decide what to draw; derive every value from the frame index. Seeking to frame N must always produce the same image.

## Setup

```bash
npm install @superhq/webmotion
```

Entry points:

| Import | Gives you |
| --- | --- |
| `@superhq/webmotion` | Programmatic core: `Composition`, `Runtime`, `Layer`, `Sequence`, `CanvasRenderer`, `interpolate`, `Easing`, `exportVideo` |
| `@superhq/webmotion/elements` | Declarative layer: registers all `<w-*>` custom elements on import |
| `@superhq/webmotion/html-in-canvas` | `HtmlRenderer`: rasterizes live DOM per frame (SVG foreignObject) |
| `@superhq/webmotion/three` | Registers `<w-model>` and `<w-light>` for 3D. Needs `npm install three` (optional peer dep); import alongside `/elements` |
| `@superhq/webmotion/video` | Registers `<w-video>` for raw video clips (WebCodecs decode). Needs `npm install mp4box` (optional peer dep); import alongside `/elements` |

Preview works in any modern browser. **MP4 export needs a Chromium-based browser** (WebCodecs H.264 + `OffscreenCanvas`).

Starting a fresh project? Scaffold the Vite starter instead of wiring preview and export by hand; it ships a live preview, a zoomable scrub timeline (section labels + audio lane), and an Export MP4 button:

```bash
npx degit superhq-ai/webmotion/template my-video && cd my-video && npm install && npm run dev
```

The user's scene lives in `src/scene.js`: a `config` object (`width`, `height`, `fps`, `duration`, `background`, `downloadName`) and a `scene` string of `<w-*>` markup. Author the video by editing that string; put a `label="..."` on top-level `<w-sequence>` beats to name them on the scrub bar. Don't touch `src/player.js` (the preview/export UI) unless asked.

## Declarative authoring (preferred)

Import once, then the scene is markup:

```html
<script type="module">import "@superhq/webmotion/elements";</script>

<w-composition width="1280" height="720" fps="30" duration="240" autoplay>
  <style>
    w-composition { font-family: -apple-system, "SF Pro Display", sans-serif; }
    .headline { font-size: 96px; font-weight: 700; text-align: center; color: #f5f6f8; }
  </style>

  <w-defs>
    <w-animation name="fade-up">
      <w-animate property="opacity" from="0"  to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
      <w-animate property="y"       from="40" to="0" start="0" end="18" easing="easeOutCubic"></w-animate>
    </w-animation>
  </w-defs>

  <w-rect x="0" y="0" width="1280" height="720" fill="#0b0d14"></w-rect>

  <w-sequence from="12">
    <w-text class="headline" motion="fade-up" x="0" y="250" width="1280">Author in HTML.</w-text>
  </w-sequence>
</w-composition>
```

### Elements

| Element | Attributes | Notes |
| --- | --- | --- |
| `<w-composition>` | `width` `height` `fps` `duration` (frames) `poster` (frame) `autoplay` `loop` `background` `template` (selector of an inert `<template>` to instantiate) | The root. Owns the frame clock, scales itself to fit its container width. Without `loop`, playback stops on the last frame and fires `w-ended`. |
| `<w-sequence>` | `from` (frame) `duration` (frames, omit = unbounded) `label` (names the window on the player timeline) | Timing window. Hides its subtree outside `[from, from+duration)` and shifts the frame origin to local time for descendants. Nestable; offsets accumulate. Top-level labels become chapters; a label nested inside a labelled sequence becomes a sub-section on an overlay lane. |
| `<w-player>` | — (`chapters` and `timelineZoom` are JS properties) | The standard transport around a slotted `<w-composition>`: play/pause, zoomable scrub timeline (chapter rail and overlay lanes from `<w-sequence label>`, audio lanes from `<w-audio>`, overlapping clips stack), volume/mute, fullscreen, keyboard control. Full spec: docs/PLAYER.md. |
| `<w-text>` | `x` `y` `width` `height` `opacity` `text` `font` `color` `align` | Text from child text nodes (preferred) or the `text` attribute. |
| `<w-rect>` | `x` `y` `width` `height` `opacity` `fill` (any CSS background) `radius` | Rectangle / gradient / image panel. |
| `<w-el>` | `x` `y` `width` `height` `opacity` | Generic entity; put arbitrary HTML inside. |
| `<w-transition>` | `pattern` (`dither` `dissolve` `wipe` `iris`) `color` `cell` (px) `dir` `edge` `seed` `smooth` `delay` `enter` `hold` `exit` (frames) `easing` | Cut/dissolve/wipe/iris plate on one live canvas. `amount` 0->1 covers the box with `color` through the pattern; derive it from `enter`/`hold`/`exit` (or drive `<w-animate property="amount">`). Place at the top level so it becomes its own layer. Full spec: docs/TRANSITIONS.md. |
| `<w-animate>` | `property` `from` `to` `start` `end` `easing` | One tween. As a child of an entity it animates that entity. Renders nothing. |
| `<w-defs>` / `<w-animation name>` | — / `name` | Named animation definitions (groups of `<w-animate>`), inert. |
| `<w-audio>` | `src` `from` `duration` `offset` (frames into source) `gain` | A sound clip on the timeline, inert. Participates in sequence time like visuals; `gain` animates via `<w-animate property="gain">` (local frames, replaces the base attribute). Full spec: docs/AUDIO.md. |
| `<w-data>` | `name` | Named JSON data (element text content), for `<w-for>`. Inert. |
| `<w-for>` | `each` (array path) or `count` (number), `as` (default `item`), `index` (default `i`) | Repetition by macro expansion at setup: children are stamped once per item with `{...}` placeholders substituted. Full spec: docs/TEMPLATE.md. |
| `<w-if>` | `when` (expression) | Static variant selection: stamps its children once at setup when truthy (`false`, `0`, `""`, `null`, empty arrays are falsy). No else, no comparison operators; compute booleans into the data. |
| `<w-model>` | `src` (glTF/GLB url) `x` `y` `width` `height` `opacity` `animation` (clip name) `animation-from` `speed` `loop` `rotation` ("x y z" deg) `spin` (deg/sec around Y) `camera` `look-at` `fov` `lights` (preset) `environment` `environment-intensity` `shadow` (opacity) `tone-mapping` `exposure` `background` | 3D entity (requires the `/three` entry). Clips run on the frame clock; no camera attr auto-frames the model. DRACO, KTX2, and Meshopt compressed files decode out of the box. Full spec: docs/THREE.md. |
| `<w-video>` | `src` (MP4 url) `x` `y` `width` `height` `opacity` `from` (local start frame) `trim` (seconds into source) `speed` `loop` `muted` `volume` (0..1) `fit` (`cover`/`contain`/`fill`) | Raw video clip (requires the `/video` entry). Frame-exact WebCodecs decode drawn on a live canvas; its audio folds into the mix. Place at the top level so it is its own layer. MP4 only. Full spec: docs/VIDEO.md. |
| `<w-light>` | `type` (`ambient` `hemisphere` `directional` `point` `spot`) `color` `ground-color` `position` ("x y z") `intensity` `angle` `penumbra` `distance` `decay` | Child of `<w-model>`, usually with `lights="none"` on the model. Numeric properties (`intensity` `x` `y` `z` `angle` `penumbra` `distance`) tween via child `<w-animate>`. Inert. |
| `<w-material-text>` | `material` (slot name) `text` `background` `color` `font` `image` (base art, alpha = silhouette) `logo` `logo-url` `resolution` `aspect` `flip` (`180`) `source` (data key for text) `bind-background` `bind-color` `bind-logo` (data keys for live restyling) | Child of `<w-model>`: draws text and an optional logo into a canvas that becomes the named material slot's texture. Injection-safe for untrusted strings (canvas, never markup); fits up to 3 lines, short lines render big. Full spec: docs/THREE.md. |
| `<w-shader-fx>` | `material` (slot name) `effect` (registered name) `accent` (color) `amount` | Child of `<w-model>`: runs an application-registered shader effect on a material slot; tween `amount` via child `<w-animate>`. Register effects in JS with `registerShaderEffect(name, factory)` from the `/three` entry (TSL node materials or direct material mutation; the framework ships no effects). Full spec: docs/THREE.md. |

All entities are absolutely positioned by `x`/`y`/`width`/`height` in composition pixels.

### Motion rules (full spec: docs/MOTION.md in the repo)

- `<w-animate property="opacity|x|y|scale|rotate" ...>` composes into one transform + opacity per entity per frame. Any other `property` (e.g. `letter-spacing`, `border-radius`) is written to style as `value + unit` (unit taken from `to`/`from`, e.g. `to="20px"`).
- `start`/`end` are frames in the **local time** of the nearest enclosing `<w-sequence>`. Values clamp outside the window.
- Easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInSine`, `easeOutSine`, `easeInOutSine`, or any css `cubic-bezier(x1, y1, x2, y2)` string. Overshoot slams: `cubic-bezier(0.2, 1.4, 0.3, 1)` with a scale tween from ~2.2 down to 1 over 5-7 frames.
- Apply named animations with `motion="fade-up pop-in"` (space-separated, like `class`). Resolution walks up to the nearest `<w-defs>`; inner scopes shadow outer. Application order: named left to right, then inline children; last write to a property wins.
- **Stagger via structure, not parameters**: there is no delay attribute. Wrap instances in `<w-sequence from="8">` etc. Definitions always start at local frame 0.

```html
<w-sequence from="70">
  <w-sequence from="0"><w-text motion="pop-in">first</w-text></w-sequence>
  <w-sequence from="8"><w-text motion="pop-in">second</w-text></w-sequence>
</w-sequence>
```

### Styling

Frame-varying values are tweens; frame-constant values are CSS. Use a `<style>` block, classes, inheritance (`font-family` and `color` inherit from `w-composition` down), and custom properties. Stylesheet styling renders identically in preview and export (the rasterizer embeds document stylesheets). Entity attributes like `font`/`color`/`fill` are one-off conveniences, same tier as inline style.

### Playback and export

```js
const comp = document.querySelector("w-composition");
await comp.ready;           // setup is deferred one frame after connect
comp.seek(42);              // deterministic; fires a "w-seek" CustomEvent {detail:{frame}}
comp.play(); comp.pause();  // preview paced by the clock, rendered by frame index
comp.playing;               // readonly state
comp.volume = 0.5;          // preview-only master volume (0..1); export is unaffected
comp.muted = true;
comp.loop = true;           // or the `loop` attribute; default is play-once + "w-ended"
// Events: "w-play", "w-pause", "w-seek" {frame}, "w-ended", "w-volumechange" {volume, muted}
const blob = await comp.export({
  bitrate: 8_000_000,
  onProgress: ({ frame, total }) => {},
}); // => video/mp4 Blob
```

For a ready-made UI wrap the composition in `<w-player>` (see the elements table); for canvas runtimes, `PlaybackController` from the core package provides the same play/seek/volume surface and events.

### Live mode (stream overlays)

`@superhq/webmotion/live` renders unbounded, event-driven overlays (OBS
browser sources, donation alerts, persistent widgets) instead of a fixed
timeline. Props are registered templates; triggers expand them with runtime
data via the same `{placeholder}` machinery:

```js
import { LiveStage } from "@superhq/webmotion/live";
const stage = new LiveStage(container, { width: 1920, height: 1080 });
stage.registerProp("alert", alertMarkup);        // or registerPropUrl(name, url)
await stage.preload(["alert"], { alert: sampleData }); // warm shaders + textures
stage.trigger("alert", { donor: "RILEY", amount: "5" }); // one-shot; unmounts at duration
stage.trigger("widget", data);                   // props marked persistent stay
stage.update("widget", data);                    // rebind in place, no remount
stage.dismiss("widget");
```

One-shot retriggers coalesce at depth 1 (current instance finishes, latest
pending data plays); `{ mode: "restart" }` replays immediately. Runtime data
is treated as hostile: it lands through text nodes and canvas textures only,
with length caps. Idle cost is zero (no mounted props, no rAF). A prop that
throws unmounts to nothing; the stage survives. Design doc: docs/LIVE-RFC.md.

## Programmatic API (canvas or custom components)

```js
import { Composition, Runtime, Layer, Sequence, CanvasRenderer, interpolate, Easing } from "@superhq/webmotion";

const composition = new Composition({ width: 1280, height: 720, fps: 30, durationInFrames: 180 });
const title = {
  mount() {},
  renderFrame({ ctx, frame, width, height }) {
    ctx.globalAlpha = interpolate(frame, [0, 20], [0, 1], { easing: Easing.easeOutCubic, extrapolateRight: "clamp" });
    ctx.font = "600 84px system-ui"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.fillText("Title", width / 2, height / 2);
  },
  destroy() {},
};
const runtime = new Runtime({
  composition,
  renderer: new CanvasRenderer(1280, 720, { canvas }),
  layers: [new Layer({ component: title, sequence: new Sequence({ from: 20 }) })],
});
await runtime.renderFrame(30);
```

For DOM-rendered components use `HtmlRenderer` from `@superhq/webmotion/html-in-canvas`; components then get `mount({ container })` and mutate real DOM per frame. Custom declarative behaviors register with `registerComponent(name, { parse, render })` from `@superhq/webmotion/elements` and attach by attribute (`name` or `name__id` for multiple instances).

## Recipes and craft

See [references/recipes.md](references/recipes.md) for complete, launch-quality scene patterns: staged typography, Ken Burns imagery, feature-line stagger, end cards, and pacing/easing guidance.

### Repetition

```html
<w-data name="features">["Deterministic.", "Browser-native.", "No render farm."]</w-data>
<w-for each="features" as="line">
  <w-sequence from="{6 + i * 30}">
    <w-text class="feature" motion="beat-in" x="0" y="{250 + i * 80}" width="1280">{line}</w-text>
  </w-sequence>
</w-for>
```

`{...}` placeholders are data paths plus `+ - * /` arithmetic, nothing else (no calls, no eval). Expansion stamps real elements once at setup; there is no reactivity. Data can also come from JS via the composition's `data` property (set before connect or before setup fires; wins over `<w-data>` on name conflicts). `<w-if when="flags.pro">` selects variants statically, per item inside loops or for whole beats; combined with `data`, one scene exports many personalized cuts. For data-dependent structure beyond that, generate markup in JS.

### Sound

```html
<w-audio src="assets/score.wav" gain="0.9">
  <w-animate property="gain" from="0.9" to="0" start="345" end="385"></w-animate>  <!-- outro fade -->
</w-audio>
<w-sequence from="72"><w-audio src="assets/whoosh.wav" gain="0.7"></w-audio></w-sequence>
```

Preview plays through a live `AudioContext` (frames pace off the audio clock); export mixes down sample-exact through an `OfflineAudioContext` and encodes AAC (Opus fallback) into the MP4. Sequences bound audio exactly like visuals.

### Transitions (cut between scenes)

Use `<w-transition>`, not a grid of fading cells. Sequence scene A to end where the plate is fully down and scene B to begin there; the transition covers, holds, and reveals over the seam:

```html
<w-sequence from="0"   duration="120"><!-- scene A --></w-sequence>
<w-sequence from="100" duration="100"><!-- scene B --></w-sequence>
<w-sequence from="100" duration="28">
  <w-transition pattern="dissolve" cell="96" color="#0f0f0f"
                x="0" y="0" width="1920" height="1080" enter="14" exit="14"></w-transition>
</w-sequence>
```

`enter` covers (`amount` 0->1), `exit` reveals (1->0), `hold` waits between. Fine `pattern="dither"` with small `cell` is a true dither; large `cell` is chunky blocks; `color` is usually the background. It draws on one canvas captured on the GPU path, so it stays cheap at export where hundreds of animated cells would collapse the frame rate. Keep it a top-level entity (direct child of the stage or a `<w-sequence>`). Full spec: docs/TRANSITIONS.md.

## Checking your work

You cannot see the video you just wrote. Do not hand a scene over without looking at it:

```bash
npx webmotion lint     # what is mechanically wrong
npx webmotion shoot    # PNGs of the key frames, into .webmotion/shots
```

Both find the scene themselves (`src/scene.js`, `scene.js`, or `index.html`) and both work on either authoring style. They need Playwright (`npm install --save-dev playwright`); it drives the user's installed Chrome.

`lint` catches exactly the pitfalls below, mechanically: conflicting tweens, text overflowing its box, an entity that never enters the frame, a cross-origin or missing asset, a font stack that resolves to nothing, a labelled beat where nothing moves. Fix every error before saying you are done. It exits non-zero when it finds one.

`shoot` prints a path per frame. **Read the images.** They are the only way to judge composition, spacing, and whether a beat reads at a glance. Narrow either tool while iterating: `--beat "Outro"` for lint, `--frames 120,135,150` for shoot.

Both key their sampling off `label="..."` on top-level `<w-sequence>` beats, so label them: an unlabelled scene reviews badly. Full rule reference: docs/CLI.md.

## Pitfalls

- Two tweens targeting the same property of the same element conflict across the whole timeline (clamped values still write; last one wins). For entrance + exit, put them on different nesting levels: wrapper `<w-el>` owns the exit, inner element owns the entrance. Opacity and transforms compose through nesting.
- Anything time-based that isn't derived from the frame breaks determinism and export accuracy. CSS `transition`/`animation` on entities is the same trap: the exporter seeks frames faster than wall time, so transitions smear. Use `<w-animate>`, and `<w-transition>` for scene cuts.
- A dissolve or wipe built from many animated `<w-el>` cells previews fine but crawls at export (each cell re-serializes the frame). Use `<w-transition>`: one live-canvas layer, near-free at export.
- Images in scenes must be same-origin (or CORS-readable); the rasterizer inlines them at export.
- Custom webfonts: ensure they are loaded (`document.fonts.ready`) before export starts, or the first frames rasterize in the fallback face. The exporter only embeds the faces a scene actually uses (matching family, and `unicode-range` covering the characters it renders), so a page-wide font link costs nothing on a scene that does not use it; system font stacks are still the cheapest and safest.
- `<w-sequence>` controls `display`; do not also set `display` on it.
- Export throws if no H.264 encoder is available; surface that error to the user (non-Chromium browsers).
- Autoplay policy: audio preview needs a user gesture to start the `AudioContext`; `autoplay` compositions run silent until first interaction.
- The composition scales to its container width; give the host element a real width.
- Stamped `<w-for>` output lands as siblings after the element; the template's own children stay inside it, inert. Scene queries must exclude them (`.closest("w-for")` filter), or selectors match the un-substituted template too.
