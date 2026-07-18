import * as easings from "../animation/easing.js";
import type { EasingFunction } from "../animation/easing.js";

// Parse an A-Frame style attribute value: "prop: a; other: b" into a map.
export function parseProps(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

// Read a numeric attribute, returning a fallback when absent or unparseable.
export function num(value: string | null | undefined, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
}

// Split a value like "40px" or "-12deg" into its number and unit.
export function splitUnit(raw: string): { value: number; unit: string } {
  const m = /^(-?[\d.]+)(.*)$/.exec(raw.trim());
  if (!m || m[1] === undefined) return { value: 0, unit: "" };
  return { value: Number.parseFloat(m[1]), unit: (m[2] ?? "").trim() };
}

// Look up a named easing from the animation module, or build one from a css
// style cubic-bezier(x1, y1, x2, y2) string (y values outside [0, 1] give
// overshoot). Defaults to linear.
export function resolveEasing(name: string | undefined): EasingFunction {
  if (!name) return easings.linear;
  const bezier = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(
    name.trim(),
  );
  if (bezier) {
    return easings.cubicBezier(
      Number(bezier[1]),
      Number(bezier[2]),
      Number(bezier[3]),
      Number(bezier[4]),
    );
  }
  const fn = (easings as Record<string, unknown>)[name];
  return typeof fn === "function" ? (fn as EasingFunction) : easings.linear;
}
