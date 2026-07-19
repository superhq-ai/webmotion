// Browser-side half of the CLI. Served to the page and installed on a live
// <w-composition>, it exposes a small fact-gathering API over the scene: what
// the beats are, where every entity sits at a given frame, and which authoring
// mistakes are visible from inside the document.
//
// This module gathers facts and applies no judgement. Rules live in the Node
// half (src/cli/rules.ts) so that adding a rule never means touching the page.
//
// Standalone by design: no imports, so the file can be served and loaded
// directly by the browser without a bundler or an import map entry.

export interface Beat {
  label: string;
  from: number;
  to: number;
  depth: number;
}

export interface CompositionInfo {
  width: number;
  height: number;
  fps: number;
  duration: number;
  beats: Beat[];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EntitySnapshot {
  /** Stable identity across frames: tag plus position among its peers. */
  key: string;
  tag: string;
  /** First 60 characters of text, for readable diagnostics. */
  text: string;
  box: Box;
  /** Opacity with every ancestor's opacity multiplied in. */
  opacity: number;
  displayed: boolean;
  overflowX: number;
  overflowY: number;
  color: string | null;
  backdrop: string | null;
  fontSize: number;
  /** Everything that decides what this entity looks like, for frame diffing. */
  signature: string;
}

export interface FrameProbe {
  frame: number;
  entities: EntitySnapshot[];
}

export interface TweenConflict {
  key: string;
  tag: string;
  text: string;
  property: string;
  sources: string[];
}

export interface SceneFacts {
  fontStatus: string;
  /** @font-face families the document declared that never finished loading. */
  pendingFaces: string[];
  /** Font stacks where nothing resolves and there is no generic fallback. */
  unresolvedStacks: string[];
  /** Asset URLs the export rasterizer cannot read back. */
  foreignAssets: string[];
  tweenConflicts: TweenConflict[];
}

export interface WebmotionProbeApi {
  info(): CompositionInfo;
  seek(frame: number): Promise<void>;
  probe(frame: number): Promise<FrameProbe>;
  facts(): SceneFacts;
}

declare global {
  interface Window {
    __wm?: WebmotionProbeApi;
  }
}

// Elements that draw nothing: timing, data, and definition nodes, plus the
// 3D child elements that configure a <w-model> rather than standing alone.
const INERT = new Set([
  "W-COMPOSITION",
  "W-PLAYER",
  "W-SEQUENCE",
  "W-DEFS",
  "W-ANIMATION",
  "W-ANIMATE",
  "W-AUDIO",
  "W-DATA",
  "W-FOR",
  "W-IF",
  "W-LIGHT",
  "W-MATERIAL-TEXT",
  "W-SHADER-FX",
]);

function isEntity(el: Element): boolean {
  if (!el.tagName.startsWith("W-")) return false;
  if (INERT.has(el.tagName)) return false;
  // <w-for> keeps its own children as an inert template; only the stamped
  // siblings are real. Selectors that forget this match the un-substituted
  // template too, which is the documented trap.
  return el.closest("w-for") === null;
}

function textOf(el: Element): string {
  const raw = (el.getAttribute("text") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
}

function parseAlpha(color: string): number {
  const match = /rgba?\([^)]*?([\d.]+)\s*\)$/.exec(color);
  if (color.startsWith("rgba") && match?.[1] !== undefined) return Number(match[1]);
  return color === "transparent" ? 0 : 1;
}

class Probe implements WebmotionProbeApi {
  private readonly comp: HTMLElement & {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    sections(): Beat[];
    seek(frame: number): void;
  };

  private readonly stage: HTMLElement;

  constructor(comp: HTMLElement) {
    this.comp = comp as Probe["comp"];
    // The composition moves authored children into a stage div it scales to
    // fit; measurements have to come from inside that box.
    const stage = (comp as unknown as { stage?: HTMLElement }).stage ?? comp.firstElementChild;
    if (!(stage instanceof HTMLElement)) throw new Error("composition has no stage");
    this.stage = stage;
  }

  info(): CompositionInfo {
    return {
      width: this.comp.width,
      height: this.comp.height,
      fps: this.comp.fps,
      duration: this.comp.durationInFrames,
      beats: this.comp.sections(),
    };
  }

  async seek(frame: number): Promise<void> {
    this.comp.seek(frame);
    // Two frames: one for the style writes to land, one for anything that
    // paints off the back of them (the 3D entry renders on rAF).
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async probe(frame: number): Promise<FrameProbe> {
    await this.seek(frame);
    const stageBox = this.stage.getBoundingClientRect();
    // The stage is scaled to fit its container; normalise back to composition
    // pixels so every number the rules see is in the author's coordinates.
    const scale = stageBox.width > 0 ? stageBox.width / this.comp.width : 1;

    const entities: EntitySnapshot[] = [];
    const seen = new Map<string, number>();

    for (const el of Array.from(this.stage.querySelectorAll("*"))) {
      if (!isEntity(el)) continue;

      const tag = el.tagName.toLowerCase();
      const ordinal = seen.get(tag) ?? 0;
      seen.set(tag, ordinal + 1);

      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      // A <w-sequence> hides its subtree by setting display on itself, so the
      // entity's own computed display stays "block" while it is off. Ask the
      // browser whether it would actually paint, which walks the ancestors.
      const displayed =
        typeof el.checkVisibility === "function"
          ? el.checkVisibility()
          : style.display !== "none" && style.visibility !== "hidden";
      const opacity = this.effectiveOpacity(el);
      const box: Box = {
        x: Math.round((rect.left - stageBox.left) / scale),
        y: Math.round((rect.top - stageBox.top) / scale),
        width: Math.round(rect.width / scale),
        height: Math.round(rect.height / scale),
      };
      const color = tag === "w-text" ? style.color : null;

      entities.push({
        key: `${tag}[${ordinal}]`,
        tag,
        text: textOf(el),
        box,
        opacity,
        displayed,
        overflowX: Math.max(0, el.scrollWidth - el.clientWidth),
        overflowY: Math.max(0, el.scrollHeight - el.clientHeight),
        color,
        backdrop: color === null ? null : this.backdropOf(el, rect),
        fontSize: parseFloat(style.fontSize) || 0,
        signature: [
          displayed ? "1" : "0",
          opacity.toFixed(3),
          style.transform,
          box.x,
          box.y,
          box.width,
          box.height,
          style.letterSpacing,
          style.color,
          textOf(el),
        ].join("|"),
      });
    }

    return { frame, entities };
  }

  /** Opacity composes through nesting, so the visible value is the product. */
  private effectiveOpacity(el: Element): number {
    let value = 1;
    let node: Element | null = el;
    while (node && node !== this.stage.parentElement) {
      const own = parseFloat(getComputedStyle(node).opacity);
      if (!Number.isNaN(own)) value *= own;
      node = node.parentElement;
    }
    return value;
  }

  /**
   * What sits behind a piece of text. Walks earlier siblings and ancestors for
   * the topmost opaque background whose box covers the text, falling back to
   * the composition's own background. An approximation, but it catches the
   * case that matters: light text dropped onto a light panel.
   */
  private backdropOf(el: Element, rect: DOMRect): string | null {
    const covers = (candidate: Element): boolean => {
      const box = candidate.getBoundingClientRect();
      return (
        box.left <= rect.left &&
        box.top <= rect.top &&
        box.right >= rect.right &&
        box.bottom >= rect.bottom
      );
    };

    let backdrop: string | null = null;
    for (const candidate of Array.from(this.stage.querySelectorAll("*"))) {
      if (candidate === el || candidate.contains(el)) {
        // An ancestor's background still counts, a descendant's does not.
        if (!candidate.contains(el) || candidate === el) continue;
      }
      // Only things painted before the text can be behind it.
      const position = el.compareDocumentPosition(candidate);
      const earlier = (position & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
      const ancestor = (position & Node.DOCUMENT_POSITION_CONTAINS) !== 0;
      if (!earlier && !ancestor) continue;
      const style = getComputedStyle(candidate);
      if (style.display === "none") continue;
      if (parseAlpha(style.backgroundColor) < 0.9) continue;
      if (!covers(candidate)) continue;
      backdrop = style.backgroundColor;
    }

    if (backdrop === null) {
      const own = getComputedStyle(this.comp).backgroundColor;
      backdrop = parseAlpha(own) >= 0.9 ? own : null;
    }
    return backdrop;
  }

  facts(): SceneFacts {
    return {
      fontStatus: document.fonts.status,
      pendingFaces: this.pendingFaces(),
      unresolvedStacks: this.unresolvedStacks(),
      foreignAssets: this.foreignAssets(),
      tweenConflicts: this.tweenConflicts(),
    };
  }

  /**
   * Families the scene asks for that no loaded face provides. System stacks
   * are the safe default, so anything else has to be confirmed present before
   * an export starts or the first frames render in a fallback face.
   */
  /** Declared faces that never arrived. Unambiguous: the scene asked for them. */
  private pendingFaces(): string[] {
    const pending = new Set<string>();
    document.fonts.forEach((face) => {
      if (face.status !== "loaded") pending.add(face.family.replace(/["']/g, ""));
    });
    return Array.from(pending);
  }

  /**
   * Font stacks that render as nothing anyone chose. A stack naming faces for
   * other platforms is doing its job, so a missing family is only worth
   * reporting when no family in the stack resolves and no generic catches it.
   */
  private unresolvedStacks(): string[] {
    const generic = new Set([
      "serif",
      "sans-serif",
      "monospace",
      "cursive",
      "fantasy",
      "system-ui",
      "ui-sans-serif",
      "ui-serif",
      "ui-monospace",
      "ui-rounded",
      "inherit",
      "initial",
      "-apple-system",
      "blinkmacsystemfont",
    ]);

    const stacks = new Set<string>();
    for (const el of Array.from(this.stage.querySelectorAll("*"))) {
      stacks.add(getComputedStyle(el).fontFamily);
    }

    const unresolved: string[] = [];
    for (const stack of stacks) {
      const families = stack
        .split(",")
        .map((raw) => raw.trim().replace(/["']/g, ""))
        .filter((family) => family !== "");
      if (families.length === 0) continue;
      if (families.some((family) => generic.has(family.toLowerCase()))) continue;
      if (families.some((family) => this.resolves(family))) continue;
      unresolved.push(stack);
    }
    return unresolved;
  }

  /**
   * Whether a font family actually renders. document.fonts.check() is no help
   * here: it assumes any family it has no FontFace for is an installed system
   * font, so it answers true for names that do not exist. Measuring text does
   * not lie. A family that changes nothing against two metrically different
   * fallbacks was never applied.
   */
  private resolves(family: string): boolean {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;

    const sample = "MW@iljI1 mimimi";
    const width = (font: string): number => {
      ctx.font = font;
      return ctx.measureText(sample).width;
    };

    for (const fallback of ["monospace", "serif"]) {
      if (width(`72px "${family}", ${fallback}`) !== width(`72px ${fallback}`)) return true;
    }
    return false;
  }

  /**
   * Assets the export rasterizer will not be able to inline. Images have to be
   * same-origin or CORS-readable; anything else exports as a hole.
   */
  private foreignAssets(): string[] {
    const found = new Set<string>();
    const check = (raw: string): void => {
      if (raw === "" || raw.startsWith("data:") || raw.startsWith("blob:")) return;
      try {
        const url = new URL(raw, location.href);
        if (url.origin !== location.origin) found.add(url.href);
      } catch {
        /* not a URL we can judge */
      }
    };

    for (const el of Array.from(this.stage.querySelectorAll("*"))) {
      if (el instanceof HTMLImageElement) check(el.src);
      if (el.tagName === "W-MODEL") check(el.getAttribute("src") ?? "");
      const background = getComputedStyle(el).backgroundImage;
      for (const match of background.matchAll(/url\((['"]?)(.*?)\1\)/g)) check(match[2] ?? "");
    }
    return Array.from(found);
  }

  /**
   * Two tweens on the same property of the same element fight for the whole
   * timeline, because clamped values outside a window still write. Entrance
   * plus exit has to be split across nesting levels instead.
   */
  private tweenConflicts(): TweenConflict[] {
    const conflicts: TweenConflict[] = [];

    for (const el of Array.from(this.stage.querySelectorAll("*"))) {
      if (!isEntity(el)) continue;

      const byProperty = new Map<string, string[]>();
      const record = (property: string | null, source: string): void => {
        if (!property) return;
        const list = byProperty.get(property) ?? [];
        list.push(source);
        byProperty.set(property, list);
      };

      // Named animations apply first, left to right, then inline children.
      for (const name of (el.getAttribute("motion") ?? "").split(/\s+/).filter(Boolean)) {
        const definition = this.resolveAnimation(el, name);
        if (!definition) continue;
        for (const tween of Array.from(definition.children)) {
          if (tween.tagName === "W-ANIMATE") record(tween.getAttribute("property"), `motion="${name}"`);
        }
      }
      for (const child of Array.from(el.children)) {
        if (child.tagName === "W-ANIMATE") record(child.getAttribute("property"), "inline <w-animate>");
      }

      for (const [property, sources] of byProperty) {
        if (sources.length < 2) continue;
        conflicts.push({
          key: `${el.tagName.toLowerCase()}`,
          tag: el.tagName.toLowerCase(),
          text: textOf(el),
          property,
          sources,
        });
      }
    }
    return conflicts;
  }

  /** Named animation lookup walks up to the nearest <w-defs>; inner scopes shadow outer. */
  private resolveAnimation(from: Element, name: string): Element | null {
    const escaped = name.replace(/["\\]/g, "\\$&");
    let node: Element | null = from.parentElement;
    while (node) {
      const found = node.querySelector(`:scope > w-defs > w-animation[name="${escaped}"]`);
      if (found) return found;
      node = node.parentElement;
    }
    return null;
  }
}

/** Install the probe API on a live composition and wait for it to be ready. */
export async function install(comp: HTMLElement): Promise<void> {
  await (comp as unknown as { ready: Promise<void> }).ready;
  window.__wm = new Probe(comp);
}
