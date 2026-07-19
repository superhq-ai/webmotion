// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readTween, sampleTween } from "./tween.js";

describe("looping tweens", () => {
  const make = (attrs: Record<string, string>) => {
    const el = document.createElement("w-animate");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return readTween(el);
  };

  it("takes the frame modulo the loop period", () => {
    const t = make({ property: "rotation-y", from: "180", to: "540", start: "450", end: "580", loop: "600" });
    expect(sampleTween(t, 0)).toBe(180); // dwell
    expect(sampleTween(t, 600)).toBe(180); // second loop dwell
    expect(sampleTween(t, 1190)).toBe(540); // 1190 % 600 = 590, past end
    expect(sampleTween(t, 515 + 600)).toBeGreaterThan(180); // mid-turn, later loop
  });

  it("offsets the phase before the modulo", () => {
    const base = make({ property: "rotation-y", from: "0", to: "1", start: "0", end: "100", loop: "200" });
    const shifted = make({ property: "rotation-y", from: "0", to: "1", start: "0", end: "100", loop: "200", "loop-offset": "50" });
    expect(sampleTween(shifted, 0)).toBe(sampleTween(base, 50));
    expect(sampleTween(shifted, 150)).toBe(sampleTween(base, 200));
  });

  it("loop 0 keeps play-once clamping", () => {
    const t = make({ property: "opacity", from: "0", to: "1", start: "0", end: "10" });
    expect(sampleTween(t, 500)).toBe(1);
  });
});
