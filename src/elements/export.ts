import { Composition } from "../core/composition.js";
import type { RenderContext, WebMotionComponent } from "../core/component.js";
import { Layer } from "../runtime/layer.js";
import { Runtime } from "../runtime/runtime.js";
import { exportVideo } from "../export/exporter.js";
import { HtmlRenderer } from "../html-in-canvas/index.js";
import { collectAudioClips } from "../audio/schedule.js";
import {
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  encodeAudioIntoMuxer,
  negotiateAudioCodec,
  renderAudioMix,
} from "../audio/export.js";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { StageLayerPlanner } from "./compositor.js";
import { setCompositorStage } from "./registry.js";

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

  // Elements that load assets asynchronously (the three.js model element)
  // expose a wmReady promise; the export must not start before every frame is
  // renderable, or early frames would bake in missing content.
  const pending = Array.from(target.stage.querySelectorAll<HTMLElement>("*"))
    .map((el) => (el as { wmReady?: unknown }).wmReady)
    .filter((p): p is Promise<void> => p instanceof Promise);
  if (pending.length > 0) await Promise.all(pending);

  // Layer compositing: top-level entities rasterize once and are drawn with
  // per-frame transform and opacity at composite time, so tweens, fades, and
  // filter effects cost a canvas draw instead of a full re-rasterization.
  // Compositor mode makes the registry capture those values per frame rather
  // than writing them to inline styles.
  const planner = new StageLayerPlanner(target.stage);
  setCompositorStage(target.stage);

  const renderer = new HtmlRenderer(target.width, target.height, {
    canvas: makeCanvas(target.width, target.height),
    container: target.stage,
    background: "rgba(0,0,0,0)",
    layerPlanner: planner,
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

  // Audio: the same clips the preview plays, mixed down sample-exact through
  // an OfflineAudioContext and encoded into the container's audio track.
  const clips = collectAudioClips(target.stage, target.fps, target.durationInFrames);
  const audioCodec = clips.length > 0 ? await negotiateAudioCodec() : null;
  if (clips.length > 0 && !audioCodec) {
    console.warn("[webmotion] no supported audio encoder; exporting silent video");
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: target.width, height: target.height },
    ...(audioCodec
      ? {
          audio: {
            codec: audioCodec.muxCodec,
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfChannels: AUDIO_CHANNELS,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  try {
    if (audioCodec) {
      const mix = await renderAudioMix(clips, target.fps, target.durationInFrames);
      await encodeAudioIntoMuxer(mix, audioCodec, muxer);
    }
    await exportVideo(runtime, {
      muxer,
      codec,
      bitrate: options.bitrate ?? 8_000_000,
      onProgress: options.onProgress,
    });
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    setCompositorStage(null);
    planner.dispose();
    await runtime.destroy();
  }
}
