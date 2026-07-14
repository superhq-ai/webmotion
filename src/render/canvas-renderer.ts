import type { RenderContext } from "../core/component.js";
import type { Renderer } from "./renderer.js";

/** Any 2D context, whether backed by an on-screen or offscreen canvas. */
export type Canvas2DContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/**
 * Render context for canvas-backed components.
 */
export interface CanvasRenderContext extends RenderContext {
  readonly ctx: Canvas2DContext;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
}

export interface CanvasRendererOptions {
  /**
   * Canvas to draw into. If omitted, an OffscreenCanvas is created.
   */
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  /** Background clear color. Default transparent (`"rgba(0,0,0,0)"`). */
  background?: string;
}

/**
 * Canvas 2D renderer that captures frames as `VideoFrame` objects.
 */
export class CanvasRenderer implements Renderer<CanvasRenderContext> {
  readonly width: number;
  readonly height: number;
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly background: string;
  private ctx!: Canvas2DContext;

  constructor(width: number, height: number, options: CanvasRendererOptions = {}) {
    this.width = width;
    this.height = height;
    this.background = options.background ?? "rgba(0,0,0,0)";
    this.canvas = options.canvas ?? createOffscreen(width, height);
    this.canvas.width = width;
    this.canvas.height = height;
  }

  async init(): Promise<void> {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("CanvasRenderer: failed to acquire a 2D context");
    this.ctx = ctx as Canvas2DContext;
  }

  beginFrame(_globalFrame: number): void {
    // Clear state each frame so earlier draws do not leak into the next one.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    if (this.background === "rgba(0,0,0,0)") {
      this.ctx.clearRect(0, 0, this.width, this.height);
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = this.background;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  makeContext(base: RenderContext): CanvasRenderContext {
    return { ...base, ctx: this.ctx, canvas: this.canvas };
  }

  capture(timestampMicros: number, durationMicros: number): VideoFrame | null {
    if (typeof VideoFrame === "undefined") return null;
    return new VideoFrame(this.canvas as CanvasImageSource, {
      timestamp: timestampMicros,
      duration: durationMicros,
    });
  }

  destroy(): void {
    // Nothing persistent to release; the canvas is owned by the caller or GC'd.
  }

  /** Escape hatch for a live preview: the surface being drawn to. */
  get surface(): HTMLCanvasElement | OffscreenCanvas {
    return this.canvas;
  }
}

function createOffscreen(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "CanvasRenderer: no canvas provided and OffscreenCanvas is unavailable in this environment",
    );
  }
  return new OffscreenCanvas(width, height);
}
