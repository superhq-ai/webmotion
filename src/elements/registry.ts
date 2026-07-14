import { num } from "./parse.js";
import { readTween, sampleTween } from "./tween.js";

// The frame context handed to every component each frame. `frame` is local to
// the nearest enclosing sequence; `globalFrame` is the composition frame.
export interface FrameContext {
  frame: number;
  globalFrame: number;
  fps: number;
  width: number;
  height: number;
}

// A component is a named, reusable behavior attached to an element by attribute,
// in the spirit of A-Frame. `parse` turns the attribute string into typed data;
// `render` applies that data for the current frame. Determinism lives here: a
// component may only read `ctx.frame`, never the wall clock.
export interface ComponentDef<D = unknown> {
  parse(value: string): D;
  render(el: HTMLElement, data: D, ctx: FrameContext): void;
  init?(el: HTMLElement, data: D): void;
}

const components = new Map<string, ComponentDef>();

export function registerComponent<D>(name: string, def: ComponentDef<D>): void {
  components.set(name, def as ComponentDef);
}

export function getComponent(name: string): ComponentDef | undefined {
  return components.get(name);
}

// The base name of an attribute, dropping the A-Frame style "__id" suffix that
// allows multiple instances of one component (e.g. pulse__slow).
function baseName(attr: string): string {
  const i = attr.indexOf("__");
  return i === -1 ? attr : attr.slice(0, i);
}

// Per-frame transform and opacity accumulators, keyed by element so we do not
// have to augment the DOM types. Reset before a frame, composed after.
interface FrameState {
  tx: number;
  ty: number;
  scale: number;
  rot: number;
  opacity: number;
  touchedTransform: boolean;
  touchedOpacity: boolean;
}
const frameState = new WeakMap<HTMLElement, FrameState>();

// Cache of parsed component data per element, invalidated when the raw
// attribute string changes, so we parse once and not every frame.
const parsedCache = new WeakMap<HTMLElement, Map<string, { raw: string; data: unknown }>>();

function getParsed(el: HTMLElement, attr: string, def: ComponentDef): unknown {
  let byAttr = parsedCache.get(el);
  if (!byAttr) {
    byAttr = new Map();
    parsedCache.set(el, byAttr);
  }
  const raw = el.getAttribute(attr) ?? "";
  const hit = byAttr.get(attr);
  if (hit && hit.raw === raw) return hit.data;
  const data = def.parse(raw);
  byAttr.set(attr, { raw, data });
  if (def.init) def.init(el, data);
  return data;
}

// Apply an animated value. Transform sub-properties (x, y, scale, rotate) and
// opacity accumulate into frameState; anything else is written straight to the
// element style. Called by components during render.
export function setAnimatedProp(
  el: HTMLElement,
  property: string,
  value: number,
  unit: string,
): void {
  const st = frameState.get(el);
  if (!st) return;
  switch (property) {
    case "opacity":
      st.opacity = value;
      st.touchedOpacity = true;
      break;
    case "x":
      st.tx = value;
      st.touchedTransform = true;
      break;
    case "y":
      st.ty = value;
      st.touchedTransform = true;
      break;
    case "scale":
      st.scale = value;
      st.touchedTransform = true;
      break;
    case "rotate":
      st.rot = value;
      st.touchedTransform = true;
      break;
    default:
      el.style.setProperty(property, `${value}${unit}`);
  }
}

// Component attribute names present on an element, in document order.
function componentAttrs(el: HTMLElement): string[] {
  const names: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    if (components.has(baseName(attr.name))) names.push(attr.name);
  }
  return names;
}

// Behavior, definition, and audio nodes: never rendered, never walked as
// entities. <w-audio> tweens (gain) belong to the audio engine, not the walk.
function isInert(tagName: string): boolean {
  return (
    tagName === "W-ANIMATE" ||
    tagName === "W-DEFS" ||
    tagName === "W-ANIMATION" ||
    tagName === "W-AUDIO"
  );
}

// Resolve a <w-animation name> for `el` by walking up the tree: at each
// ancestor, direct <w-defs> children are checked, so inner scopes shadow outer
// ones. Falls back to a document-wide search. See docs/MOTION.md.
function resolveAnimation(el: Element, name: string): Element | null {
  for (let scope = el.parentElement; scope; scope = scope.parentElement) {
    for (const child of Array.from(scope.children)) {
      if (child.tagName !== "W-DEFS") continue;
      for (const def of Array.from(child.children)) {
        if (def.tagName === "W-ANIMATION" && def.getAttribute("name") === name) return def;
      }
    }
  }
  if (typeof document !== "undefined") {
    for (const def of Array.from(document.querySelectorAll("w-defs > w-animation"))) {
      if (def.getAttribute("name") === name) return def;
    }
  }
  return null;
}

// The <w-animate> elements that animate `el` this frame, in application order:
// each `motion` name left to right (its tweens in document order), then the
// entity's inline <w-animate> children. Last write to a property wins.
export function gatherTweens(el: HTMLElement): Element[] {
  const out: Element[] = [];
  const motion = el.getAttribute("motion");
  if (motion) {
    for (const name of motion.split(/\s+/)) {
      if (!name) continue;
      const def = resolveAnimation(el, name);
      if (!def) continue;
      for (const tween of Array.from(def.children)) {
        if (tween.tagName === "W-ANIMATE") out.push(tween);
      }
    }
  }
  for (const tween of Array.from(el.children)) {
    if (tween.tagName === "W-ANIMATE") out.push(tween);
  }
  return out;
}

// Render one entity for the current frame: reset accumulators, run attached
// components, sample its tweens, then compose transform and opacity.
function renderEntity(el: HTMLElement, ctx: FrameContext): void {
  const attrs = componentAttrs(el);
  const tweens = gatherTweens(el);
  if (attrs.length === 0 && tweens.length === 0) return;

  const baseOpacity = el.hasAttribute("opacity") ? num(el.getAttribute("opacity"), 1) : 1;
  const st: FrameState = {
    tx: 0,
    ty: 0,
    scale: 1,
    rot: 0,
    opacity: baseOpacity,
    touchedTransform: false,
    touchedOpacity: false,
  };
  frameState.set(el, st);

  for (const attr of attrs) {
    const def = components.get(baseName(attr));
    if (!def) continue;
    def.render(el, getParsed(el, attr, def), ctx);
  }

  for (const tween of tweens) {
    const data = readTween(tween);
    setAnimatedProp(el, data.property, sampleTween(data, ctx.frame), data.unit);
  }

  if (st.touchedTransform) {
    el.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale}) rotate(${st.rot}deg)`;
  }
  if (st.touchedOpacity) {
    el.style.opacity = String(st.opacity);
  }
}

// Walk the subtree applying the current frame. A <w-sequence from duration>
// shifts the frame origin for its descendants and hides them outside its window.
export function applyFrame(container: Element, ctx: FrameContext): void {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (isInert(child.tagName)) continue;

    if (child.tagName === "W-SEQUENCE") {
      const from = num(child.getAttribute("from"), 0);
      const durAttr = child.getAttribute("duration");
      const dur = durAttr == null ? Number.POSITIVE_INFINITY : num(durAttr, 0);
      const local = ctx.frame - from;
      const active = local >= 0 && local < dur;
      child.style.display = active ? "" : "none";
      if (active) applyFrame(child, { ...ctx, frame: local });
      continue;
    }

    renderEntity(child, ctx);
    applyFrame(child, ctx);
  }
}
