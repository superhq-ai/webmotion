import { describe, it, expect } from "vitest";
import { interpolate } from "./interpolate.js";
import { easeInOutCubic, cubicBezier, linear } from "./easing.js";

describe("interpolate", () => {
  it("maps linearly across a single segment", () => {
    expect(interpolate(15, [0, 30], [0, 1])).toBeCloseTo(0.5);
    expect(interpolate(0, [0, 30], [0, 1])).toBe(0);
    expect(interpolate(30, [0, 30], [0, 1])).toBe(1);
  });

  it("extends beyond the range by default", () => {
    expect(interpolate(60, [0, 30], [0, 1])).toBeCloseTo(2);
    expect(interpolate(-30, [0, 30], [0, 1])).toBeCloseTo(-1);
  });

  it("clamps when asked", () => {
    expect(interpolate(60, [0, 30], [0, 1], { extrapolateRight: "clamp" })).toBe(1);
    expect(interpolate(-30, [0, 30], [0, 1], { extrapolateLeft: "clamp" })).toBe(0);
  });

  it("chains multiple keyframes (fade in then out)", () => {
    const input = [0, 30, 60];
    const output = [0, 1, 0];
    expect(interpolate(0, input, output)).toBe(0);
    expect(interpolate(30, input, output)).toBe(1);
    expect(interpolate(45, input, output)).toBeCloseTo(0.5);
    expect(interpolate(60, input, output)).toBe(0);
  });

  it("applies easing within a segment while pinning endpoints", () => {
    const eased = interpolate(15, [0, 30], [0, 1], { easing: easeInOutCubic });
    expect(eased).toBeCloseTo(0.5); // symmetric curve at the midpoint
    expect(interpolate(0, [0, 30], [0, 1], { easing: easeInOutCubic })).toBe(0);
    expect(interpolate(30, [0, 30], [0, 1], { easing: easeInOutCubic })).toBe(1);
  });

  it("is deterministic: same frame yields the same value", () => {
    const at = (f: number) => interpolate(f, [0, 100], [0, 500], { easing: easeInOutCubic });
    for (let f = 0; f <= 100; f++) expect(at(f)).toBe(at(f));
  });

  it("rejects malformed ranges", () => {
    expect(() => interpolate(0, [0], [0])).toThrow();
    expect(() => interpolate(0, [0, 1], [0])).toThrow();
    expect(() => interpolate(0, [10, 0], [0, 1])).toThrow(); // not increasing
  });
});

describe("cubicBezier", () => {
  it("pins its endpoints", () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("is monotonic for a standard ease and roughly symmetric at the middle", () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(ease(0.5)).toBeCloseTo(0.5, 2);
  });

  it("reduces to linear for the identity control points", () => {
    const ease = cubicBezier(0, 0, 1, 1);
    for (let t = 0; t <= 1.0001; t += 0.1) {
      expect(ease(t)).toBeCloseTo(linear(t), 2);
    }
  });
});
