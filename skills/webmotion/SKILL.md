---
name: webmotion
description: Author deterministic, browser-rendered videos with @superhq/webmotion — declarative <w-*> HTML scenes or a TypeScript API, live DOM preview, MP4 export via WebCodecs, no headless Chrome or FFmpeg. Use when the user wants motion graphics, title cards, launch/product videos, kinetic typography, or programmatic video in the browser; mentions webmotion or @superhq/webmotion; or wants DOM/canvas animation exported to MP4.
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

Preview works in any modern browser. **MP4 export needs a Chromium-based browser** (WebCodecs H.264 + `OffscreenCanvas`).

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
| `<w-composition>` | `width` `height` `fps` `duration` (frames) `poster` (frame) `autoplay` `background` `template` (selector of an inert `<template>` to instantiate) | The root. Owns the frame clock, scales itself to fit its container width. |
| `<w-sequence>` | `from` (frame) `duration` (frames, omit = unbounded) | Timing window. Hides its subtree outside `[from, from+duration)` and shifts the frame origin to local time for descendants. Nestable; offsets accumulate. |
| `<w-text>` | `x` `y` `width` `height` `opacity` `text` `font` `color` `align` | Text from child text nodes (preferred) or the `text` attribute. |
| `<w-rect>` | `x` `y` `width` `height` `opacity` `fill` (any CSS background) `radius` | Rectangle / gradient / image panel. |
| `<w-el>` | `x` `y` `width` `height` `opacity` | Generic entity; put arbitrary HTML inside. |
| `<w-animate>` | `property` `from` `to` `start` `end` `easing` | One tween. As a child of an entity it animates that entity. Renders nothing. |
| `<w-defs>` / `<w-animation name>` | — / `name` | Named animation definitions (groups of `<w-animate>`), inert. |
| `<w-audio>` | `src` `from` `duration` `offset` (frames into source) `gain` | A sound clip on the timeline, inert. Participates in sequence time like visuals; `gain` animates via `<w-animate property="gain">` (local frames, replaces the base attribute). Full spec: docs/AUDIO.md. |
| `<w-data>` | `name` | Named JSON data (element text content), for `<w-for>`. Inert. |
| `<w-for>` | `each` (array path) or `count` (number), `as` (default `item`), `index` (default `i`) | Repetition by macro expansion at setup: children are stamped once per item with `{...}` placeholders substituted. Full spec: docs/TEMPLATE.md. |

All entities are absolutely positioned by `x`/`y`/`width`/`height` in composition pixels.

### Motion rules (full spec: docs/MOTION.md in the repo)

- `<w-animate property="opacity|x|y|scale|rotate" ...>` composes into one transform + opacity per entity per frame. Any other `property` (e.g. `letter-spacing`, `border-radius`) is written to style as `value + unit` (unit taken from `to`/`from`, e.g. `to="20px"`).
- `start`/`end` are frames in the **local time** of the nearest enclosing `<w-sequence>`. Values clamp outside the window.
- Easings: `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInSine`, `easeOutSine`, `easeInOutSine`.
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
const blob = await comp.export({
  bitrate: 8_000_000,
  onProgress: ({ frame, total }) => {},
}); // => video/mp4 Blob
```

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

`{...}` placeholders are data paths plus `+ - * /` arithmetic, nothing else (no calls, no eval). Expansion stamps real elements once at setup; there is no reactivity. For data-dependent structure beyond repetition, generate markup in JS.

### Sound

```html
<w-audio src="assets/score.wav" gain="0.9">
  <w-animate property="gain" from="0.9" to="0" start="345" end="385"></w-animate>  <!-- outro fade -->
</w-audio>
<w-sequence from="72"><w-audio src="assets/whoosh.wav" gain="0.7"></w-audio></w-sequence>
```

Preview plays through a live `AudioContext` (frames pace off the audio clock); export mixes down sample-exact through an `OfflineAudioContext` and encodes AAC (Opus fallback) into the MP4. Sequences bound audio exactly like visuals.

## Pitfalls

- Two tweens targeting the same property of the same element conflict across the whole timeline (clamped values still write; last one wins). For entrance + exit, put them on different nesting levels: wrapper `<w-el>` owns the exit, inner element owns the entrance. Opacity and transforms compose through nesting.
- Anything time-based that isn't derived from the frame breaks determinism and export accuracy. CSS `transition`/`animation` on entities is the same trap: the exporter seeks frames faster than wall time, so transitions smear. Use `<w-animate>`.
- Images in scenes must be same-origin (or CORS-readable); the rasterizer inlines them at export.
- Custom webfonts: ensure they are loaded (`document.fonts.ready`) before export starts; system font stacks are safest.
- `<w-sequence>` controls `display`; do not also set `display` on it.
- Export throws if no H.264 encoder is available; surface that error to the user (non-Chromium browsers).
- Autoplay policy: audio preview needs a user gesture to start the `AudioContext`; `autoplay` compositions run silent until first interaction.
- The composition scales to its container width; give the host element a real width.
