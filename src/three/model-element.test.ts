// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { clipTimeAt } from "./model-element.js";
import { StageLayerPlanner } from "../elements/compositor.js";

describe("clipTimeAt", () => {
  const base = { from: 0, speed: 1, loop: true, duration: 2 };

  it("maps frames to seconds at the composition fps", () => {
    expect(clipTimeAt(0, 30, base)).toBe(0);
    expect(clipTimeAt(30, 30, base)).toBe(1);
    expect(clipTimeAt(45, 30, base)).toBe(1.5);
  });

  it("wraps on the clip duration when looping", () => {
    expect(clipTimeAt(90, 30, base)).toBe(1);
    expect(clipTimeAt(120, 30, base)).toBe(0);
  });

  it("clamps at the end when not looping", () => {
    expect(clipTimeAt(300, 30, { ...base, loop: false })).toBe(2);
  });

  it("shifts by the from frame and clamps before it", () => {
    expect(clipTimeAt(10, 30, { ...base, from: 40 })).toBe(0);
    expect(clipTimeAt(70, 30, { ...base, from: 40 })).toBe(1);
  });

  it("scales by speed", () => {
    expect(clipTimeAt(30, 30, { ...base, speed: 2 })).toBe(0);
    expect(clipTimeAt(15, 30, { ...base, speed: 2 })).toBe(1);
  });

  it("is safe on zero-duration clips", () => {
    expect(clipTimeAt(99, 30, { ...base, duration: 0 })).toBe(0);
  });
});

describe("live canvas layers", () => {
  it("marks elements exposing wmLiveCanvas as live layers", () => {
    const stage = document.createElement("div");
    document.body.appendChild(stage);
    const el = document.createElement("div");
    (el as HTMLElement & { wmLiveCanvas(): null }).wmLiveCanvas = () => null;
    stage.appendChild(el);
    stage.appendChild(document.createElement("div"));

    const planner = new StageLayerPlanner(stage);
    const plan = planner.planFrame();
    expect(plan?.layers[0]?.live).toBe(true);
    expect(plan?.layers[1]?.live).toBeUndefined();
    planner.dispose();
    stage.remove();
  });
});
