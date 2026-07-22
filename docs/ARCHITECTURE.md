# Architecture

WebMotion is built around one rule: **everything visible is a pure function of the current frame.** Nothing reads `Date.now`, `requestAnimationFrame` timestamps, or a media element's `currentTime` to decide what to draw. Seeking to frame _N_ always produces the exact same image, in real-time preview or offline export. That property is what makes rendering seekable, cacheable, and frame-accurately exportable without a server.

```
Composition ── Timeline (frame clock)
     │
   Layers ─── Sequence (local-frame mapping, nestable)
     │
  Runtime ─── Renderer  ← Canvas | Null | HTML | (WebGPU …)
     │
  Exporter ── FrameEncoder (WebCodecs + backpressure) ── Muxer ── MP4
```

## Layers

| Layer | Module | State |
| --- | --- | --- |
| Composition config + frame/time math | `core/composition` | ✅ tested |
| Frame clock | `core/timeline` | ✅ tested |
| Nestable local-frame mapping | `core/sequence` | ✅ tested |
| Component contract (`async renderFrame`) | `core/component` | ✅ |
| `interpolate` + easing (incl. cubic-bézier) | `animation/*` | ✅ tested |
| Backend-agnostic runtime | `runtime/*` | ✅ tested |
| Canvas 2D backend | `render/canvas-renderer` | ✅ (browser) |
| HTML / foreignObject renderer | `html-in-canvas/*` | ✅ (browser) |
| WebCodecs encoder w/ backpressure | `export/encoder` | ✅ (browser) |
| Offline export loop | `export/exporter` | ✅ (browser) |
| Declarative custom elements (`<w-*>`) | `elements/*` | ✅ tested |
| Audio timeline + WebAudio mixdown | `audio/*` | ✅ tested |
| Template expansion (`<w-for>`, `<w-data>`) | `elements/template` | ✅ tested |
| 3D models via three.js (`<w-model>`, optional) | `three/*` | ✅ tested (see [THREE.md](./THREE.md)) |
| Scene inspection CLI (`shoot`, `lint`) | `cli/*` | ✅ tested (see [CLI.md](./CLI.md)) |

The browser-only pieces (canvas capture → WebCodecs → mux) run behind the same `Renderer` interface the unit tests drive via a `NullRenderer`, so the frame logic is identical in Node and the browser.

### Not yet built

WebGL / WebGPU backends, WebM muxing, Web Worker export, audio in the programmatic (non-element) API.

## The HTML backend

`@superhq/webmotion/html-in-canvas` is named after the [WICG html-in-canvas proposal](https://github.com/WICG/html-in-canvas), which specifies native APIs for drawing live HTML into a canvas. WebMotion tracks that proposal: today the backend rasterizes a live DOM subtree through an SVG `foreignObject` as a polyfill, and the native APIs (`drawElementImage` and friends) replace the foreignObject path once browsers ship them, keeping the same `Renderer` interface. The current rasterizer is a derivative work adapted from repalash's MIT-licensed `three-html-render` and `ts-browser-helpers`; see `src/html-in-canvas/CREDITS.md`.

```ts
import { Composition, Runtime, Layer } from "@superhq/webmotion";
import { HtmlRenderer } from "@superhq/webmotion/html-in-canvas";

const composition = new Composition({ width: 1280, height: 720, fps: 30, durationInFrames: 180 });

class HtmlCard {
  mount({ container }) {
    this.root = document.createElement("div");
    this.root.textContent = "HTML in Canvas";
    this.root.style.cssText = "width:100%;height:100%;display:grid;place-items:center;color:white;";
    container?.appendChild(this.root);
  }
  renderFrame({ frame }) {
    this.root.style.opacity = String(Math.min(1, frame / 20));
  }
  destroy() {
    this.root.remove();
  }
}

const runtime = new Runtime({
  composition,
  renderer: new HtmlRenderer(1280, 720),
  layers: [new Layer({ component: new HtmlCard() })],
});
```

## The declarative layer

`@superhq/webmotion/elements` is a thin layer over the same machinery. `<w-composition>` owns the frame clock and walks the subtree each frame; `<w-sequence>` shifts the frame origin for its descendants; `<w-animate>` elements declare tweens that are sampled per frame and composed into a single transform per entity, with named definitions in `<w-defs>` applied via the `motion` attribute (spec: [MOTION.md](./MOTION.md)). Export builds a runtime with the HTML renderer pointed at the live stage, so preview DOM and exported pixels come from the same tree.

Custom behaviors register through the same component system the built-ins use:

```js
import { registerComponent, setAnimatedProp } from "@superhq/webmotion/elements";

registerComponent("pulse", {
  parse: (value) => ({ speed: Number(value) || 1 }),
  render(el, data, ctx) {
    setAnimatedProp(el, "scale", 1 + 0.1 * Math.sin((ctx.frame / ctx.fps) * data.speed * Math.PI * 2), "");
  },
});
```

## Export performance

The HTML backend's export cost is dominated by SVG-image loading: each changed raster becomes a foreignObject SVG that the browser parses, styles, and rasterizes as an isolated document. The export pipeline is built so that cost is paid per content change, not per frame (profile any export by setting `window.__WM_PROFILE = true` and reading `window.__wmProfile` after):

- **Layer compositing.** During an elements export, every visible top-level entity (a direct child of the stage or of an active sequence chain) is rasterized as its own layer, and the frame is assembled by drawing the cached layer canvases in document order. Animated transform and opacity of those entities are captured per frame by the registry's compositor mode instead of being written to inline styles (`setCompositorStage`), and are applied at composite time via canvas transforms and `globalAlpha`. A tween, fade, spin, or zoom therefore costs one `drawImage`, not a re-rasterization. Layers that zoom in are rasterized at up to 2x resolution so scaling up stays sharp. Content changes (text, colors, sizes) are detected with a MutationObserver and re-rasterize only the owning layer. Compositions that per-layer drawing cannot reproduce (blend modes, bare text at stage level) fall back to whole-stage rasterization for the frame.
- **Inactive-scene pruning.** `display:none` subtrees (inactive `<w-sequence>` scenes) are pruned from the serialized clone; they rasterize to nothing either way, but serializing them cost clone bytes, style reads, and image inlining on every frame of a long composition.
- **Pipelined rasterization.** Renderers can implement the `PipelinedRenderer` capability (snapshot / rasterize / present); the exporter keeps several frames' rasterizations in flight, because SVG parsing and image decoding run off the main thread. Snapshots and presents stay strictly in frame order, so output is identical to the sequential path. Window of 8; larger windows regress on decode-pool contention.
- **Inline-splice caching.** Data-URL embedding of `url()` style references is memoized per style string in a bounded LRU (a style attribute that mixes a url() with an animated property would otherwise mint an unbounded entry per frame), so multi-megabyte splices happen once, not per frame.
- **Font-face pruning.** Every rasterized frame carries the page's stylesheets inline, fonts and all, so an `@font-face` the scene never renders is a payload the browser re-parses and re-decodes on every frame. Before any font file is fetched, faces are dropped when the subtree names no matching `font-family`, or when their `unicode-range` covers none of the characters the subtree renders. Both sets are collected per snapshot and grow monotonically, and growth invalidates the cached page CSS, so a family or a script that first appears at frame 200 still gets its faces from frame 200 on. Measured against a page carrying a Google Fonts link (two families, fifteen subset faces): a scene on a system stack went from 1,080,811 to 2,469 bytes per frame and 25 to ~250 fps; a scene that does use those webfonts went from 1,080,811 to 267,364 bytes and 25 to ~50 fps, keeping only the latin subsets it renders. The rebuild is conservative in both directions: unreadable descriptors, unparseable stylesheets, and faces with no `unicode-range` are all kept.
- **Unchanged-raster elision.** A layer or stage whose serialized SVG matches the previous one skips rasterization entirely and reuses the cached canvas.

Measured on a stress composition (200 frames, 1280×720, 4 scenes of 12 tweened and fading images each): 750ms/frame before layer compositing, 8.5ms/frame after, ~88x, with peak JS heap down from 1.17GB to 80MB; exported pixels match the whole-stage path at SSIM 0.998+ across the example demos. Directions deliberately not taken: Web Workers cannot touch the DOM or load SVG images, and encoding already runs off-thread in hardware, so workers add no parallelism here (a worker-hosted encoder would only help main-thread responsiveness); WebGPU does not apply to DOM rasterization, which is the browser's own renderer; it becomes relevant as a separate canvas/GPU backend. Service workers are network proxies and have no role in this pipeline. Blob URLs for the SVG images are also out: Chromium taints a canvas that draws a foreignObject SVG loaded from a blob URL, which kills VideoFrame capture.

## Releasing

Publishing runs through npm trusted publishing (OIDC) from `.github/workflows/release.yml`: bump the version, commit, then `git tag vX.Y.Z && git push --tags`. No npm tokens are involved; provenance is attested automatically.
