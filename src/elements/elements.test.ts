// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineElements, WComposition } from "./elements.js";

beforeAll(() => {
  defineElements();
});

// Tests share one document and reuse ids; start each from an empty body.
beforeEach(() => {
  document.body.replaceChildren();
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
    expect(customElements.get("w-animate")).toBeDefined();
    expect(customElements.get("w-defs")).toBeDefined();
    expect(customElements.get("w-animation")).toBeDefined();
    // Calling again must not throw on already-registered names.
    expect(() => defineElements()).not.toThrow();
  });

  it("keeps motion elements invisible", async () => {
    await mountComposition(`
      <w-composition width="640" height="360">
        <w-defs id="d"><w-animation name="fade"></w-animation></w-defs>
        <w-el><w-animate id="a"></w-animate></w-el>
      </w-composition>`);
    expect((document.getElementById("d") as HTMLElement).style.display).toBe("none");
    expect((document.getElementById("a") as HTMLElement).style.display).toBe("none");
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

  it("renders child text nodes and keeps tween children through text updates", async () => {
    await mountComposition(`
      <w-composition width="640" height="360">
        <w-text id="t">Hello
          <w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate>
        </w-text>
      </w-composition>`);
    const text = document.getElementById("t") as HTMLElement;

    expect(text.textContent).toContain("Hello");
    expect(text.querySelector("w-animate")).not.toBeNull();

    // The text attribute writes into its own span, leaving the tween alone.
    text.setAttribute("text", "Replaced");
    expect(text.textContent).toContain("Replaced");
    expect(text.querySelector("w-animate")).not.toBeNull();
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

  it("expands templates against the data property set before connect", async () => {
    const comp = document.createElement("w-composition") as WComposition;
    comp.setAttribute("width", "640");
    comp.setAttribute("height", "360");
    comp.data = { chips: ["a", "b"] };
    comp.innerHTML = `<w-for each="chips" as="chip"><w-text class="chip">{chip}</w-text></w-for>`;
    document.body.appendChild(comp);
    await comp.ready;

    const chips = Array.from(comp.querySelectorAll(".chip")).filter((c) => !c.closest("w-for"));
    expect(chips.map((c) => c.textContent)).toEqual(["a", "b"]);
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
        <w-el id="fade">
          <w-animate property="opacity" from="0" to="1" start="0" end="30"></w-animate>
        </w-el>
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

  it("resolves motion references against composition-scoped defs", async () => {
    const comp = await mountComposition(`
      <w-composition width="640" height="360" duration="60">
        <w-defs>
          <w-animation name="fade">
            <w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate>
          </w-animation>
        </w-defs>
        <w-sequence from="0"><w-el id="a" motion="fade"></w-el></w-sequence>
        <w-sequence from="8"><w-el id="b" motion="fade"></w-el></w-sequence>
      </w-composition>`);
    const a = document.getElementById("a") as HTMLElement;
    const b = document.getElementById("b") as HTMLElement;

    comp.seek(10);
    expect(a.style.opacity).toBe("1");
    expect(b.style.opacity).toBe("0.2");
  });

  it("exposes playing state and reports it through w-play/w-pause", async () => {
    const comp = await mountComposition(
      `<w-composition width="640" height="360" duration="60"></w-composition>`,
    );
    const seen: string[] = [];
    comp.addEventListener("w-play", () => seen.push("play"));
    comp.addEventListener("w-pause", () => seen.push("pause"));

    expect(comp.playing).toBe(false);
    comp.play();
    expect(comp.playing).toBe(true);
    comp.pause();
    expect(comp.playing).toBe(false);
    expect(seen).toEqual(["play", "pause"]);
  });

  it("seeds loop from the attribute and accepts property writes", async () => {
    const looped = await mountComposition(
      `<w-composition width="640" height="360" duration="60" loop></w-composition>`,
    );
    expect(looped.loop).toBe(true);

    const plain = await mountComposition(
      `<w-composition width="640" height="360" duration="60"></w-composition>`,
    );
    expect(plain.loop).toBe(false);
    plain.loop = true;
    expect(plain.loop).toBe(true);
  });

  it("holds volume and mute, clamped, with w-volumechange", async () => {
    const comp = await mountComposition(
      `<w-composition width="640" height="360" duration="60"></w-composition>`,
    );
    const changes: Array<{ volume: number; muted: boolean }> = [];
    comp.addEventListener("w-volumechange", (e) => changes.push((e as CustomEvent).detail));

    comp.volume = 0.4;
    comp.muted = true;
    expect(comp.volume).toBe(0.4);
    expect(comp.muted).toBe(true);
    comp.volume = 5;
    expect(comp.volume).toBe(1);
    expect(changes).toEqual([
      { volume: 0.4, muted: false },
      { volume: 0.4, muted: true },
      { volume: 1, muted: true },
    ]);
  });

  it("keeps volume assigned before setup", async () => {
    const comp = document.createElement("w-composition") as WComposition;
    comp.setAttribute("duration", "60");
    comp.volume = 0.25;
    comp.muted = true;
    document.body.appendChild(comp);
    await comp.ready;

    expect(comp.volume).toBe(0.25);
    expect(comp.muted).toBe(true);
  });

  it("stops on the last frame and fires w-ended without loop", async () => {
    const comp = await mountComposition(
      `<w-composition width="640" height="360" fps="1000" duration="4"></w-composition>`,
    );
    let ended = 0;
    comp.addEventListener("w-ended", () => ended++);

    comp.play();
    await vi.waitFor(() => expect(ended).toBe(1), { timeout: 2000 });
    expect(comp.playing).toBe(false);
    expect(comp.currentFrame).toBe(3);
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
