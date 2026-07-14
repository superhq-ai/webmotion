# WebMotion

Browser-native, deterministic video composition — a [Remotion](https://www.remotion.dev/) alternative built on web-platform APIs. No headless Chrome, no FFmpeg: render in the browser, encode with WebCodecs, mux to MP4/WebM.

## The one principle

> **Everything visible is a pure function of the current frame.**

Nothing in the system reads `Date.now`, `requestAnimationFrame`, or a media element's `currentTime` to decide what to draw. Seeking to frame _N_ always produces the exact same image — whether it's the first frame rendered or the ten-thousandth, in real-time preview or a 20×-faster offline export. That property is what makes rendering seekable, cacheable, and frame-accurately exportable without a server.

## Status (v0.0.1)

The **deterministic core** is built and unit-tested (25 tests, verified in Node through the real runtime code path):

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

The browser-only pieces (canvas capture → WebCodecs → mux) run behind the same
`Renderer` interface the tests drive via a `NullRenderer`, so the frame logic is
identical in Node and the browser. See `examples/` for the live end-to-end demo.

### Not yet built

- WebGL / WebGPU backends, audio pipeline, WebM muxing, Web Worker export.

## Architecture

```
Composition ── Timeline (frame clock)
     │
   Layers ─── Sequence (local-frame mapping, nestable)
     │
  Runtime ─── Renderer  ← Canvas | Null | (HTML | WebGPU …)
     │
  Exporter ── FrameEncoder (WebCodecs + backpressure) ── Muxer ── MP4/WebM
```

## Example

```ts
import { Composition, Runtime, Layer, Sequence, CanvasRenderer, interpolate, Easing } from "webmotion";

const composition = new Composition({ width: 1280, height: 720, fps: 30, durationInFrames: 180 });

class Title {
  mount() {}
  renderFrame({ ctx, frame, width, height }) {
    const opacity = interpolate(frame, [0, 20], [0, 1], { easing: Easing.easeOutCubic, extrapolateRight: "clamp" });
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#fff";
    ctx.font = "600 84px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("WebMotion", width / 2, height / 2);
  }
  destroy() {}
}

const runtime = new Runtime({
  composition,
  renderer: new CanvasRenderer(1280, 720, { canvas }),
  layers: [new Layer({ component: new Title(), sequence: new Sequence({ from: 20 }) })],
});

await runtime.renderFrame(30); // draws exactly frame 30, every time
```

## HTML backend

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

The HTML backend ships as `@superhq/webmotion/html-in-canvas`. It rasterizes a live DOM subtree into a canvas through an SVG `foreignObject`, driven by WebMotion's own `DomRasterizer`. That rasterizer is a derivative work adapted from repalash's MIT-licensed `three-html-render` and `ts-browser-helpers`; see `src/html-in-canvas/CREDITS.md`.

## Develop

```bash
npm install
npm test          # pure-core unit tests (Node)
npm run build     # tsc -> dist/

# Live demo app (Vite, with a sidebar of demos):
npm run demo      # builds the library, then starts Vite and opens the browser
```

The demo app lives in `examples/` (a small Vite app). Each entry under
`examples/demos/` shares a reusable player that handles preview, scrubbing, and
MP4 export. It needs a Chromium-based browser (WebCodecs H.264 + `OffscreenCanvas`).
