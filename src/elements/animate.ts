import { interpolate } from "../animation/interpolate.js";
import type { EasingFunction } from "../animation/easing.js";
import { num, parseProps, resolveEasing, splitUnit } from "./parse.js";
import { registerComponent, setAnimatedProp, type FrameContext } from "./registry.js";

// One declarative, frame-based tween. Authored as:
//   animate="property: opacity; from: 0; to: 1; start: 0; end: 20; easing: easeOutCubic"
// Multiple tweens on one element use the __suffix form (animate__fade, animate__slide).
export interface AnimateData {
  property: string;
  from: number;
  to: number;
  start: number;
  end: number;
  easing: EasingFunction;
  unit: string;
}

function parseAnimate(value: string): AnimateData {
  const p = parseProps(value);
  const from = splitUnit(p.from ?? "0");
  const to = splitUnit(p.to ?? "0");
  // Prefer an explicit unit on `to`, then on `from`, else none.
  const unit = to.unit || from.unit || "";
  return {
    property: p.property ?? "opacity",
    from: from.value,
    to: to.value,
    start: num(p.start, 0),
    end: num(p.end, 0),
    easing: resolveEasing(p.easing),
    unit,
  };
}

function renderAnimate(el: HTMLElement, data: AnimateData, ctx: FrameContext): void {
  const value = interpolate(ctx.frame, [data.start, data.end], [data.from, data.to], {
    easing: data.easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  setAnimatedProp(el, data.property, value, data.unit);
}

export function registerAnimate(): void {
  registerComponent<AnimateData>("animate", { parse: parseAnimate, render: renderAnimate });
}
