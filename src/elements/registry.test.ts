// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { registerAnimate } from "./animate.js";
import {
  applyFrame,
  registerComponent,
  setAnimatedProp,
  type FrameContext,
} from "./registry.js";

const ctx = (frame: number): FrameContext => ({
  frame,
  globalFrame: frame,
  fps: 30,
  width: 1280,
  height: 720,
});

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

beforeAll(() => {
  registerAnimate();
});

describe("applyFrame with the animate component", () => {
  it("interpolates opacity as a pure function of frame", () => {
    const root = mount(`<div animate="property: opacity; from: 0; to: 1; start: 0; end: 10"></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
    applyFrame(root, ctx(0));
    expect(el.style.opacity).toBe("0");
    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
  });

  it("clamps outside the tween window", () => {
    const root = mount(`<div animate="property: opacity; from: 0; to: 1; start: 10; end: 20"></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(0));
    expect(el.style.opacity).toBe("0");
    applyFrame(root, ctx(30));
    expect(el.style.opacity).toBe("1");
  });

  it("composes multiple animate__ instances into one transform", () => {
    const root = mount(
      `<div animate__x="property: x; from: 0; to: 100; start: 0; end: 10"
            animate__spin="property: rotate; from: 0; to: 90; start: 0; end: 10"></div>`,
    );
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.transform).toBe("translate(50px, 0px) scale(1) rotate(45deg)");
  });

  it("layers animated opacity on top of the static opacity attribute", () => {
    const root = mount(
      `<div opacity="0.5" animate="property: x; from: 0; to: 10; start: 0; end: 10"></div>`,
    );
    const el = root.firstElementChild as HTMLElement;

    // Only the transform was touched, so the base opacity attribute is left alone.
    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("");
    expect(el.style.transform).toBe("translate(5px, 0px) scale(1) rotate(0deg)");
  });

  it("writes non-transform properties straight to style with their unit", () => {
    const root = mount(
      `<div animate="property: border-radius; from: 0px; to: 20px; start: 0; end: 10"></div>`,
    );
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.borderRadius).toBe("10px");
  });

  it("reparses when the attribute string changes", () => {
    const root = mount(`<div animate="property: opacity; from: 0; to: 1; start: 0; end: 10"></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(10));
    expect(el.style.opacity).toBe("1");

    el.setAttribute("animate", "property: opacity; from: 0; to: 0.4; start: 0; end: 10");
    applyFrame(root, ctx(10));
    expect(el.style.opacity).toBe("0.4");
  });
});

describe("applyFrame with sequences", () => {
  const scene = `
    <w-sequence from="10" duration="20">
      <div animate="property: opacity; from: 0; to: 1; start: 0; end: 10"></div>
    </w-sequence>`;

  it("hides a sequence outside its window", () => {
    const root = mount(scene);
    const seq = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(0));
    expect(seq.style.display).toBe("none");
    applyFrame(root, ctx(30));
    expect(seq.style.display).toBe("none");
    applyFrame(root, ctx(15));
    expect(seq.style.display).toBe("");
  });

  it("shifts the frame origin for descendants", () => {
    const root = mount(scene);
    const inner = root.querySelector("div") as HTMLElement;

    // Global frame 15 is local frame 5 inside the from=10 sequence.
    applyFrame(root, ctx(15));
    expect(inner.style.opacity).toBe("0.5");
  });

  it("treats a missing duration as unbounded", () => {
    const root = mount(`<w-sequence from="10"><div></div></w-sequence>`);
    const seq = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(10_000));
    expect(seq.style.display).toBe("");
  });

  it("maps nested sequences cumulatively", () => {
    const root = mount(`
      <w-sequence from="10">
        <w-sequence from="5">
          <div animate="property: opacity; from: 0; to: 1; start: 0; end: 10"></div>
        </w-sequence>
      </w-sequence>`);
    const inner = root.querySelector("div") as HTMLElement;

    applyFrame(root, ctx(20));
    expect(inner.style.opacity).toBe("0.5");
  });
});

describe("registerComponent", () => {
  it("runs custom components and init once per parse", () => {
    let inits = 0;
    const rendered: number[] = [];
    registerComponent<{ raw: string }>("probe", {
      parse: (value) => ({ raw: value }),
      init: () => {
        inits += 1;
      },
      render: (_el, _data, c) => {
        rendered.push(c.frame);
      },
    });

    const root = mount(`<div probe="a"></div>`);
    applyFrame(root, ctx(1));
    applyFrame(root, ctx(2));
    expect(rendered).toEqual([1, 2]);
    expect(inits).toBe(1);

    (root.firstElementChild as HTMLElement).setAttribute("probe", "b");
    applyFrame(root, ctx(3));
    expect(inits).toBe(2);
  });
});

describe("setAnimatedProp", () => {
  it("is a no-op for elements outside a frame walk", () => {
    const el = document.createElement("div");
    setAnimatedProp(el, "opacity", 0.5, "");
    expect(el.style.opacity).toBe("");
  });
});
