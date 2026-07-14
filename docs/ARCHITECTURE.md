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

The browser-only pieces (canvas capture → WebCodecs → mux) run behind the same `Renderer` interface the unit tests drive via a `NullRenderer`, so the frame logic is identical in Node and the browser.

### Not yet built

WebGL / WebGPU backends, WebM muxing, Web Worker export, audio in the programmatic (non-element) API.

## The HTML backend

`@superhq/webmotion/html-in-canvas` rasterizes a live DOM subtree into a canvas through an SVG `foreignObject`, driven by WebMotion's own `DomRasterizer`. That rasterizer is a derivative work adapted from repalash's MIT-licensed `three-html-render` and `ts-browser-helpers`; see `src/html-in-canvas/CREDITS.md`.

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

## Releasing

Publishing runs through npm trusted publishing (OIDC) from `.github/workflows/release.yml`: bump the version, commit, then `git tag vX.Y.Z && git push --tags`. No npm tokens are involved; provenance is attested automatically.
