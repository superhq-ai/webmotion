/**
 * Immutable composition settings for a render.
 */
export interface CompositionConfig {
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Frames per second. The timeline advances in whole frames at this rate. */
  fps: number;
  /** Total length of the composition, in whole frames. */
  durationInFrames: number;
}

export class Composition {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;

  constructor(config: CompositionConfig) {
    assertPositiveInt(config.width, "width");
    assertPositiveInt(config.height, "height");
    assertPositive(config.fps, "fps");
    assertPositiveInt(config.durationInFrames, "durationInFrames");

    this.width = config.width;
    this.height = config.height;
    this.fps = config.fps;
    this.durationInFrames = config.durationInFrames;
  }

  /** Duration in seconds. */
  get durationInSeconds(): number {
    return this.durationInFrames / this.fps;
  }

  /** Convert a frame index to its presentation time in seconds. */
  frameToSeconds(frame: number): number {
    return frame / this.fps;
  }

  /**
   * Convert a frame index to a WebCodecs timestamp in microseconds.
   */
  frameToMicros(frame: number): number {
    // Round to avoid float drift accumulating across thousands of frames.
    return Math.round((frame * 1_000_000) / this.fps);
  }

  /** Microsecond duration of a single frame, for VideoFrame.duration. */
  get frameDurationMicros(): number {
    return Math.round(1_000_000 / this.fps);
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Composition.${name} must be a positive number, got ${value}`);
  }
}

function assertPositiveInt(value: number, name: string): void {
  assertPositive(value, name);
  if (!Number.isInteger(value)) {
    throw new RangeError(`Composition.${name} must be a positive integer, got ${value}`);
  }
}
