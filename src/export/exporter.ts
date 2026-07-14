import type { Runtime } from "../runtime/runtime.js";
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

    throwIfAborted(options.signal);
    await encoder.finalize(options.muxer);
  } finally {
    await runtime.destroy();
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Export aborted", "AbortError");
  }
}
