import type { RenderContext } from "../core/component.js";
import type { Renderer } from "../render/renderer.js";
import { DomRasterizer } from "./rasterizer.js";

export interface HtmlRenderContext extends RenderContext {
  readonly root: HTMLElement;
}

export interface HtmlRendererOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  background?: string;
  container?: HTMLElement;
}

export class HtmlRenderer implements Renderer<HtmlRenderContext> {
  readonly width: number;
  readonly height: number;
  private readonly outputCanvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly background: string;
  private outputCtx!: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private readonly providedContainer: HTMLElement | undefined;
  private stagingContainer!: HTMLElement;
  private createdContainer = false;
  private rasterizer!: DomRasterizer;

  constructor(width: number, height: number, options: HtmlRendererOptions = {}) {
    this.width = width;
    this.height = height;
    this.background = options.background ?? "rgba(0,0,0,0)";
    this.outputCanvas = options.canvas ?? createCanvasSurface(width, height);
    this.outputCanvas.width = width;
    this.outputCanvas.height = height;
    this.providedContainer = options.container;
  }

  get container(): HTMLElement {
    return this.stagingContainer;
  }

  get surface(): HTMLCanvasElement | OffscreenCanvas {
    return this.outputCanvas;
  }

  async init(): Promise<void> {
    if (typeof document === "undefined") {
      throw new Error("HtmlRenderer: document is unavailable in this environment");
    }

    const ctx = this.outputCanvas.getContext("2d");
    if (!ctx) throw new Error("HtmlRenderer: failed to acquire a 2D context");
    this.outputCtx = ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    this.stagingContainer = this.providedContainer ?? createDetachedContainer();
    this.createdContainer = this.providedContainer === undefined;
    prepareContainer(this.stagingContainer, this.width, this.height);

    this.rasterizer = this.createRasterizer();
  }

  beginFrame(_globalFrame: number): void {
    // Do not clear the output canvas here. Rasterization is async and happens in
    // finishFrame, so clearing now would leave the canvas blank for the whole
    // rasterization gap during playback. The clear happens in finishFrame,
    // synchronously adjacent to the draw, so the previous frame stays visible
    // until the new one is ready.
    this.outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.outputCtx.globalAlpha = 1;
  }

  makeContext(base: RenderContext): HtmlRenderContext {
    return { ...base, root: this.stagingContainer };
  }

  async finishFrame(_globalFrame: number): Promise<void> {
    await waitForFonts();

    let rasterized: CanvasImageSource;
    try {
      rasterized = await this.rasterizer.rasterize(this.stagingContainer);
    } catch (error) {
      throw new Error("HtmlRenderer: failed to rasterize HTML for the current frame", {
        cause: error,
      });
    }

    // Clear and composite in one synchronous step, with no await in between, so
    // the visible canvas swaps atomically from the previous frame to this one.
    this.outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.outputCtx.clearRect(0, 0, this.width, this.height);
    if (this.background !== "rgba(0,0,0,0)") {
      this.outputCtx.fillStyle = this.background;
      this.outputCtx.fillRect(0, 0, this.width, this.height);
    }
    this.outputCtx.drawImage(rasterized, 0, 0, this.width, this.height);
  }

  capture(timestampMicros: number, durationMicros: number): VideoFrame | null {
    if (typeof VideoFrame === "undefined") return null;
    return new VideoFrame(this.outputCanvas as CanvasImageSource, {
      timestamp: timestampMicros,
      duration: durationMicros,
    });
  }

  destroy(): void {
    if (this.createdContainer) this.stagingContainer.remove();
    this.rasterizer?.dispose();
    this.createdContainer = false;
  }

  private createRasterizer(): DomRasterizer {
    // TODO: Prefer native HTML-in-Canvas APIs here once drawElementImage is
    // available across target browsers and can replace the foreignObject path.
    return new DomRasterizer();
  }
}

function createCanvasSurface(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") return document.createElement("canvas");
  throw new Error(
    "HtmlRenderer: no canvas provided and neither OffscreenCanvas nor document.createElement are available",
  );
}

function createDetachedContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  return container;
}

function prepareContainer(container: HTMLElement, width: number, height: number): void {
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.overflow = "hidden";
  container.style.boxSizing = "border-box";
  container.style.position = "relative";
  if (container.parentElement === document.body) {
    // Keep the staging container at the viewport origin rather than pushed far
    // offscreen. The foreignObject rasterizer clones this element and forces the
    // clone's opacity/visibility back on, but it does not neutralize positional
    // offsets, so a large negative left would move all content outside the SVG
    // viewport and rasterize blank. Hiding with opacity keeps layout at 0,0 while
    // the live element stays invisible and non-interactive.
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.opacity = "0";
    container.style.zIndex = "-1";
    container.style.pointerEvents = "none";
  }
}

async function waitForFonts(): Promise<void> {
  const fonts = document.fonts;
  if (fonts?.ready) await fonts.ready;
}
