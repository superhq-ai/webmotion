// StageLayerPlanner decomposes a composition stage into compositable layers
// for export: every visible top-level entity (a direct child of the stage or
// of an active <w-sequence> chain) becomes one layer, rasterized on its own
// and drawn in document order. Content changes are detected with a
// MutationObserver, so a layer that only moves, fades, scales, or rotates
// (captured by the registry's compositor mode instead of written to inline
// styles) never re-rasterizes.
import type { CompositeLayerPlan, LayerFramePlan, LayerPlanner } from "../html-in-canvas/index.js";
import { getCompositorState, getMaxAnimatedScale } from "./registry.js";

// Extra raster resolution for layers that zoom in, so scaling the cached
// raster up at composite time stays sharp. Capped: past 2x the memory cost
// outgrows the visible gain at video resolutions.
const MAX_SUPERSAMPLE = 2;

// Behavior and template holders that never render; mirrors registry.isInert.
const INERT_TAGS = new Set([
  "W-ANIMATE",
  "W-DEFS",
  "W-ANIMATION",
  "W-AUDIO",
  "W-FOR",
  "W-DATA",
  "W-IF",
  "W-LIGHT",
]);

export class StageLayerPlanner implements LayerPlanner {
  private observer: MutationObserver | null = null;
  // Mutations accumulate here: the observer callback fires on microtask
  // checkpoints (the export loop awaits constantly), and records handed to the
  // callback are gone from takeRecords(), so both sources must be merged.
  private pending: Node[] = [];
  // Layers that have been planned before; anything new is dirty by default.
  private known = new WeakSet<HTMLElement>();
  // Nodes that cannot be composited independently (blend modes reach across
  // layer boundaries). One such node fails the whole plan, falling back to
  // whole-stage rasterization.
  private unlayerable = new WeakSet<HTMLElement>();
  private checked = new WeakSet<HTMLElement>();
  private prevNodes = new Set<HTMLElement>();

  constructor(private readonly stage: HTMLElement) {
    if (typeof MutationObserver !== "undefined") {
      this.observer = new MutationObserver((records) => {
        for (const record of records) this.pending.push(record.target);
      });
      this.observer.observe(stage, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  planFrame(): LayerFramePlan | null {
    // Without mutation tracking there is no cheap invalidation story, and
    // rebuilding every layer every frame would be slower than one big raster.
    if (!this.observer) return null;

    const mutated: Node[] = this.pending;
    this.pending = [];
    for (const record of this.observer.takeRecords()) mutated.push(record.target);

    const layers: CompositeLayerPlan[] = [];
    if (!this.collect(this.stage, layers)) return null;

    if (mutated.length > 0) {
      for (const layer of layers) {
        if (layer.dirty) continue;
        for (const node of mutated) {
          if (layer.node === node || layer.node.contains(node)) {
            layer.dirty = true;
            break;
          }
        }
      }
    }

    const current = new Set<HTMLElement>();
    for (const layer of layers) current.add(layer.node);
    const released: HTMLElement[] = [];
    for (const node of this.prevNodes) {
      if (!current.has(node)) {
        released.push(node);
        // Force a fresh raster if the node ever comes back.
        this.known.delete(node);
      }
    }
    this.prevNodes = current;

    return { layers, released };
  }

  // Walk stage children in document order, recursing through active
  // sequences. Returns false when the content cannot be decomposed into
  // independent layers and the frame must fall back to a whole-stage raster.
  private collect(container: HTMLElement, out: CompositeLayerPlan[]): boolean {
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Bare text at layer level has no box to rasterize independently.
        if ((child.textContent ?? "").trim().length > 0) return false;
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      const tag = child.tagName;
      if (INERT_TAGS.has(tag)) continue;
      if (tag === "W-SEQUENCE") {
        if (child.style.display === "none") continue;
        if (!this.collect(child, out)) return false;
        continue;
      }
      if (child.style.display === "none") continue;
      if (this.isUnlayerable(child)) return false;
      out.push(this.makeLayer(child));
    }
    return true;
  }

  // Blend modes composite against everything painted below, which per-layer
  // drawing cannot reproduce. Checked once per node; computed style is too
  // expensive to consult every frame.
  private isUnlayerable(el: HTMLElement): boolean {
    if (!this.checked.has(el)) {
      this.checked.add(el);
      const blend = getComputedStyle(el).mixBlendMode;
      if (blend && blend !== "normal") this.unlayerable.add(el);
    }
    return this.unlayerable.has(el);
  }

  private makeLayer(el: HTMLElement): CompositeLayerPlan {
    const st = getCompositorState(el);
    let transform: CompositeLayerPlan["transform"] = null;
    if (st?.touchedTransform) {
      transform = { tx: st.tx, ty: st.ty, scale: st.scale, rot: st.rot };
    } else if (el.style.transform && el.style.transform !== "none") {
      // Static inline transforms are stripped from the raster's clone root, so
      // they re-enter here at composite time.
      transform = el.style.transform;
    }

    let opacity: number;
    if (st?.touchedOpacity) {
      opacity = st.opacity;
    } else {
      // The clone root is always rasterized at full opacity, so a static
      // inline opacity must also be applied at composite time.
      const inline = parseFloat(el.style.opacity);
      opacity = Number.isFinite(inline) ? inline : 1;
    }

    const dirty = !this.known.has(el);
    this.known.add(el);

    const maxScale = getMaxAnimatedScale(el);
    const supersample = Math.min(MAX_SUPERSAMPLE, Math.max(1, maxScale));

    // Elements exposing a live canvas (the three.js model element) are
    // captured per frame rather than DOM-rasterized.
    const live =
      typeof (el as { wmLiveCanvas?: unknown }).wmLiveCanvas === "function";

    return {
      node: el,
      rect: {
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      },
      transform,
      opacity,
      dirty,
      ...(supersample > 1 ? { supersample } : {}),
      ...(live ? { live } : {}),
    };
  }
}
