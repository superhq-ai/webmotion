// <w-transition>: a frame-pure transition plate. It paints a solid color over
// its box, revealed through an animated threshold pattern (ordered dither,
// hashed dissolve, linear wipe, radial iris). One scalar `amount` in [0, 1]
// drives it: 0 leaves the box transparent so content shows through, 1 covers
// the box completely; the pattern decides the order cells cross the frontier.
//
// The whole effect is one canvas. Like <w-model> it exposes wmLiveCanvas(), so
// export captures it with createImageBitmap on the GPU path instead of
// serializing DOM. That is the point: a dissolve cut built from hundreds of
// animated <w-el> cells re-serializes the whole frame every frame at export
// time; the same cut here is a single live layer and stays near-free. Place it
// at the top level (a direct child of the stage or an active <w-sequence>
// chain) so it becomes its own layer. See docs/TRANSITIONS.md.
import { WEntity } from "./elements.js";
import { gatherTweens, type FrameContext } from "./registry.js";
import { num, resolveEasing } from "./parse.js";
import { readTween, sampleTween } from "./tween.js";

export type TransitionPattern = "dither" | "dissolve" | "wipe" | "iris";

// A 4x4 Bayer matrix, the classic ordered-dither threshold map. Normalizing
// each entry to a fraction of 16 gives an even, textured fill order as the
// frontier advances, which is what makes a real dither read as a dither rather
// than a wipe.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Deterministic per-cell hash in [0, 1). The same sin-hash the hand-rolled
// dissolve used, so the block pattern matches what authors already have.
function hash01(c: number, r: number, seed: number): number {
  const h = Math.sin(c * 12.9898 + r * 78.233 + seed * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// The threshold field for a pattern: one value in [0, 1) per grid cell, laid
// out row-major. A cell is covered once `amount` passes its threshold, so the
// field alone defines the reveal order. Pure and stable, computed once per
// grid size / pattern / direction / seed.
export function buildThreshold(
  pattern: TransitionPattern,
  cols: number,
  rows: number,
  dir: string,
  seed: number,
): Float32Array {
  const field = new Float32Array(cols * rows);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxDist = Math.hypot(cx, cy) || 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let t: number;
      switch (pattern) {
        case "dissolve":
          t = hash01(c, r, seed);
          break;
        case "wipe": {
          const h = (c + 0.5) / cols;
          const v = (r + 0.5) / rows;
          t = dir === "left" ? 1 - h : dir === "down" ? v : dir === "up" ? 1 - v : h;
          break;
        }
        case "iris": {
          const d = Math.hypot(c - cx, r - cy) / maxDist;
          t = dir === "in" ? 1 - d : d;
          break;
        }
        default:
          t = (BAYER4[r % 4]![c % 4]! + 0.5) / 16;
      }
      field[r * cols + c] = t;
    }
  }
  return field;
}

// How opaque a cell is for a given amount. With no soft edge it is a clean
// per-cell step, so the pattern's texture is crisp. `edge` (0..1) widens the
// frontier into a ramp: the threshold is scaled into [0, 1 - edge] so the ramp
// still finishes exactly at amount 1, keeping amount 0 fully clear and amount 1
// fully covered. As edge approaches 1 every cell shares one ramp, which is a
// plain crossfade.
export function coverage(t: number, amount: number, edge: number): number {
  if (edge <= 0) return t < amount ? 1 : 0;
  const te = t * (1 - edge);
  const a = (amount - te) / edge;
  return a <= 0 ? 0 : a >= 1 ? 1 : a;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Parse a CSS color to [r, g, b] bytes. Hex is read directly; anything else is
// resolved through a 1x1 canvas so named colors and rgb()/hsl() all work.
// Falls back to black where no canvas is available (unit tests).
function parseColor(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (typeof document !== "undefined") {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!];
      }
    } catch {
      // getImageData can throw in constrained environments; fall through.
    }
  }
  return [0, 0, 0];
}

export class WTransition extends WEntity {
  static override get observedAttributes(): string[] {
    return [...WEntity.observedAttributes, "pattern", "cell", "color", "dir", "edge", "seed", "smooth"];
  }

  /** No async assets; the export gate resolves immediately. */
  wmReady: Promise<void> = Promise.resolve();

  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private mask: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private threshold: Float32Array | null = null;
  private cols = 0;
  private rows = 0;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private rgb: [number, number, number] = [0, 0, 0];
  private lastKey = "";

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.canvas) {
      // Adopt a cloned element's canvas if it carried one; otherwise make one.
      this.canvas = this.querySelector(":scope > canvas") ?? document.createElement("canvas");
      this.canvas.style.cssText = "display:block;width:100%;height:100%;";
      if (!this.canvas.parentElement) this.appendChild(this.canvas);
      this.ctx2d = this.canvas.getContext("2d");
    }
    this.rebuild();
  }

  override attributeChangedCallback(): void {
    super.attributeChangedCallback();
    if (this.isConnected) this.rebuild();
  }

  // Export integration: captured per frame as a live layer instead of being
  // DOM-rasterized. The draw is synchronous, so the settle resolves at once.
  wmLiveCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  wmAwaitFrame(): Promise<void> {
    return Promise.resolve();
  }

  wmApplyFrame(ctx: FrameContext): void {
    const amount = this.sampleAmount(ctx);
    const key = amount.toFixed(4);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.draw(amount);
  }

  // Amount for this frame. An <w-animate property="amount"> child (or several)
  // takes precedence for full manual control; otherwise it is derived from the
  // enter / hold / exit timing attributes in the sequence-local frame, which
  // sidesteps the fact that two tweens on one property do not compose.
  private sampleAmount(ctx: FrameContext): number {
    let manual = false;
    let amount = 0;
    for (const tween of gatherTweens(this)) {
      const data = readTween(tween);
      if (data.property === "amount") {
        amount = sampleTween(data, ctx.frame);
        manual = true;
      }
    }
    if (manual) return clamp01(amount);

    const delay = num(this.getAttribute("delay"), 0);
    const enter = Math.max(0, num(this.getAttribute("enter"), 0));
    const hold = Math.max(0, num(this.getAttribute("hold"), 0));
    const exit = Math.max(0, num(this.getAttribute("exit"), 0));
    const ease = resolveEasing(this.getAttribute("easing") ?? "easeInOutSine");

    let f = ctx.frame - delay;
    if (f <= 0) return 0;
    if (enter > 0 && f < enter) return clamp01(ease(f / enter));
    f -= enter;
    if (f < hold) return 1;
    f -= hold;
    if (exit > 0) return f < exit ? clamp01(1 - ease(f / exit)) : 0;
    return 1;
  }

  private rebuild(): void {
    if (!this.canvas) return;
    this.cssW = Math.max(1, num(this.getAttribute("width"), 0));
    this.cssH = Math.max(1, num(this.getAttribute("height"), 0));
    this.dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);

    const cell = Math.max(1, num(this.getAttribute("cell"), 24));
    this.cols = Math.max(1, Math.ceil(this.cssW / cell));
    this.rows = Math.max(1, Math.ceil(this.cssH / cell));
    const pattern = (this.getAttribute("pattern") ?? "dither") as TransitionPattern;
    const dir = this.getAttribute("dir") ?? (pattern === "iris" ? "out" : "right");
    const seed = num(this.getAttribute("seed"), 1);
    this.threshold = buildThreshold(pattern, this.cols, this.rows, dir, seed);
    this.rgb = parseColor(this.getAttribute("color") ?? "#000");

    if (!this.mask) this.mask = document.createElement("canvas");
    this.mask.width = this.cols;
    this.mask.height = this.rows;
    this.maskCtx = this.mask.getContext("2d");

    // Force a redraw on the next frame walk; the previous key no longer holds.
    this.lastKey = "";
  }

  // Paint the plate at `amount`: fill the low-resolution mask cell by cell,
  // then blit it up to the box. Blocky by default so cells stay crisp; `smooth`
  // upscales instead for a soft frontier.
  private draw(amount: number): void {
    if (!this.ctx2d || !this.maskCtx || !this.threshold) return;
    const edge = Math.max(0, num(this.getAttribute("edge"), 0));
    const [r, g, b] = this.rgb;

    const img = this.maskCtx.createImageData(this.cols, this.rows);
    const data = img.data;
    for (let i = 0; i < this.threshold.length; i++) {
      const a = coverage(this.threshold[i]!, amount, edge);
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = Math.round(a * 255);
    }
    this.maskCtx.putImageData(img, 0, 0);

    const ctx = this.ctx2d;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    ctx.imageSmoothingEnabled = this.hasAttribute("smooth");
    ctx.drawImage(this.mask!, 0, 0, this.canvas!.width, this.canvas!.height);
  }
}

export function defineTransitionElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-transition")) customElements.define("w-transition", WTransition);
}
