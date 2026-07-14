import type { RenderContext } from "../core/component.js";

/**
 * Backend surface API used by the runtime.
 */
export interface Renderer<TContext extends RenderContext = RenderContext> {
  readonly width: number;
  readonly height: number;

  /** One-time async setup (allocate the surface, warm up GL, etc.). */
  init(): Promise<void>;

  /**
   * Prepare the surface for a new frame, usually by clearing it.
   */
  beginFrame(globalFrame: number): void;

  /**
   * Build the backend-specific render context for a component.
   */
  makeContext(base: RenderContext): TContext;

  /**
   * Capture the current surface as a VideoFrame.
   * `timestampMicros` and `durationMicros` must match the composition timing.
   */
  capture(timestampMicros: number, durationMicros: number): VideoFrame | null;

  /** Release the surface and any GPU resources. */
  destroy(): void;
}
