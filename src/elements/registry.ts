import { num } from "./parse.js";

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
// allows multiple instances of one component (e.g. animate__fade).
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

// Render one entity for the current frame: reset accumulators, run each
// attached component, then compose transform and opacity.
function renderEntity(el: HTMLElement, ctx: FrameContext): void {
  const attrs = componentAttrs(el);
  if (attrs.length === 0) return;

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

  if (st.touchedTransform) {
    el.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale}) rotate(${st.rot}deg)`;
  }
  if (st.touchedOpacity) {
    el.style.opacity = String(st.opacity);
  }
}

// Walk the subtree applying the current frame. A <wm-sequence from duration>
// shifts the frame origin for its descendants and hides them outside its window.
export function applyFrame(container: Element, ctx: FrameContext): void {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;

    if (child.tagName === "WM-SEQUENCE") {
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
