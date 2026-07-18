import type { RenderContext } from "../core/component.js";
import type { Renderer } from "../render/renderer.js";
import { DomRasterizer, type RasterResult, type RasterSnapshot } from "./rasterizer.js";

export interface HtmlRenderContext extends RenderContext {
  readonly root: HTMLElement;
}

/**
 * One compositable layer for a frame: a DOM subtree rasterized on its own,
 * drawn at `rect` with transform and opacity applied at composite time. The
 * raster is cached per node; `dirty` marks content changes that force a
 * re-rasterization. Transform is either per-frame animated components, a raw
 * css transform string (static inline transforms), or null for identity.
 */
export interface CompositeLayerPlan {
  node: HTMLElement;
  rect: { left: number; top: number; width: number; height: number };
  transform: { tx: number; ty: number; scale: number; rot: number } | string | null;
  opacity: number;
  dirty: boolean;
  /** Raster resolution multiplier, above 1 for layers that zoom in. */
  supersample?: number;
  /**
   * Live layer: the node exposes wmLiveCanvas() (a WebGL surface or similar).
   * Its pixels are captured per frame with createImageBitmap instead of DOM
   * rasterization; transform and opacity still apply at composite time.
   */
  live?: boolean;
}

interface LiveCanvasElement extends HTMLElement {
  wmLiveCanvas(): HTMLCanvasElement | null;
}

function liveCanvasOf(node: HTMLElement): HTMLCanvasElement | null {
  const fn = (node as Partial<LiveCanvasElement>).wmLiveCanvas;
  return typeof fn === "function" ? fn.call(node) : null;
}

export interface LayerFramePlan {
  layers: CompositeLayerPlan[];
  /** Nodes gone from the plan whose cached rasters can be dropped. */
  released: HTMLElement[];
}

/**
 * Supplied by a host that understands the container's structure (the elements
 * runtime does). Called once per frame after components ran; returning null
 * falls back to whole-container rasterization for that frame.
 */
export interface LayerPlanner {
  planFrame(stage: HTMLElement): LayerFramePlan | null;
  dispose?(): void;
}

export interface HtmlRendererOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  background?: string;
  container?: HTMLElement;
  layerPlanner?: LayerPlanner;
}

// Paint rasterized outside a layer's border box (shadows, blur, overflowing
// children) survives up to this many css pixels on each side.
const LAYER_BLEED = 64;

interface LayerSnapshotItem {
  layer: CompositeLayerPlan;
  snapshot: RasterSnapshot | null;
  /** Pending pixel capture for live layers; resolved in rasterizeSnapshot. */
  liveCapture?: Promise<ImageBitmap> | null;
}

interface LayerRasterItem {
  layer: CompositeLayerPlan;
  raster: RasterResult | null;
  bitmap?: ImageBitmap | null;
}

type FrameSnapshotPayload =
  | { mode: "stage"; snapshot: RasterSnapshot }
  | { mode: "layers"; items: LayerSnapshotItem[]; released: HTMLElement[] };

type FrameRasterPayload =
  | { mode: "stage"; raster: RasterResult }
  | { mode: "layers"; items: LayerRasterItem[]; released: HTMLElement[] };

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
  private pipelineActive = false;
  private readonly layerPlanner: LayerPlanner | undefined;

  constructor(width: number, height: number, options: HtmlRendererOptions = {}) {
    this.width = width;
    this.height = height;
    this.background = options.background ?? "rgba(0,0,0,0)";
    this.outputCanvas = options.canvas ?? createCanvasSurface(width, height);
    this.outputCanvas.width = width;
    this.outputCanvas.height = height;
    this.providedContainer = options.container;
    this.layerPlanner = options.layerPlanner;
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
    if (this.pipelineActive) return;
    const snapshot = await this.snapshotFrame();
    const raster = await this.rasterizeSnapshot(snapshot);
    this.presentSnapshot(raster);
  }

  // Pipelined-export capability (see PipelinedRenderer): the export loop keeps
  // several rasterizeSnapshot calls in flight, because SVG parsing and image
  // decoding happen off the main thread and genuinely overlap.
  beginExportPipeline(): void {
    this.pipelineActive = true;
  }

  endExportPipeline(): void {
    this.pipelineActive = false;
  }

  async snapshotFrame(): Promise<unknown> {
    await waitForFonts();
    if (this.layerPlanner) {
      const plan = this.layerPlanner.planFrame(this.stagingContainer);
      if (plan) {
        const items: LayerSnapshotItem[] = [];
        for (const layer of plan.layers) {
          if (layer.live) {
            // Live layers (WebGL canvases) are captured, not rasterized. The
            // bitmap copy happens at call time, so the capture belongs here,
            // before the next frame mutates the canvas; the await happens in
            // rasterizeSnapshot where captures overlap across frames.
            const source = liveCanvasOf(layer.node);
            items.push({
              layer,
              snapshot: null,
              liveCapture: source && source.width > 0 ? createImageBitmap(source) : null,
            });
            continue;
          }
          // Clean layers reuse their cached raster untouched: no clone, no
          // serialization, no style reads. This is where per-layer compositing
          // pays off; only content changes cost anything.
          const snapshot = layer.dirty
            ? await this.rasterizer.snapshot(layer.node, {
                bleed: LAYER_BLEED,
                ...(layer.supersample !== undefined ? { supersample: layer.supersample } : {}),
              })
            : null;
          items.push({ layer, snapshot });
        }
        return {
          mode: "layers",
          items,
          released: plan.released,
        } satisfies FrameSnapshotPayload;
      }
    }
    return {
      mode: "stage",
      snapshot: await this.rasterizer.snapshot(this.stagingContainer),
    } satisfies FrameSnapshotPayload;
  }

  async rasterizeSnapshot(snapshot: unknown): Promise<unknown> {
    const payload = snapshot as FrameSnapshotPayload;
    try {
      if (payload.mode === "layers") {
        const items = await Promise.all(
          payload.items.map(async (item): Promise<LayerRasterItem> => {
            if (item.layer.live) {
              return { layer: item.layer, raster: null, bitmap: (await item.liveCapture) ?? null };
            }
            return {
              layer: item.layer,
              raster: item.snapshot ? await this.rasterizer.rasterizeSnapshot(item.snapshot) : null,
            };
          }),
        );
        return { mode: "layers", items, released: payload.released } satisfies FrameRasterPayload;
      }
      return {
        mode: "stage",
        raster: await this.rasterizer.rasterizeSnapshot(payload.snapshot),
      } satisfies FrameRasterPayload;
    } catch (error) {
      throw new Error("HtmlRenderer: failed to rasterize HTML for the current frame", {
        cause: error,
      });
    }
  }

  presentSnapshot(raster: unknown): void {
    const payload = raster as FrameRasterPayload;
    // Clear and composite in one synchronous step, with no await in between, so
    // the visible canvas swaps atomically from the previous frame to this one.
    this.outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.outputCtx.clearRect(0, 0, this.width, this.height);
    if (this.background !== "rgba(0,0,0,0)") {
      this.outputCtx.fillStyle = this.background;
      this.outputCtx.fillRect(0, 0, this.width, this.height);
    }
    if (payload.mode === "layers") {
      const g = globalThis as Record<string, unknown>;
      const debug = g["__WM_LAYER_DEBUG"] === true;
      for (const item of payload.items) {
        if (debug) {
          const c = this.rasterizer.getCanvas(item.layer.node);
          ((g["__wmLayers"] ??= []) as unknown[]).push({
            tag: item.layer.node.tagName,
            cls: item.layer.node.className,
            rect: item.layer.rect,
            opacity: item.layer.opacity,
            dirty: item.layer.dirty,
            live: !!item.layer.live,
            hasRaster: !!item.raster,
            hasBitmap: !!item.bitmap,
            canvas: c ? c.width + "x" + c.height : "none",
          });
        }
        if (item.layer.live) {
          if (item.bitmap) {
            this.compositeLayer(item.layer, item.bitmap, 0);
            item.bitmap.close();
          }
          continue;
        }
        if (item.raster) this.rasterizer.present(item.raster);
        const canvas = this.rasterizer.getCanvas(item.layer.node);
        if (canvas) this.compositeLayer(item.layer, canvas, LAYER_BLEED);
      }
      for (const node of payload.released) this.rasterizer.release(node);
      return;
    }
    const rasterized = this.rasterizer.present(payload.raster);
    this.outputCtx.drawImage(rasterized, 0, 0, this.width, this.height);
  }

  // Draw one layer's pixels with its compositor properties. The math mirrors
  // css `translate(tx, ty) scale(s) rotate(r)` about the border-box center:
  // p' = center + translation + S.R.(p - center). `b` is the bleed baked into
  // the source (0 for live captures).
  private compositeLayer(layer: CompositeLayerPlan, canvas: CanvasImageSource, b: number): void {
    const opacity = Math.min(1, Math.max(0, layer.opacity));
    if (opacity === 0) return;
    const { rect, transform } = layer;
    const ctx = this.outputCtx;
    const drawW = rect.width + 2 * b;
    const drawH = rect.height + 2 * b;
    ctx.save();
    ctx.globalAlpha = opacity;
    if (transform && typeof transform === "object") {
      ctx.translate(rect.left + rect.width / 2 + transform.tx, rect.top + rect.height / 2 + transform.ty);
      ctx.scale(transform.scale, transform.scale);
      ctx.rotate((transform.rot * Math.PI) / 180);
      ctx.drawImage(canvas, -rect.width / 2 - b, -rect.height / 2 - b, drawW, drawH);
    } else if (typeof transform === "string") {
      const m = parseCssTransform(transform);
      ctx.translate(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (m) ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(canvas, -rect.width / 2 - b, -rect.height / 2 - b, drawW, drawH);
    } else {
      ctx.drawImage(canvas, rect.left - b, rect.top - b, drawW, drawH);
    }
    ctx.restore();
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

// Parse a css transform string into a matrix. Returns null for identity or
// values DOMMatrix cannot parse (percentage translates and similar); parse
// failures warn once so a silently dropped transform is discoverable.
let warnedBadTransform = false;
function parseCssTransform(transform: string): DOMMatrix | null {
  if (!transform || transform === "none") return null;
  try {
    return new DOMMatrix(transform);
  } catch {
    if (!warnedBadTransform) {
      warnedBadTransform = true;
      console.warn(
        "[webmotion] could not parse a static transform for layer compositing:",
        transform,
      );
    }
    return null;
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
