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
| WebCodecs encoder w/ backpressure | `export/encoder` | ✅ (browser) |
| Offline export loop | `export/exporter` | ✅ (browser) |

The browser-only pieces (canvas capture → WebCodecs → mux) run behind the same
`Renderer` interface the tests drive via a `NullRenderer`, so the frame logic is
identical in Node and the browser. See `examples/` for the live end-to-end demo.

### Not yet built

- **HTML / foreign­Object renderer** — rasterizing live HTML/CSS into frames. This is the real differentiator over a plain canvas engine and the hardest problem (deterministic layout settle, font readiness, cross-origin taint). Native [HTML-in-Canvas](https://developer.chrome.com/blog/html-in-canvas-origin-trial) is the eventual backend; a `<foreignObject>` fallback comes first.
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

## Develop

```bash
npm install
npm test          # pure-core unit tests (Node)
npm run build     # tsc → dist/

# Live browser demo (canvas → WebCodecs → downloadable MP4):
npx serve .       # or any static server, then open /examples/
```

The demo needs a Chromium-based browser (WebCodecs H.264 + `OffscreenCanvas`).
