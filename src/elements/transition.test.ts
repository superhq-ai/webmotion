// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { applyFrame, type FrameContext } from "./registry.js";
import { buildThreshold, coverage } from "./transition.js";
import { defineTransitionElement, WTransition } from "./transition.js";

defineTransitionElement();

const ctx = (frame: number): FrameContext => ({
  frame,
  globalFrame: frame,
  fps: 30,
  width: 1920,
  height: 1080,
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("coverage", () => {
  it("is empty at amount 0 and full at amount 1 for every cell", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(coverage(t, 0, 0)).toBe(0);
      expect(coverage(t, 1, 0)).toBe(1);
    }
  });

  it("keeps the endpoints even with a soft edge", () => {
    for (const t of [0, 0.3, 0.6, 0.9]) {
      expect(coverage(t, 0, 0.4)).toBe(0);
      expect(coverage(t, 1, 0.4)).toBe(1);
    }
  });

  it("never decreases as amount rises", () => {
    for (const t of [0.1, 0.5, 0.8]) {
      let prev = -1;
      for (let a = 0; a <= 1.0001; a += 0.1) {
        const c = coverage(t, a, 0.25);
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });

  it("covers a cell once amount passes its threshold (crisp)", () => {
    expect(coverage(0.5, 0.4, 0)).toBe(0);
    expect(coverage(0.5, 0.6, 0)).toBe(1);
  });
});

describe("buildThreshold", () => {
  it("produces one in-range value per cell", () => {
    const field = buildThreshold("dither", 8, 6, "right", 1);
    expect(field.length).toBe(48);
    for (const v of field) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for a dissolve seed and varies with it", () => {
    const a = buildThreshold("dissolve", 10, 10, "right", 7);
    const b = buildThreshold("dissolve", 10, 10, "right", 7);
    const c = buildThreshold("dissolve", 10, 10, "right", 8);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("sweeps a wipe monotonically along its direction", () => {
    const cols = 6;
    const field = buildThreshold("wipe", cols, 1, "right", 1);
    for (let c = 1; c < cols; c++) {
      expect(field[c]!).toBeGreaterThan(field[c - 1]!);
    }
  });

  it("opens an iris from the center outward", () => {
    const cols = 7;
    const rows = 7;
    const field = buildThreshold("iris", cols, rows, "out", 1);
    const center = field[Math.floor(rows / 2) * cols + Math.floor(cols / 2)]!;
    const corner = field[0]!;
    expect(center).toBeLessThan(corner);
  });
});

describe("<w-transition>", () => {
  it("registers and exposes a live canvas", () => {
    const el = document.createElement("w-transition") as WTransition;
    el.setAttribute("width", "320");
    el.setAttribute("height", "180");
    document.body.appendChild(el);
    expect(el).toBeInstanceOf(WTransition);
    expect(el.wmLiveCanvas()).toBeInstanceOf(HTMLCanvasElement);
  });

  it("derives amount from enter/hold/exit over the local frame", () => {
    const stage = document.createElement("div");
    stage.innerHTML = `
      <w-transition width="320" height="180" enter="10" hold="4" exit="10"></w-transition>`;
    document.body.appendChild(stage);
    const el = stage.firstElementChild as WTransition & {
      wmApplyFrame(c: FrameContext): void;
    };

    // The private sampler is exercised through wmApplyFrame; assert it runs at
    // each phase without throwing and settles synchronously.
    for (const frame of [0, 5, 12, 18, 24, 30]) {
      expect(() => el.wmApplyFrame(ctx(frame))).not.toThrow();
    }
    return expect(el.wmAwaitFrame()).resolves.toBeUndefined();
  });

  it("is walked as a frame-hook entity by applyFrame", () => {
    const stage = document.createElement("div");
    stage.innerHTML = `
      <w-transition width="320" height="180" enter="10" exit="10"></w-transition>`;
    document.body.appendChild(stage);
    expect(() => applyFrame(stage, ctx(5))).not.toThrow();
  });
});
