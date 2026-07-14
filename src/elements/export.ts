import { Composition } from "../core/composition.js";
import type { RenderContext, WebMotionComponent } from "../core/component.js";
import { Layer } from "../runtime/layer.js";
import { Runtime } from "../runtime/runtime.js";
import { exportVideo } from "../export/exporter.js";
import { HtmlRenderer } from "../html-in-canvas/index.js";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// What exportComposition needs from a composition to render it to video: its
// dimensions, the DOM to rasterize, and a way to set a frame.
export interface ExportTarget {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  stage: HTMLElement;
  renderFrameAt(globalFrame: number): void;
}

export interface ExportOptions {
  bitrate?: number;
  onProgress?: (progress: { frame: number; total: number }) => void;
}

async function negotiateCodec(width: number, height: number, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const codec of ["avc1.640028", "avc1.42001f", "avc1.42e01e"]) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate: 8_000_000,
      framerate: fps,
    });
    if (support.supported) return codec;
  }
  return null;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  return document.createElement("canvas");
}

// Render a composition's DOM to an MP4 Blob. Each frame updates the live stage
// via renderFrameAt, then the HTML renderer rasterizes it before capture.
export async function exportComposition(
  target: ExportTarget,
  options: ExportOptions = {},
): Promise<Blob> {
  const codec = await negotiateCodec(target.width, target.height, target.fps);
  if (!codec) throw new Error("No supported H.264 encoder in this browser");

  const composition = new Composition({
    width: target.width,
    height: target.height,
    fps: target.fps,
    durationInFrames: target.durationInFrames,
  });

  const renderer = new HtmlRenderer(target.width, target.height, {
    canvas: makeCanvas(target.width, target.height),
    container: target.stage,
    background: "rgba(0,0,0,0)",
  });

  const driver: WebMotionComponent = {
    mount() {},
    renderFrame(ctx: RenderContext) {
      target.renderFrameAt(ctx.frame);
    },
    destroy() {},
  };

  const runtime = new Runtime({
    composition,
    renderer,
    layers: [new Layer({ component: driver })],
  });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: target.width, height: target.height },
    fastStart: "in-memory",
  });

  try {
    await exportVideo(runtime, {
      muxer,
      codec,
      bitrate: options.bitrate ?? 8_000_000,
      onProgress: options.onProgress,
    });
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    await runtime.destroy();
  }
}
