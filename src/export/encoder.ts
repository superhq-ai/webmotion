import { Composition } from "../core/composition.js";

/**
 * Minimal muxer surface the encoder needs.
 */
export interface VideoMuxer {
  addVideoChunk(chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata | undefined): void;
  finalize(): void;
}

export interface EncoderConfig {
  composition: Composition;
  muxer: VideoMuxer;
  /** WebCodecs codec string, e.g. "avc1.640028" (H.264 High). */
  codec: string;
  /** Target bitrate in bits per second. Defaults to 8 Mbps. */
  bitrate?: number;
  /**
   * Maximum encoder queue depth before producers wait. Higher values use more
   * memory during long renders. Default 8.
   */
  maxQueueDepth?: number;
}

/**
 * WebCodecs encoder wrapper with backpressure and error handling.
 */
export class FrameEncoder {
  private readonly encoder: VideoEncoder;
  private readonly maxQueueDepth: number;
  private error: Error | null = null;
  /** Resolver for a producer currently parked on a full queue, if any. */
  private drainWaiter: (() => void) | null = null;

  constructor(config: EncoderConfig) {
    if (typeof VideoEncoder === "undefined") {
      throw new Error("WebCodecs VideoEncoder is not available in this environment");
    }
    this.maxQueueDepth = config.maxQueueDepth ?? 8;

    this.encoder = new VideoEncoder({
      output: (chunk, meta) => config.muxer.addVideoChunk(chunk, meta),
      error: (err) => {
        this.error = err instanceof Error ? err : new Error(String(err));
        this.wake();
      },
    });

    this.encoder.configure({
      codec: config.codec,
      width: config.composition.width,
      height: config.composition.height,
      bitrate: config.bitrate ?? 8_000_000,
      framerate: config.composition.fps,
      // Keep frames in presentation order; simplest correct default.
      latencyMode: "quality",
    });
  }

  /**
   * Encode one frame and wait if the encoder queue gets too deep.
   * Always close the VideoFrame to avoid WebCodecs memory leaks.
   */
  async encode(frame: VideoFrame, keyFrame = false): Promise<void> {
    this.throwIfErrored();
    try {
      this.encoder.encode(frame, { keyFrame });
    } finally {
      frame.close();
    }
    await this.applyBackpressure();
  }

  /**
   * Flush every queued frame through the encoder and finalize the container.
   * Call exactly once, after the last {@link encode}.
   */
  async finalize(muxer: VideoMuxer): Promise<void> {
    this.throwIfErrored();
    await this.encoder.flush();
    this.throwIfErrored();
    this.encoder.close();
    muxer.finalize();
  }

  private async applyBackpressure(): Promise<void> {
    while (this.encoder.encodeQueueSize > this.maxQueueDepth) {
      this.throwIfErrored();
      await new Promise<void>((resolve) => {
        this.drainWaiter = resolve;
        // WebCodecs signals queue drain via this event.
        this.encoder.addEventListener("dequeue", this.onDequeue, { once: true });
      });
    }
  }

  private readonly onDequeue = (): void => {
    this.wake();
  };

  private wake(): void {
    const waiter = this.drainWaiter;
    this.drainWaiter = null;
    if (waiter) waiter();
  }

  private throwIfErrored(): void {
    if (this.error) throw this.error;
  }
}
