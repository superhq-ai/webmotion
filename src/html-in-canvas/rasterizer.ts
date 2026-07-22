// DomRasterizer turns a live DOM subtree into a raster canvas by serializing a
// clone into an SVG <foreignObject> and drawing that SVG through an image. It is
// the deterministic core the HtmlRenderer builds on. The approach is derived
// from repalash's three-html-render (MIT); see CREDITS.md.
import { createImage, css, embedUrlRefs } from "./dom-image.js";
import { syncFormState } from "./form-state.js";

const debugHIC =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("debugPolyfillHIC");
const CARET_BLINK_MS = 500;

interface RasterizerEntry {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  cssW: number;
  cssH: number;
  // Extra css pixels rasterized on every side of the border box, so paint that
  // escapes it (shadows, blur, overflowing children) survives per-layer
  // rasterization. 0 for whole-container rasters.
  bleed: number;
  lastSvg?: string;
}

export interface SnapshotOptions {
  // Rasterize as a standalone layer: size to the border box, neutralize the
  // root's layout position, and pad by `bleed` css pixels on each side.
  bleed?: number;
  // Raster resolution multiplier on top of the device pixel ratio, for layers
  // drawn scaled up at composite time.
  supersample?: number;
}

// One frame's serialized state; svg is null when the frame is identical to the
// previous one (or the node has no size) and the cached canvas can be reused.
export interface RasterSnapshot {
  entry: RasterizerEntry;
  svg: string | null;
}

export interface RasterResult {
  entry: RasterizerEntry;
  image: HTMLImageElement | null;
}

// Opt-in stage profiling: set `window.__WM_PROFILE = true` before an export,
// read `window.__wmProfile` after. Answers "where does export time go".
function profAdd(stage: string, ms: number): void {
  const g = globalThis as Record<string, unknown>;
  if (g["__WM_PROFILE"] !== true) return;
  const store = (g["__wmProfile"] ??= {}) as Record<string, { total: number; count: number }>;
  const entry = (store[stage] ??= { total: 0, count: 0 });
  entry.total += ms;
  entry.count += 1;
}

export class DomRasterizer {
  pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  private pageStyles = "";
  private entries = new Map<HTMLElement, RasterizerEntry>();
  private pageStylesCssPromise: Promise<string> | null = null;

  // Extra CSS that only applies inside the rasterized SVG. It restores scroll
  // offsets and animation delays that the clone cannot express on its own.
  readonly svgOnlyStyles = css`
[style*="--scroll-left"], [style*="--scroll-top"] {
    overflow: hidden !important;
}
[style*="--animation-delay"] {
    animation-delay: var(--animation-delay, 0s) !important;
}
[style*="--scroll-left"] > *, [style*="--scroll-top"] > * {
    transform: translate(var(--scroll-left, 0), var(--scroll-top, 0));
}
`;

  // Rasterize a node into a canvas sized to its CSS box (times the device pixel
  // ratio). The canvas is cached per node and reused across frames; an unchanged
  // SVG short circuits the redraw.
  async rasterize(node: HTMLElement): Promise<HTMLCanvasElement> {
    const snapshot = await this.snapshot(node);
    const raster = await this.rasterizeSnapshot(snapshot);
    return this.present(raster);
  }

  // The pipelined path splits rasterize() into three phases so an export loop
  // can overlap them across frames: snapshot() must see the DOM in the frame's
  // state (main thread, sequential); rasterizeSnapshot() is the long pole (the
  // browser parses the SVG and decodes embedded images off the main thread, so
  // several can be in flight); present() draws in frame order.
  async snapshot(node: HTMLElement, opts?: SnapshotOptions): Promise<RasterSnapshot> {
    const layerMode = opts?.bleed !== undefined;
    const bleed = opts?.bleed ?? 0;
    // Layers rasterize their full border box; whole-container rasters keep the
    // historical content-box measurement.
    const cssW = layerMode ? node.offsetWidth : node.clientWidth || node.offsetWidth;
    const cssH = layerMode ? node.offsetHeight : node.clientHeight || node.offsetHeight;
    if (cssW === 0 || cssH === 0) {
      const existing = this.entries.get(node);
      const entry = existing ?? this.ensureEntry(node, 1, 1, 0, 1);
      return { entry, svg: null };
    }

    const entry = this.ensureEntry(node, cssW, cssH, bleed, Math.max(1, opts?.supersample ?? 1));
    // Font families the scene actually asks for decide which @font-face rules
    // survive into the frame. Recorded before buildSvg so the first frame is
    // already pruned; a family appearing later drops the cached css and the
    // next frame picks its faces up.
    if (this.recordFontFamilies(node)) this.invalidatePageStylesCss();
    const t = performance.now();
    const svg = await this.buildSvg(node, cssW, cssH, layerMode ? bleed : null);
    profAdd("buildSvg", performance.now() - t);

    if (svg === entry.lastSvg) {
      if (debugHIC) console.log("[html-in-canvas] rasterization skipped (unchanged)");
      return { entry, svg: null };
    }
    if (debugHIC && entry.lastSvg) {
      logSvgDiff(entry.lastSvg, svg);
    }
    entry.lastSvg = svg;
    return { entry, svg };
  }

  async rasterizeSnapshot(snapshot: RasterSnapshot): Promise<RasterResult> {
    if (snapshot.svg === null) return { entry: snapshot.entry, image: null };
    const t = performance.now();
    const image = await loadSvgAsImage(snapshot.svg, snapshot.entry.cssW, snapshot.entry.cssH);
    profAdd("svgImageLoad", performance.now() - t);
    return { entry: snapshot.entry, image };
  }

  present(raster: RasterResult): HTMLCanvasElement {
    const { entry, image } = raster;
    if (image) {
      const t = performance.now();
      entry.context.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      entry.context.drawImage(image, 0, 0, entry.canvas.width, entry.canvas.height);
      profAdd("drawImage", performance.now() - t);
    }
    return entry.canvas;
  }

  getCanvas(node: HTMLElement): HTMLCanvasElement | null {
    return this.entries.get(node)?.canvas ?? null;
  }

  // Drop one node's cached canvas and serialized state, e.g. when a layer
  // leaves the composition for good.
  release(node: HTMLElement): void {
    this.entries.delete(node);
  }

  getCssSize(node: HTMLElement): { width: number; height: number } | null {
    const e = this.entries.get(node);
    return e ? { width: e.cssW, height: e.cssH } : null;
  }

  // Extra CSS to fold into every rasterized SVG, on top of the page stylesheets.
  setPageStyles(styles: string): void {
    this.pageStyles = styles;
  }

  // What the rasterized subtree asks of the page's fonts: the families it names
  // and the characters it renders. Both grow monotonically across frames, and
  // growth is what invalidates the cached css, so a family or a script that
  // only appears at frame 200 still gets its faces embedded from frame 200 on.
  private fontUsage: FontUsage = { families: new Set(), codePoints: new Set() };

  private recordFontFamilies(node: HTMLElement): boolean {
    let grew = false;
    const { families, codePoints } = this.fontUsage;

    const note = (el: Element): void => {
      for (const raw of getComputedStyle(el).fontFamily.split(",")) {
        const name = normalizeFontFamily(raw);
        if (name && !families.has(name)) {
          families.add(name);
          grew = true;
        }
      }
    };
    note(node);
    for (const el of node.querySelectorAll("*")) note(el);

    for (const ch of node.textContent ?? "") {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && !codePoints.has(cp)) {
        codePoints.add(cp);
        grew = true;
      }
    }
    return grew;
  }

  async getPageStylesCss(): Promise<string> {
    if (!this.pageStylesCssPromise) {
      const promise = collectAndInlinePageStyles(this.fontUsage);
      this.pageStylesCssPromise = promise;
      promise.catch(() => {
        if (this.pageStylesCssPromise === promise) {
          this.pageStylesCssPromise = null;
        }
      });
    }
    return this.pageStylesCssPromise;
  }

  invalidatePageStylesCss(): void {
    this.pageStylesCssPromise = null;
  }

  // Drop all cached canvases and shared state. Call when the rasterizer is done.
  dispose(): void {
    this.entries.clear();
    this.fontUsage.families.clear();
    this.fontUsage.codePoints.clear();
    this.pageStylesCssPromise = null;
    dataUrlCache.clear();
    inlinedCssCache.clear();
    if (mirrorDiv) {
      mirrorDiv.remove();
      mirrorDiv = null;
    }
  }

  private ensureEntry(
    node: HTMLElement,
    cssW: number,
    cssH: number,
    bleed: number,
    supersample: number,
  ): RasterizerEntry {
    const dpr = Math.max(1, this.pixelRatio) * supersample;
    const width = Math.max(1, Math.ceil((cssW + 2 * bleed) * dpr));
    const height = Math.max(1, Math.ceil((cssH + 2 * bleed) * dpr));
    let entry = this.entries.get(node);
    if (!entry) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("DomRasterizer: failed to acquire a 2D context");
      entry = { canvas, context, cssW, cssH, bleed };
      this.entries.set(node, entry);
    } else {
      if (entry.canvas.width !== width || entry.canvas.height !== height) {
        entry.canvas.width = width;
        entry.canvas.height = height;
      }
      entry.cssW = cssW;
      entry.cssH = cssH;
      entry.bleed = bleed;
    }
    return entry;
  }

  private async buildSvg(
    node: HTMLElement,
    cssW: number,
    cssH: number,
    layerBleed: number | null,
  ): Promise<string> {
    let t = performance.now();
    const clone = await prepareClone(node);
    if (layerBleed !== null) {
      // A layer raster stands alone: pin the clone at the bleed offset and
      // freeze its border-box size so losing its layout context (absolute
      // offsets, auto sizing against the parent) cannot move or resize it.
      clone.style.position = "absolute";
      clone.style.left = `${layerBleed}px`;
      clone.style.top = `${layerBleed}px`;
      clone.style.right = "auto";
      clone.style.bottom = "auto";
      clone.style.margin = "0";
      clone.style.boxSizing = "border-box";
      clone.style.width = `${cssW}px`;
      clone.style.height = `${cssH}px`;
    }
    profAdd("prepareClone", performance.now() - t);
    t = performance.now();
    const cloneXml = new XMLSerializer().serializeToString(clone);
    const outW = cssW + 2 * (layerBleed ?? 0);
    const outH = cssH + 2 * (layerBleed ?? 0);
    const innerXml =
      layerBleed !== null ? wrapLayerClone(cloneXml, outW, outH) : wrapClone(node, cloneXml);
    profAdd("serialize", performance.now() - t);

    const pageStylesCss = await this.getPageStylesCss();
    const style =
      BASELINE_CSS + "\n" + pageStylesCss + "\n" + this.pageStyles + "\n" + this.svgOnlyStyles;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg"` +
      ` width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">` +
      `<style><![CDATA[${style.replace(/]]>/g, "]]]]><![CDATA[>")}]]></style>` +
      `<foreignObject x="0" y="0" width="100%" height="100%">${innerXml}</foreignObject>` +
      `</svg>`;

    if (debugHIC) renderSvgDebugOverlay(svg);
    return svg;
  }
}

// Show the generated SVG in a translucent on-page overlay aligned with the first
// canvas, so the rasterized output can be compared against the live DOM.
function renderSvgDebugOverlay(svg: string): void {
  let dbg = document.getElementById("__hic-svg-debug__") as HTMLDivElement | null;
  if (!dbg) {
    dbg = document.createElement("div");
    dbg.id = "__hic-svg-debug__";
    dbg.style.cssText =
      "position:absolute;z-index:99999;pointer-events:none;opacity:0.3;box-sizing:border-box;margin:0;padding:0;border:none;overflow:hidden;";
    document.body.appendChild(dbg);
  }
  const canvasEl = document.querySelector("canvas");
  if (canvasEl) {
    const cr = canvasEl.getBoundingClientRect();
    dbg.style.left = cr.left + window.scrollX + "px";
    dbg.style.top = cr.top + window.scrollY + "px";
    dbg.style.width = cr.width + "px";
    dbg.style.height = cr.height + "px";
  }
  if (!dbg.innerHTML) {
    dbg.innerHTML = svg;
    const svgEl = dbg.querySelector("svg");
    if (svgEl) {
      svgEl.style.width = "100%";
      svgEl.style.height = "100%";
    }
  }
}

function logSvgDiff(oldSvg: string, newSvg: string): void {
  const oldLines = oldSvg.split("<");
  const newLines = newSvg.split("<");
  const diffs: string[] = [];
  const len = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < len; i++) {
    if (oldLines[i] !== newLines[i]) {
      diffs.push(`  - ${(oldLines[i] || "").slice(0, 120)}`);
      diffs.push(`  + ${(newLines[i] || "").slice(0, 120)}`);
    }
    if (diffs.length > 20) {
      diffs.push("  ...");
      break;
    }
  }
  console.log("[html-in-canvas] SVG changed:\n" + diffs.join("\n"));
}

// Inheritable properties bridged from the live container onto the clone root.
// The clone is rasterized without its ancestors, so anything the container
// inherits from above (a page rule on the composition element, body styles)
// would silently reset to UA defaults in the SVG document.
const INHERITED_PROPS = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "word-spacing",
  "text-transform",
  "direction",
] as const;

async function prepareClone(node: HTMLElement): Promise<HTMLElement> {
  const clone = node.cloneNode(true) as HTMLElement;
  syncFormState(node, clone);
  syncCloneTree(node, clone);
  injectCaretAndSelection(node, clone);
  injectPageSelection(node, clone);
  clone.style.removeProperty("transform");
  clone.style.opacity = "1";
  clone.style.visibility = "visible";
  const cs = getComputedStyle(node);
  for (const prop of INHERITED_PROPS) {
    if (!clone.style.getPropertyValue(prop)) {
      clone.style.setProperty(prop, cs.getPropertyValue(prop));
    }
  }
  await inlineExternalImages(clone);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  return clone;
}

// Wrapper for a standalone layer raster: a neutral relative container exactly
// the size of the SVG viewport, with the clone pinned inside it at the bleed
// offset. No ancestor classes are reproduced; inherited properties are bridged
// onto the clone root by prepareClone instead.
function wrapLayerClone(cloneXml: string, outW: number, outH: number): string {
  return (
    `<html xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;background:transparent !important;">` +
    `<body style="margin:0;padding:0;background:transparent !important;">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"` +
    ` style="position:relative;width:${outW}px;height:${outH}px;margin:0;padding:0;">` +
    cloneXml +
    `</div></body></html>`
  );
}

function wrapClone(node: HTMLElement, cloneXml: string): string {
  const parentEl = node.parentElement;
  const parentClass = parentEl?.getAttribute("class") || "";
  const parentW = parentEl?.clientWidth || node.clientWidth || node.offsetWidth;
  const parentH = parentEl?.clientHeight || node.clientHeight || node.offsetHeight;

  const classAttr = parentClass ? ` class="${escapeXmlAttr(parentClass)}"` : "";
  const ancestorOpen =
    `<div xmlns="http://www.w3.org/1999/xhtml"${classAttr}` +
    ` style="position:relative;width:${parentW}px;height:${parentH}px;margin:0;padding:0;">`;
  const ancestorClose = "</div>";

  return (
    `<html xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;background:transparent !important;">` +
    `<body style="margin:0;padding:0;background:transparent !important;">` +
    ancestorOpen +
    cloneXml +
    ancestorClose +
    `</body></html>`
  );
}

async function loadSvgAsImage(
  svg: string,
  cssW: number,
  cssH: number,
): Promise<HTMLImageElement> {
  // Data URL, not a blob URL: Chromium taints a canvas that draws a
  // foreignObject SVG loaded from a blob URL, which kills VideoFrame capture.
  // The percent-encode cost is the price of a capturable canvas.
  const t = performance.now();
  const dataUrl = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  profAdd("percentEncode", performance.now() - t);
  try {
    return await createImage(dataUrl);
  } catch (e) {
    const type =
      e && typeof e === "object" && "type" in e ? String((e as { type: unknown }).type) : typeof e;
    const head = svg.slice(0, 300).replace(/\s+/g, " ");
    throw new Error(
      `DomRasterizer: SVG image failed to load (${type}). ` +
        `cssW=${cssW}, cssH=${cssH}, svg.length=${svg.length}. svg head: ${head}...`,
      { cause: e },
    );
  }
}

async function collectAndInlinePageStyles(usage: FontUsage): Promise<string> {
  const sheets: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const cssRules = Array.from(sheet.cssRules || []);
      sheets.push(cssRules.map((r) => r.cssText).join("\n"));
    } catch {
      if (!sheet.href) continue;
      try {
        const res = await fetch(sheet.href);
        if (res.ok) sheets.push(await res.text());
      } catch (e) {
        console.warn("[html-in-canvas] failed to fetch stylesheet", sheet.href, e);
      }
    }
  }

  if (sheets.length === 0) return "";

  // Before anything is fetched: drop the @font-face rules this scene cannot
  // use. A page that loads a webfont hands us every face in its stylesheet,
  // and each surviving one is base64-embedded into the data URL of every
  // single frame, so an unpruned Google Fonts link costs about a megabyte per
  // frame for fonts the composition never renders.
  const joined = pruneUnusedFontFaces(sheets.join("\n"), usage);

  let combined: string;
  try {
    combined = await embedUrlRefs(joined, async (url) => {
      // W3C namespace URIs are identifiers, not fetchable resources.
      if (url.startsWith("http://www.w3.org/")) return url;
      try {
        return await fetchAsDataUrl(url);
      } catch {
        return url;
      }
    });
    // embedUrlRefs only sees absolute http(s) URLs; relative url() references
    // (same-origin images, fonts) need embedding too.
    combined = await inlineCssUrls(combined);
  } catch (e) {
    console.warn("[html-in-canvas] URL embedding failed", e);
    combined = joined;
  }

  const pseudoRules = rewritePseudoClasses(combined);
  return pseudoRules ? combined + "\n" + pseudoRules : combined;
}

const BASELINE_CSS = `
a { color: -webkit-link; text-decoration: underline; cursor: pointer; }
*.pseudo-focus-visible { outline: auto 1px -webkit-focus-ring-color; }
input.pseudo-focus-visible, textarea.pseudo-focus-visible, select.pseudo-focus-visible { outline-offset: 0; }
input[type="checkbox"].pseudo-focus-visible, input[type="radio"].pseudo-focus-visible { outline-offset: 2px; }
a.pseudo-focus-visible { outline-offset: 1px; }
@media (prefers-color-scheme: dark) {
    button.pseudo-hover, select.pseudo-hover,
    input.pseudo-hover, textarea.pseudo-hover {
        filter: brightness(1.1);
    }
    button.pseudo-active, select.pseudo-active,
    input.pseudo-active, textarea.pseudo-active {
        filter: brightness(0.9);
    }
}
@media (prefers-color-scheme: light) {
    button.pseudo-hover, select.pseudo-hover,
    input.pseudo-hover, textarea.pseudo-hover {
        filter: brightness(0.9);
    }
    button.pseudo-active, select.pseudo-active,
    input.pseudo-active, textarea.pseudo-active {
        filter: brightness(1.1);
    }
}
`;

// What a scene needs from the page's fonts.
export interface FontUsage {
  // Families named by the subtree, normalized by normalizeFontFamily.
  families: Set<string>;
  // Code points the subtree renders, for matching against unicode-range.
  codePoints: Set<number>;
}

// A CSS font-family token reduced to a comparable key: unquoted, unpadded,
// lowercased. Generic keywords survive as themselves and simply never match an
// @font-face family, which is what we want.
export function normalizeFontFamily(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .toLowerCase();
}

// Parse a unicode-range descriptor into inclusive [start, end] pairs.
// Handles the three forms in the spec: U+26, U+0-7F, and the wildcard U+4??.
// Returns null when the descriptor is absent or unparseable, meaning "assume
// this face covers everything".
export function parseUnicodeRange(text: string): Array<[number, number]> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const ranges: Array<[number, number]> = [];
  for (const rawToken of trimmed.split(",")) {
    const token = rawToken.trim();
    if (!/^[uU]\+/.test(token)) return null;
    const body = token.slice(2);

    if (body.includes("-")) {
      const [lo, hi] = body.split("-");
      const start = Number.parseInt(lo ?? "", 16);
      const end = Number.parseInt(hi ?? "", 16);
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      ranges.push([start, end]);
    } else if (body.includes("?")) {
      const start = Number.parseInt(body.replace(/\?/g, "0"), 16);
      const end = Number.parseInt(body.replace(/\?/g, "F"), 16);
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      ranges.push([start, end]);
    } else {
      const cp = Number.parseInt(body, 16);
      if (Number.isNaN(cp)) return null;
      ranges.push([cp, cp]);
    }
  }
  return ranges.length ? ranges : null;
}

// Drop every @font-face the scene cannot use: wrong family, or a unicode-range
// that covers none of the characters it renders. Rules are kept verbatim when
// anything is unreadable or unparseable, so the failure mode is "embed too
// much" rather than "lose a font".
export function pruneUnusedFontFaces(cssText: string, usage: FontUsage): string {
  if (!cssText.includes("@font-face")) return cssText;

  let sheet: CSSStyleSheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
  } catch {
    return cssText;
  }

  const covers = (ranges: Array<[number, number]>): boolean => {
    for (const cp of usage.codePoints) {
      for (const [start, end] of ranges) {
        if (cp >= start && cp <= end) return true;
      }
    }
    return false;
  };

  let dropped = 0;
  const keep = (rules: CSSRuleList): string[] => {
    const out: string[] = [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule) continue;
      if (isFontFaceRule(rule)) {
        const family = normalizeFontFamily(rule.style.getPropertyValue("font-family"));
        if (family && !usage.families.has(family)) {
          dropped += 1;
          continue;
        }
        const ranges = parseUnicodeRange(rule.style.getPropertyValue("unicode-range"));
        if (ranges && !covers(ranges)) {
          dropped += 1;
          continue;
        }
        out.push(rule.cssText);
      } else if (typeof CSSStyleRule !== "undefined" && rule instanceof CSSStyleRule) {
        // Must precede the grouping branch: CSS nesting made CSSStyleRule a
        // CSSGroupingRule, so a plain rule also answers to `cssRules` and would
        // otherwise be rebuilt as an empty block. Its cssText already carries
        // any nested rules.
        out.push(rule.cssText);
      } else if ("cssRules" in rule) {
        // @media / @supports can wrap font faces; recurse and rebuild the
        // wrapper only when something inside it survives.
        const group = rule as CSSGroupingRule;
        const inner = keep(group.cssRules);
        if (inner.length) {
          const head = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
          out.push(`${head} {\n${inner.join("\n")}\n}`);
        }
      } else {
        out.push(rule.cssText);
      }
    }
    return out;
  };

  const rebuilt = keep(sheet.cssRules);
  return dropped === 0 ? cssText : rebuilt.join("\n");
}

function isFontFaceRule(rule: CSSRule): rule is CSSFontFaceRule {
  return typeof CSSFontFaceRule !== "undefined" && rule instanceof CSSFontFaceRule;
}

const PSEUDO_RE = /:(?:hover|focus-visible|focus-within|focus(?!-)|active)\b/g;
const PSEUDO_RE_TEST = /:(?:hover|focus-visible|focus-within|focus(?!-)|active)\b/;

// SVG cannot honor live :hover/:focus/:active state, so rewrite those rules to a
// .pseudo-* class form that the clone can carry as a plain class name.
function rewritePseudoClasses(cssText: string): string {
  let sheet: CSSStyleSheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
  } catch {
    return "";
  }
  const out: string[] = [];
  collectRewrittenRules(sheet.cssRules, out);
  return out.join("\n");
}

function collectRewrittenRules(rules: CSSRuleList, out: string[]): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    if (rule instanceof CSSStyleRule) {
      if (PSEUDO_RE_TEST.test(rule.selectorText)) {
        const newSelector = rule.selectorText.replace(PSEUDO_RE, (m) => ".pseudo-" + m.slice(1));
        out.push(`${newSelector} { ${rule.style.cssText} }`);
      }
    } else if ("cssRules" in rule) {
      const group = rule as CSSGroupingRule;
      const inner: string[] = [];
      collectRewrittenRules(group.cssRules, inner);
      if (inner.length) {
        let condText = "";
        if (rule instanceof CSSMediaRule) condText = `@media ${rule.conditionText}`;
        else if (rule instanceof CSSSupportsRule) condText = `@supports ${rule.conditionText}`;
        else condText = rule.cssText.split("{")[0]?.trim() ?? "";
        if (condText) out.push(`${condText} {\n${inner.join("\n")}\n}`);
      }
    }
  }
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function writeDynamicStateInline(
  src: HTMLElement,
  dst: HTMLElement,
  cs: CSSStyleDeclaration,
): void {
  if (src.scrollLeft !== 0 || src.scrollTop !== 0) {
    dst.style.setProperty("--scroll-left", -src.scrollLeft + "px");
    dst.style.setProperty("--scroll-top", -src.scrollTop + "px");
  }

  const animations = src.getAnimations();
  if (animations.length !== 1) return;
  const anim = animations[0];
  if (!anim) return;
  const timeMs = typeof anim.currentTime === "number" ? anim.currentTime : 0;
  const delayStr = cs.animationDelay;
  const delaySec = delayStr.endsWith("ms") ? parseFloat(delayStr) / 1000 : parseFloat(delayStr);
  const adjustedDelaySec = (delaySec || 0) - timeMs / 1000;
  dst.style.setProperty("--animation-delay", adjustedDelaySec + "s");
}

const MIRROR_PROPS = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant",
  "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textTransform",
  "whiteSpace", "wordWrap", "overflowWrap", "wordBreak",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "boxSizing", "width", "direction", "textAlign",
] as const;

let mirrorDiv: HTMLDivElement | null = null;

// Measure the pixel position of a character index within an input or textarea by
// laying the same text out in a hidden mirror div and reading a marker's offset.
function measureCharPosition(
  el: HTMLInputElement | HTMLTextAreaElement,
  charIndex: number,
): { x: number; y: number; height: number } {
  if (!mirrorDiv) {
    mirrorDiv = document.createElement("div");
    mirrorDiv.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;visibility:hidden;overflow:hidden;";
    document.body.appendChild(mirrorDiv);
  }

  const cs = getComputedStyle(el);
  const isInput = el instanceof HTMLInputElement;

  for (const prop of MIRROR_PROPS) mirrorDiv.style[prop] = cs[prop];
  mirrorDiv.style.whiteSpace = isInput ? "pre" : cs.whiteSpace;
  mirrorDiv.style.height = "auto";
  mirrorDiv.style.overflowY = "hidden";

  const text = el.value;
  const before = text.substring(0, charIndex);

  mirrorDiv.textContent = "";
  const textNode = document.createTextNode(before);
  const marker = document.createElement("span");
  marker.textContent = "|";
  mirrorDiv.appendChild(textNode);
  mirrorDiv.appendChild(marker);
  // Trailing text keeps the wrapping context correct around the marker.
  mirrorDiv.appendChild(document.createTextNode(text.substring(charIndex) || "."));

  const fontSize = parseFloat(cs.fontSize);
  const lhParsed = parseFloat(cs.lineHeight);
  const lineHeight = isNaN(lhParsed)
    ? fontSize * 1.2
    : cs.lineHeight.endsWith("px")
      ? lhParsed
      : lhParsed * fontSize;

  return { x: marker.offsetLeft, y: marker.offsetTop, height: lineHeight };
}

function injectCaretAndSelection(rootSrc: HTMLElement, rootDst: HTMLElement): void {
  const active = document.activeElement;
  if (!active) return;

  let inputEl: HTMLInputElement | HTMLTextAreaElement;
  if (active instanceof HTMLInputElement) {
    const t = active.type;
    if (t !== "text" && t !== "search" && t !== "url" && t !== "tel" && t !== "password" && t !== "")
      return;
    inputEl = active;
  } else if (active instanceof HTMLTextAreaElement) {
    inputEl = active;
  } else {
    return;
  }

  if (!rootSrc.contains(inputEl)) return;
  const selStart = inputEl.selectionStart;
  const selEnd = inputEl.selectionEnd;
  if (selStart === null || selEnd === null) return;

  const cs = getComputedStyle(inputEl);
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;

  // Walk the offsetParent chain to get the input position in layout space
  // relative to rootSrc.
  let offsetX = 0;
  let offsetY = 0;
  let el: HTMLElement | null = inputEl;
  while (el && el !== rootSrc) {
    offsetX += el.offsetLeft;
    offsetY += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }

  const contentOriginX = offsetX + borderLeft;
  const contentOriginY = offsetY + borderTop;

  const clipLeft = contentOriginX;
  const clipRight = clipLeft + inputEl.clientWidth;
  const clipTop = contentOriginY;
  const clipBottom = clipTop + inputEl.clientHeight;

  if (selStart === selEnd) {
    const pos = measureCharPosition(inputEl, selStart);
    const caretX = contentOriginX + pos.x - inputEl.scrollLeft;
    const caretY = contentOriginY + pos.y - inputEl.scrollTop;

    const caretVisible = Math.floor(Date.now() / CARET_BLINK_MS) % 2 === 0;
    if (
      caretVisible &&
      caretX >= clipLeft &&
      caretX <= clipRight &&
      caretY >= clipTop &&
      caretY + pos.height <= clipBottom
    ) {
      const caret = document.createElement("div");
      caret.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      caret.style.cssText =
        `position:absolute;pointer-events:none;` +
        `left:${caretX}px;top:${caretY}px;` +
        `width:2px;height:${pos.height}px;` +
        `background:currentColor;`;
      rootDst.appendChild(caret);
    }
  } else {
    const startPos = measureCharPosition(inputEl, selStart);
    const endPos = measureCharPosition(inputEl, selEnd);

    const lineHeight = startPos.height;
    const scrollL = inputEl.scrollLeft;
    const scrollT = inputEl.scrollTop;

    if (startPos.y === endPos.y) {
      const left = Math.max(contentOriginX + startPos.x - scrollL, clipLeft);
      const right = Math.min(contentOriginX + endPos.x - scrollL, clipRight);
      const top = contentOriginY + startPos.y - scrollT;
      if (right > left && top >= clipTop && top + lineHeight <= clipBottom) {
        appendHighlight(rootDst, left, top, right - left, lineHeight);
      }
    } else {
      // A selection spanning multiple lines: first line, middle lines, last line.
      const lines: { left: number; right: number; top: number }[] = [];
      lines.push({
        left: contentOriginX + startPos.x - scrollL,
        right: clipRight,
        top: contentOriginY + startPos.y - scrollT,
      });
      for (let y = startPos.y + lineHeight; y < endPos.y; y += lineHeight) {
        lines.push({ left: clipLeft, right: clipRight, top: contentOriginY + y - scrollT });
      }
      lines.push({
        left: clipLeft,
        right: contentOriginX + endPos.x - scrollL,
        top: contentOriginY + endPos.y - scrollT,
      });

      for (const line of lines) {
        const left = Math.max(line.left, clipLeft);
        const right = Math.min(line.right, clipRight);
        if (right <= left) continue;
        if (line.top + lineHeight < clipTop || line.top > clipBottom) continue;
        appendHighlight(rootDst, left, line.top, right - left, lineHeight);
      }
    }
  }
}

function injectPageSelection(rootSrc: HTMLElement, rootDst: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (!rootSrc.contains(range.startContainer) && !rootSrc.contains(range.endContainer)) return;

  // Drop any 3D transform so getClientRects returns flat layout-space
  // coordinates rather than perspective-distorted ones, then restore it.
  const savedTransform = rootSrc.style.transform;
  const savedTransformOrigin = rootSrc.style.transformOrigin;
  rootSrc.style.transform = "none";
  rootSrc.style.transformOrigin = "";

  const rootRect = rootSrc.getBoundingClientRect();
  const scaleX = rootSrc.offsetWidth / rootRect.width;
  const scaleY = rootSrc.offsetHeight / rootRect.height;

  const clipRight = rootSrc.offsetWidth;
  const clipBottom = rootSrc.offsetHeight;

  const rects = range.getClientRects();
  const rectData: { left: number; top: number; width: number; height: number }[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!r) continue;
    rectData.push({
      left: (r.left - rootRect.left) * scaleX + rootSrc.scrollLeft,
      top: (r.top - rootRect.top) * scaleY + rootSrc.scrollTop,
      width: r.width * scaleX,
      height: r.height * scaleY,
    });
  }

  rootSrc.style.transform = savedTransform;
  rootSrc.style.transformOrigin = savedTransformOrigin;

  for (const rd of rectData) {
    let { left, top, width, height } = rd;

    if (left < 0) {
      width += left;
      left = 0;
    }
    if (top < 0) {
      height += top;
      top = 0;
    }
    if (left + width > clipRight) width = clipRight - left;
    if (top + height > clipBottom) height = clipBottom - top;
    if (width <= 0 || height <= 0) continue;

    appendHighlight(rootDst, left, top, width, height);
  }
}

function appendHighlight(
  root: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const highlight = document.createElement("div");
  highlight.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  highlight.style.cssText =
    `position:absolute;pointer-events:none;` +
    `left:${left}px;top:${top}px;` +
    `width:${width}px;height:${height}px;` +
    `background:Highlight;opacity:0.5;`;
  root.appendChild(highlight);
}

const VERTICAL_PROPS = [
  "fontSize", "lineHeight", "height", "minHeight", "maxHeight",
  "marginTop", "marginBottom", "paddingTop", "paddingBottom",
  "borderTopWidth", "borderBottomWidth",
] as const;

// One pass over the source and clone trees together: prune subtrees the frame
// cannot show, freeze resolved text metrics, and copy dynamic state (scroll,
// running animations) onto the clone. Pruning display:none subtrees is pixel
// neutral because they rasterize to nothing either way, but keeping them costs
// serialize bytes, style reads, and image inlining on every frame; inactive
// <w-sequence> scenes in a long composition are exactly this case.
function syncCloneTree(src: HTMLElement, dst: HTMLElement): void {
  const srcAll = [src, ...src.querySelectorAll<HTMLElement>("*")];
  const dstAll = [dst, ...dst.querySelectorAll<HTMLElement>("*")];
  if (srcAll.length !== dstAll.length) return;
  let skipRoot: HTMLElement | null = null;
  for (let i = 0; i < srcAll.length; i++) {
    const s = srcAll[i];
    const d = dstAll[i];
    if (!s || !d) continue;
    if (skipRoot) {
      if (skipRoot.contains(s)) continue;
      skipRoot = null;
    }
    const cs = getComputedStyle(s);
    if (i > 0 && cs.display === "none") {
      d.remove();
      skipRoot = s;
      continue;
    }
    // Canvas pixels do not survive cloneNode; swap the clone for an image of
    // the live canvas so WebGL and 2D surfaces render in whole-container
    // rasters. (Layer compositing captures them directly and never gets here.)
    if (s instanceof HTMLCanvasElement && s.width > 0 && s.height > 0) {
      const img = document.createElement("img");
      for (const attr of Array.from(d.attributes)) img.setAttribute(attr.name, attr.value);
      try {
        img.setAttribute("src", s.toDataURL());
        d.replaceWith(img);
      } catch {
        // A tainted canvas cannot be read back; leave the blank clone.
      }
      skipRoot = s;
      continue;
    }
    // Freeze vertical metrics, flooring subpixel values so wrapped text lands
    // on the same lines after rasterization.
    for (const prop of VERTICAL_PROPS) {
      const v = parseFloat(cs[prop]);
      if (isNaN(v)) continue;
      d.style[prop] = v % 1 !== 0 ? Math.floor(v) + "px" : cs[prop];
    }
    writeDynamicStateInline(s, d, cs);
  }
}

const dataUrlCache = new Map<string, Promise<string>>();

function fetchAsDataUrl(url: string): Promise<string> {
  const cached = dataUrlCache.get(url);
  if (cached) return cached;
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`fetch ${url} status ${r.status}`);
      return r.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as string);
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        }),
    );
  dataUrlCache.set(url, p);
  p.catch(() => {
    if (dataUrlCache.get(url) === p) dataUrlCache.delete(url);
  });
  return p;
}

async function inlineExternalImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const abs = new URL(src, document.baseURI).href;
        img.setAttribute("src", await fetchAsDataUrl(abs));
      } catch (e) {
        console.warn("[html-in-canvas] failed to inline img", src, e);
        img.removeAttribute("src");
      }
    }),
  );

  // Inline-style url() references (background images etc.). The SVG document is
  // a data URL with no base, so relative and same-origin URLs resolve to
  // nothing there; embed them as data URLs.
  const styled = [root, ...Array.from(root.querySelectorAll<HTMLElement>("[style*='url(']"))];
  await Promise.all(
    styled.map(async (el) => {
      const styleAttr = el.getAttribute("style");
      if (!styleAttr || !styleAttr.includes("url(")) return;
      el.setAttribute("style", await inlineCssUrlsCached(styleAttr));
    }),
  );

  // <style> elements inside the clone are serialized into the foreignObject
  // and apply there with higher cascade position than the svg-level styles, so
  // a relative url() in one would override its inlined copy with a reference
  // the SVG document cannot load.
  await Promise.all(
    Array.from(root.querySelectorAll("style")).map(async (styleEl) => {
      const css = styleEl.textContent ?? "";
      if (css.includes("url(")) styleEl.textContent = await inlineCssUrlsCached(css);
    }),
  );
}

// Bounded memo of inlined style strings, keyed on the raw css text. The key
// must be bounded: a style attribute that mixes a url() reference with an
// animated property (say a background image plus a per-frame transform) is a
// fresh key every frame, and each entry holds a multi-megabyte splice result.
// LRU order keeps static entries hot while churny ones cycle out.
const INLINED_CSS_CACHE_MAX = 32;
const inlinedCssCache = new Map<string, Promise<string>>();

async function inlineCssUrlsCached(cssText: string): Promise<string> {
  let hit = inlinedCssCache.get(cssText);
  if (hit) {
    inlinedCssCache.delete(cssText);
    inlinedCssCache.set(cssText, hit);
    return hit;
  }
  hit = inlineCssUrls(cssText);
  inlinedCssCache.set(cssText, hit);
  if (inlinedCssCache.size > INLINED_CSS_CACHE_MAX) {
    const oldest = inlinedCssCache.keys().next().value;
    if (oldest !== undefined) inlinedCssCache.delete(oldest);
  }
  hit.catch(() => {
    if (inlinedCssCache.get(cssText) === hit) inlinedCssCache.delete(cssText);
  });
  return hit;
}

// Replace every non-data url(...) in a CSS string with a data URL, resolving
// relative references against the document base. Failures leave the original
// reference in place.
async function inlineCssUrls(cssText: string): Promise<string> {
  const matches = Array.from(cssText.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g));
  for (const m of matches) {
    const ref = m[2];
    if (!ref || ref.startsWith("data:") || ref.startsWith("#")) continue;
    // W3C namespace URIs are identifiers, not fetchable resources.
    if (ref.startsWith("http://www.w3.org/")) continue;
    try {
      const abs = new URL(ref, document.baseURI).href;
      const dataUrl = await fetchAsDataUrl(abs);
      cssText = cssText.split(m[0]).join(`url("${dataUrl}")`);
    } catch (e) {
      console.warn("[html-in-canvas] failed to inline css url", ref, e);
    }
  }
  return cssText;
}
