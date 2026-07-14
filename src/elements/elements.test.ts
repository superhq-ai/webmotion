// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { defineElements, WComposition } from "./elements.js";

beforeAll(() => {
  defineElements();
});

async function mountComposition(html: string): Promise<WComposition> {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const comp = host.querySelector("w-composition") as WComposition;
  await comp.ready;
  return comp;
}

describe("defineElements", () => {
  it("registers the w-* custom elements exactly once", () => {
    expect(customElements.get("w-composition")).toBeDefined();
    expect(customElements.get("w-sequence")).toBeDefined();
    expect(customElements.get("w-el")).toBeDefined();
    expect(customElements.get("w-text")).toBeDefined();
    expect(customElements.get("w-rect")).toBeDefined();
    // Calling again must not throw on already-registered names.
    expect(() => defineElements()).not.toThrow();
  });
});

describe("static entity attributes", () => {
  it("positions entities absolutely from x/y/width/height", async () => {
    await mountComposition(`
      <w-composition width="640" height="360" fps="30" duration="60">
        <w-rect id="r" x="10" y="20" width="100" height="50" fill="red" radius="8"></w-rect>
      </w-composition>`);
    const rect = document.getElementById("r") as HTMLElement;

    expect(rect.style.position).toBe("absolute");
    expect(rect.style.left).toBe("10px");
    expect(rect.style.top).toBe("20px");
    expect(rect.style.width).toBe("100px");
    expect(rect.style.height).toBe("50px");
    expect(rect.style.background).toBe("red");
    expect(rect.style.borderRadius).toBe("8px");
  });

  it("renders w-text content and typography", async () => {
    await mountComposition(`
      <w-composition width="640" height="360">
        <w-text id="t" text="Hello" color="white" align="center"></w-text>
      </w-composition>`);
    const text = document.getElementById("t") as HTMLElement;

    expect(text.textContent).toBe("Hello");
    expect(text.style.color).toBe("white");
    expect(text.style.textAlign).toBe("center");
  });

  it("re-applies static styles when an attribute changes", async () => {
    await mountComposition(`
      <w-composition width="640" height="360">
        <w-el id="e" x="0"></w-el>
      </w-composition>`);
    const el = document.getElementById("e") as HTMLElement;

    el.setAttribute("x", "42");
    expect(el.style.left).toBe("42px");
  });
});

describe("WComposition", () => {
  it("reads its config from attributes", async () => {
    const comp = await mountComposition(
      `<w-composition width="640" height="360" fps="24" duration="48"></w-composition>`,
    );
    expect(comp.width).toBe(640);
    expect(comp.height).toBe(360);
    expect(comp.fps).toBe(24);
    expect(comp.durationInFrames).toBe(48);
  });

  it("falls back to defaults when unconfigured", async () => {
    const comp = await mountComposition(`<w-composition></w-composition>`);
    expect(comp.width).toBe(1280);
    expect(comp.height).toBe(720);
    expect(comp.fps).toBe(30);
    expect(comp.durationInFrames).toBe(150);
  });

  it("instantiates scene markup from a template", async () => {
    const comp = await mountComposition(`
      <template id="scene"><w-text text="From template"></w-text></template>
      <w-composition template="#scene" width="640" height="360"></w-composition>`);

    const text = comp.querySelector("w-text") as HTMLElement;
    expect(text).not.toBeNull();
    expect(text.textContent).toBe("From template");
  });

  it("seeks deterministically and clamps to the frame range", async () => {
    const comp = await mountComposition(`
      <w-composition width="640" height="360" duration="60">
        <w-el id="fade" animate="property: opacity; from: 0; to: 1; start: 0; end: 30"></w-el>
      </w-composition>`);
    const fade = document.getElementById("fade") as HTMLElement;

    comp.seek(15);
    expect(comp.currentFrame).toBe(15);
    expect(fade.style.opacity).toBe("0.5");

    comp.seek(-5);
    expect(comp.currentFrame).toBe(0);
    comp.seek(500);
    expect(comp.currentFrame).toBe(59);

    comp.seek(15);
    expect(fade.style.opacity).toBe("0.5");
  });

  it("shows the poster frame after setup", async () => {
    const comp = await mountComposition(`
      <w-composition width="640" height="360" duration="60" poster="30"></w-composition>`);
    expect(comp.currentFrame).toBe(30);
  });

  it("emits w-seek with the clamped frame", async () => {
    const comp = await mountComposition(
      `<w-composition width="640" height="360" duration="60"></w-composition>`,
    );
    const frames: number[] = [];
    comp.addEventListener("w-seek", (e) => frames.push((e as CustomEvent).detail.frame));

    comp.seek(10);
    comp.seek(999);
    expect(frames).toEqual([10, 59]);
  });

  it("drives sequences from the composition frame", async () => {
    const comp = await mountComposition(`
      <w-composition width="640" height="360" duration="90">
        <w-sequence id="late" from="30" duration="30"><w-el></w-el></w-sequence>
      </w-composition>`);
    const late = document.getElementById("late") as HTMLElement;

    comp.seek(0);
    expect(late.style.display).toBe("none");
    comp.seek(45);
    expect(late.style.display).toBe("");
    comp.seek(80);
    expect(late.style.display).toBe("none");
  });
});
