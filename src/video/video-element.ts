// <w-video>: a raw video clip as an entity. It decodes the source frame for the
// current composition frame with WebCodecs and draws it into an inline canvas,
// exposed through the live-canvas protocol so export captures it on the GPU
// path (like <w-model> and <w-transition>) rather than rasterizing DOM. The
// source frame is a pure function of the composition frame, so preview and
// export match and seeking is deterministic. The clip's audio rides the normal
// audio mix; see src/audio/schedule.ts. Spec: docs/VIDEO.md.
import { WEntity } from "../elements/elements.js";
import { num } from "../elements/parse.js";
import type { FrameContext } from "../elements/registry.js";
import { sourceTimeAt, VideoSource, type SourceTiming } from "./decoder.js";

type Fit = "cover" | "contain" | "fill";

export class WVideo extends WEntity {
  static override get observedAttributes(): string[] {
    return [...WEntity.observedAttributes, "src", "fit"];
  }

  /** Resolves once the source is decodable, so an export gates on it. */
  wmReady: Promise<void> = Promise.resolve();

  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private source: VideoSource | null = null;
  private loadedSrc: string | null = null;
  private lastKey = Number.NaN;
  private pending: Promise<void> = Promise.resolve();

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.canvas) {
      this.canvas = this.querySelector(":scope > canvas") ?? document.createElement("canvas");
      this.canvas.style.cssText = "display:block;width:100%;height:100%;object-fit:inherit;";
      if (!this.canvas.parentElement) this.appendChild(this.canvas);
      this.ctx2d = this.canvas.getContext("2d");
    }
    this.load();
  }

  override attributeChangedCallback(): void {
    super.attributeChangedCallback();
    if (this.isConnected) this.load();
  }

  disconnectedCallback(): void {
    this.source?.close();
    this.source = null;
    this.loadedSrc = null;
  }

  // Export integration: captured per frame as a live layer, and settled before
  // capture so the decoded frame is on the canvas.
  wmLiveCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  wmAwaitFrame(): Promise<void> {
    return this.pending;
  }

  wmApplyFrame(ctx: FrameContext): void {
    if (!this.source) return;
    const t = sourceTimeAt(ctx.frame, ctx.fps, this.timing(this.source.durationSec));
    const key = this.source.targetTimestamp(t);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.pending = this.decodeDraw(t);
    this.pending.catch(() => {});
  }

  private timing(duration: number): SourceTiming {
    const loopAttr = this.getAttribute("loop");
    return {
      from: num(this.getAttribute("from"), 0),
      trim: num(this.getAttribute("trim"), 0),
      speed: num(this.getAttribute("speed"), 1),
      loop: loopAttr != null && loopAttr !== "false",
      duration,
    };
  }

  private fit(): Fit {
    const f = this.getAttribute("fit");
    return f === "contain" || f === "fill" ? f : "cover";
  }

  private async decodeDraw(t: number): Promise<void> {
    const source = this.source;
    if (!source || !this.ctx2d || !this.canvas) return;
    const frame = await source.frameAtTime(t);
    if (!frame || !this.ctx2d || !this.canvas) return;
    drawFit(this.ctx2d, frame, this.canvas.width, this.canvas.height, this.fit());
  }

  private sizeCanvas(): void {
    if (!this.canvas || !this.source) return;
    const cssW = Math.max(1, num(this.getAttribute("width"), this.source.width));
    const cssH = Math.max(1, num(this.getAttribute("height"), this.source.height));
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  private load(): void {
    const src = this.getAttribute("src");
    if (!src || src === this.loadedSrc || !this.canvas) return;
    this.loadedSrc = src;
    const url = new URL(src, document.baseURI).href;

    this.wmReady = VideoSource.create(url)
      .then((source) => {
        if (this.loadedSrc !== src) {
          source.close();
          return;
        }
        this.source?.close();
        this.source = source;
        this.sizeCanvas();
        this.lastKey = Number.NaN;
        // Paint the in point so the clip is visible before the frame walk
        // reaches it (matches how <w-model> paints a rest pose on load).
        this.pending = this.decodeDraw(num(this.getAttribute("trim"), 0));
        return this.pending;
      })
      .catch((e) => {
        console.warn("[webmotion] <w-video> failed to load", src, e);
      });
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The destination rect for a source of size sw x sh drawn into a dw x dh box
// with object-fit semantics: cover fills and overflows (the canvas clips),
// contain letterboxes, fill stretches. Pure, so it can be unit tested.
export function fitRect(sw: number, sh: number, dw: number, dh: number, fit: Fit): Rect {
  if (fit === "fill" || sw === 0 || sh === 0) return { x: 0, y: 0, w: dw, h: dh };
  const scale = fit === "contain" ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

// Draw a decoded frame into a device-pixel canvas with object-fit semantics.
function drawFit(
  ctx: CanvasRenderingContext2D,
  frame: VideoFrame,
  dw: number,
  dh: number,
  fit: Fit,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, dw, dh);
  const r = fitRect(frame.displayWidth, frame.displayHeight, dw, dh, fit);
  ctx.drawImage(frame, r.x, r.y, r.w, r.h);
}

export function defineVideoElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-video")) customElements.define("w-video", WVideo);
}
