// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sourceTimeAt, type SourceTiming } from "./decoder.js";
import { fitRect } from "./video-element.js";

const timing = (over: Partial<SourceTiming> = {}): SourceTiming => ({
  from: 0,
  trim: 0,
  speed: 1,
  loop: false,
  duration: 10,
  ...over,
});

describe("sourceTimeAt", () => {
  it("maps composition frames to source seconds at the clip rate", () => {
    expect(sourceTimeAt(0, 30, timing())).toBeCloseTo(0, 6);
    expect(sourceTimeAt(30, 30, timing())).toBeCloseTo(1, 6);
    expect(sourceTimeAt(45, 30, timing())).toBeCloseTo(1.5, 6);
  });

  it("holds the in point before `from`", () => {
    const t = timing({ from: 20, trim: 2 });
    expect(sourceTimeAt(0, 30, t)).toBeCloseTo(2, 6);
    expect(sourceTimeAt(20, 30, t)).toBeCloseTo(2, 6);
    expect(sourceTimeAt(50, 30, t)).toBeCloseTo(3, 6); // 1s after `from`
  });

  it("offsets by trim and scales by speed", () => {
    expect(sourceTimeAt(30, 30, timing({ trim: 4 }))).toBeCloseTo(5, 6);
    expect(sourceTimeAt(30, 30, timing({ speed: 2 }))).toBeCloseTo(2, 6);
  });

  it("clamps just under the duration when not looping", () => {
    const t = timing({ duration: 3 });
    const v = sourceTimeAt(1000, 30, t);
    expect(v).toBeLessThan(3);
    expect(v).toBeGreaterThan(2.99);
  });

  it("wraps on the duration when looping", () => {
    const t = timing({ duration: 2, loop: true });
    expect(sourceTimeAt(30, 30, t)).toBeCloseTo(1, 6); // 1s in
    expect(sourceTimeAt(75, 30, t)).toBeCloseTo(0.5, 6); // 2.5s -> 0.5s
  });
});

describe("fitRect", () => {
  it("stretches for fill", () => {
    expect(fitRect(640, 480, 1920, 1080, "fill")).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it("covers the box and centers the overflow", () => {
    // 16:9 box, 4:3 source -> scale by width, overflow top/bottom.
    const r = fitRect(640, 480, 1920, 1080, "cover");
    expect(r.w).toBeCloseTo(1920, 3);
    expect(r.h).toBeCloseTo(1440, 3);
    expect(r.x).toBeCloseTo(0, 3);
    expect(r.y).toBeCloseTo(-180, 3);
  });

  it("letterboxes for contain", () => {
    const r = fitRect(640, 480, 1920, 1080, "contain");
    expect(r.h).toBeCloseTo(1080, 3);
    expect(r.w).toBeCloseTo(1440, 3);
    expect(r.x).toBeCloseTo(240, 3);
    expect(r.y).toBeCloseTo(0, 3);
  });

  it("is safe when the source has no size", () => {
    expect(fitRect(0, 0, 1920, 1080, "cover")).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
});
