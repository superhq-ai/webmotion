// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { applyFrame, getCompositorState, setCompositorStage, type FrameContext } from "./registry.js";
import { StageLayerPlanner } from "./compositor.js";

const ctx = (frame: number): FrameContext => ({
  frame,
  globalFrame: frame,
  fps: 30,
  width: 1280,
  height: 720,
});

function mount(html: string): HTMLElement {
  const stage = document.createElement("div");
  stage.innerHTML = html;
  document.body.appendChild(stage);
  return stage;
}

afterEach(() => {
  setCompositorStage(null);
  document.body.innerHTML = "";
});

describe("registry compositor mode", () => {
  it("captures transform and opacity instead of writing inline styles", () => {
    const stage = mount(`
      <div id="a">
        <w-animate property="x" from="0" to="100" start="0" end="10"></w-animate>
        <w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate>
      </div>`);
    const el = stage.firstElementChild as HTMLElement;

    setCompositorStage(stage);
    applyFrame(stage, ctx(5));

    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");
    const st = getCompositorState(el);
    expect(st?.touchedTransform).toBe(true);
    expect(st?.tx).toBe(50);
    expect(st?.touchedOpacity).toBe(true);
    expect(st?.opacity).toBe(0.5);
  });

  it("still writes inline styles for entities nested below a plain element", () => {
    const stage = mount(`
      <div><div id="nested">
        <w-animate property="x" from="0" to="100" start="0" end="10"></w-animate>
      </div></div>`);
    const nested = stage.querySelector("#nested") as HTMLElement;

    setCompositorStage(stage);
    applyFrame(stage, ctx(5));

    expect(nested.style.transform).toContain("translate(50px");
    expect(getCompositorState(nested)).toBeUndefined();
  });

  it("treats entities under sequences as compositor layers", () => {
    const stage = mount(`
      <w-sequence from="0" duration="20">
        <div id="a"><w-animate property="x" from="0" to="10" start="0" end="10"></w-animate></div>
      </w-sequence>`);
    const el = stage.querySelector("#a") as HTMLElement;

    setCompositorStage(stage);
    applyFrame(stage, ctx(5));

    expect(el.style.transform).toBe("");
    expect(getCompositorState(el)?.touchedTransform).toBe(true);
  });

  it("clears inline values a preview pass left behind", () => {
    const stage = mount(`
      <div><w-animate property="x" from="0" to="100" start="0" end="10"></w-animate></div>`);
    const el = stage.firstElementChild as HTMLElement;

    applyFrame(stage, ctx(5));
    expect(el.style.transform).not.toBe("");

    setCompositorStage(stage);
    applyFrame(stage, ctx(5));
    expect(el.style.transform).toBe("");
  });

  it("drops captured state when compositor mode ends", () => {
    const stage = mount(`
      <div><w-animate property="x" from="0" to="100" start="0" end="10"></w-animate></div>`);
    const el = stage.firstElementChild as HTMLElement;

    setCompositorStage(stage);
    applyFrame(stage, ctx(5));
    expect(getCompositorState(el)).toBeDefined();

    setCompositorStage(null);
    applyFrame(stage, ctx(6));
    expect(el.style.transform).toContain("translate(60px");
  });
});

describe("StageLayerPlanner", () => {
  it("collects visible top-level entities in document order", () => {
    const stage = mount(`
      <div id="bg"></div>
      <w-sequence from="0" duration="20">
        <div id="a"></div>
        <div id="b"></div>
      </w-sequence>
      <w-sequence from="20" duration="20" style="display:none">
        <div id="hidden"></div>
      </w-sequence>`);
    const planner = new StageLayerPlanner(stage);

    const plan = planner.planFrame();
    expect(plan).not.toBeNull();
    expect(plan?.layers.map((l) => l.node.id)).toEqual(["bg", "a", "b"]);
    planner.dispose();
  });

  it("marks layers dirty on first sight and clean when nothing mutated", () => {
    const stage = mount(`<div id="a"></div>`);
    const planner = new StageLayerPlanner(stage);

    const first = planner.planFrame();
    expect(first?.layers[0]?.dirty).toBe(true);

    const second = planner.planFrame();
    expect(second?.layers[0]?.dirty).toBe(false);
    planner.dispose();
  });

  it("dirties a layer whose content mutated", () => {
    const stage = mount(`<div id="a"><span>x</span></div><div id="b"></div>`);
    const planner = new StageLayerPlanner(stage);
    planner.planFrame();

    const span = stage.querySelector("span") as HTMLElement;
    span.textContent = "y";

    const plan = planner.planFrame();
    const byId = new Map(plan?.layers.map((l) => [l.node.id, l.dirty]));
    expect(byId.get("a")).toBe(true);
    expect(byId.get("b")).toBe(false);
    planner.dispose();
  });

  it("keeps mutations that were delivered to the observer callback", async () => {
    // The export loop awaits between frames, so records often reach the
    // observer callback (which empties the takeRecords queue) before
    // planFrame runs. They must still dirty the layer.
    const stage = mount(`<div id="a"><span>x</span></div>`);
    const planner = new StageLayerPlanner(stage);
    planner.planFrame();

    const span = stage.querySelector("span") as HTMLElement;
    span.textContent = "y";
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const plan = planner.planFrame();
    expect(plan?.layers[0]?.dirty).toBe(true);
    planner.dispose();
  });

  it("releases layers that leave the plan and re-dirties them on return", () => {
    const stage = mount(`
      <w-sequence from="0" duration="10"><div id="a"></div></w-sequence>`);
    const seq = stage.firstElementChild as HTMLElement;
    const planner = new StageLayerPlanner(stage);

    planner.planFrame();
    seq.style.display = "none";
    const hiddenPlan = planner.planFrame();
    expect(hiddenPlan?.released.map((n) => n.id)).toEqual(["a"]);

    seq.style.display = "";
    const backPlan = planner.planFrame();
    expect(backPlan?.layers[0]?.dirty).toBe(true);
    planner.dispose();
  });

  it("falls back to whole-stage rasterization for bare text at layer level", () => {
    const stage = mount(`hello <div id="a"></div>`);
    const planner = new StageLayerPlanner(stage);
    expect(planner.planFrame()).toBeNull();
    planner.dispose();
  });

  it("reads static inline transform and opacity into the plan", () => {
    const stage = mount(`<div id="a" style="transform: rotate(3deg); opacity: 0.5"></div>`);
    const planner = new StageLayerPlanner(stage);
    const plan = planner.planFrame();
    const layer = plan?.layers[0];
    expect(layer?.transform).toBe("rotate(3deg)");
    expect(layer?.opacity).toBe(0.5);
    planner.dispose();
  });

  it("prefers captured compositor state over inline styles", () => {
    const stage = mount(`
      <div id="a">
        <w-animate property="scale" from="1" to="2" start="0" end="10"></w-animate>
        <w-animate property="opacity" from="1" to="0" start="0" end="10"></w-animate>
      </div>`);
    setCompositorStage(stage);
    applyFrame(stage, ctx(5));

    const planner = new StageLayerPlanner(stage);
    const plan = planner.planFrame();
    const layer = plan?.layers[0];
    expect(layer?.transform).toEqual({ tx: 0, ty: 0, scale: 1.5, rot: 0 });
    expect(layer?.opacity).toBe(0.5);
    planner.dispose();
  });
});
