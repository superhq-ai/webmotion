import type { RenderContext } from "../core/component.js";

/**
 * Backend surface API used by the runtime.
 */
export interface Renderer<TContext extends RenderContext = RenderContext> {
  readonly width: number;
  readonly height: number;
  readonly container?: HTMLElement;

  /** One-time async setup (allocate the surface, warm up GL, etc.). */
  init(): Promise<void>;

  /**
   * Prepare the surface for a new frame, usually by clearing it.
   */
  beginFrame(globalFrame: number): void;

  /**
   * Optional async end-of-frame hook for backends that need to finalize
   * rasterization before capture.
   */
  finishFrame?(globalFrame: number): void | Promise<void>;

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

/**
 * Optional capability for backends whose end-of-frame work has a long,
 * parallelizable phase. The export loop overlaps several frames' rasterize
 * phases while keeping snapshot and present strictly in frame order.
 */
export interface PipelinedRenderer {
  /** Enter export pipelining: finishFrame becomes a no-op until ended. */
  beginExportPipeline(): void;
  endExportPipeline(): void;
  /** Serialize the surface's current state. Sequential, after components ran. */
  snapshotFrame(): Promise<unknown>;
  /** Turn a snapshot into a drawable. Several may run concurrently. */
  rasterizeSnapshot(snapshot: unknown): Promise<unknown>;
  /** Draw a rasterized snapshot to the output surface. Called in frame order. */
  presentSnapshot(raster: unknown): void;
}

export function isPipelinedRenderer(renderer: unknown): renderer is PipelinedRenderer {
  if (!renderer || typeof renderer !== "object") return false;
  const r = renderer as Record<string, unknown>;
  return (
    typeof r["beginExportPipeline"] === "function" &&
    typeof r["endExportPipeline"] === "function" &&
    typeof r["snapshotFrame"] === "function" &&
    typeof r["rasterizeSnapshot"] === "function" &&
    typeof r["presentSnapshot"] === "function"
  );
}
