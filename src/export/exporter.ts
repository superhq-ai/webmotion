import type { Runtime } from "../runtime/runtime.js";
import { isPipelinedRenderer } from "../render/renderer.js";
import { FrameEncoder, type EncoderConfig } from "./encoder.js";
import type { VideoMuxer } from "./encoder.js";

export interface ExportProgress {
  /** Frames written so far. */
  frame: number;
  /** Total frames to write. */
  total: number;
  /** Fraction complete in `[0, 1]`. */
  progress: number;
}

export interface ExportOptions {
  muxer: VideoMuxer;
  codec: string;
  bitrate?: number;
  maxQueueDepth?: number;
  /** How often to force a keyframe, in frames. Default: every 2 seconds. */
  keyframeInterval?: number;
  /** Progress callback, invoked after each frame is queued for encoding. */
  onProgress?: (progress: ExportProgress) => void;
  /** Abort signal to cancel a long export cleanly. */
  signal?: AbortSignal;
}

/** Render every frame, capture it, and pass it to the encoder. */
export async function exportVideo(runtime: Runtime, options: ExportOptions): Promise<void> {
  const { composition } = runtime;
  const total = composition.durationInFrames;
  const keyframeInterval = options.keyframeInterval ?? Math.max(1, Math.round(composition.fps * 2));

  const encoderConfig: EncoderConfig = {
    composition,
    muxer: options.muxer,
    codec: options.codec,
    ...(options.bitrate !== undefined ? { bitrate: options.bitrate } : {}),
    ...(options.maxQueueDepth !== undefined ? { maxQueueDepth: options.maxQueueDepth } : {}),
  };
  const encoder = new FrameEncoder(encoderConfig);

  try {
    if (isPipelinedRenderer(runtime.renderer)) {
      await exportPipelined(runtime, encoder, total, keyframeInterval, options);
    } else {
      for (let frame = 0; frame < total; frame++) {
        throwIfAborted(options.signal);

        await runtime.renderFrame(frame);
        const videoFrame = runtime.capture(frame);
        if (videoFrame) {
          const isKeyframe = frame % keyframeInterval === 0;
          await encoder.encode(videoFrame, isKeyframe);
        }

        options.onProgress?.({ frame: frame + 1, total, progress: (frame + 1) / total });
      }
    }

    throwIfAborted(options.signal);
    await encoder.finalize(options.muxer);
  } finally {
    await runtime.destroy();
  }
}

// How many frames' rasterizations to keep in flight. Rasterization (SVG parse
// + image decode) runs off the main thread, so a small window overlaps the
// long pole across frames without ballooning memory.
const PIPELINE_WINDOW = 8;

async function exportPipelined(
  runtime: Runtime,
  encoder: FrameEncoder,
  total: number,
  keyframeInterval: number,
  options: ExportOptions,
): Promise<void> {
  const renderer = runtime.renderer;
  if (!isPipelinedRenderer(renderer)) throw new Error("renderer lost pipeline capability");

  interface Pending {
    frame: number;
    raster: Promise<unknown>;
  }
  const inFlight: Pending[] = [];

  // Present, capture, and encode strictly in frame order.
  const drainTo = async (maxQueued: number): Promise<void> => {
    while (inFlight.length > maxQueued) {
      const head = inFlight.shift() as Pending;
      const raster = await head.raster;
      renderer.presentSnapshot(raster);
      const videoFrame = runtime.capture(head.frame);
      if (videoFrame) {
        await encoder.encode(videoFrame, head.frame % keyframeInterval === 0);
      }
      options.onProgress?.({
        frame: head.frame + 1,
        total,
        progress: (head.frame + 1) / total,
      });
    }
  };

  renderer.beginExportPipeline();
  try {
    for (let frame = 0; frame < total; frame++) {
      throwIfAborted(options.signal);

      // Components mutate the surface state; finishFrame is a no-op while the
      // pipeline is active, so the frame is serialized here instead.
      await runtime.renderFrame(frame);
      const snapshot = await renderer.snapshotFrame();
      const raster = renderer.rasterizeSnapshot(snapshot);
      // Rejections surface at drain; this guard keeps them from being
      // reported as unhandled while queued.
      raster.catch(() => {});
      inFlight.push({ frame, raster });

      await drainTo(PIPELINE_WINDOW - 1);
    }
    await drainTo(0);
  } finally {
    renderer.endExportPipeline();
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Export aborted", "AbortError");
  }
}
