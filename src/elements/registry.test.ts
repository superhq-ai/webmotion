// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
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

describe("applyFrame with inline <w-animate>", () => {
  it("interpolates opacity as a pure function of frame", () => {
    const root = mount(`
      <div><w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
    applyFrame(root, ctx(0));
    expect(el.style.opacity).toBe("0");
    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
  });

  it("clamps outside the tween window", () => {
    const root = mount(`
      <div><w-animate property="opacity" from="0" to="1" start="10" end="20"></w-animate></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(0));
    expect(el.style.opacity).toBe("0");
    applyFrame(root, ctx(30));
    expect(el.style.opacity).toBe("1");
  });

  it("composes several tweens into one transform", () => {
    const root = mount(`
      <div>
        <w-animate property="x" from="0" to="100" start="0" end="10"></w-animate>
        <w-animate property="rotate" from="0" to="90" start="0" end="10"></w-animate>
      </div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.transform).toBe("translate(50px, 0px) scale(1) rotate(45deg)");
  });

  it("does not walk into tween elements or animate them", () => {
    const root = mount(`
      <div><w-animate property="x" from="0" to="100" start="0" end="10"></w-animate></div>`);
    const tween = root.querySelector("w-animate") as HTMLElement;

    applyFrame(root, ctx(5));
    expect(tween.style.transform).toBe("");
  });

  it("writes non-transform properties straight to style with their unit", () => {
    const root = mount(`
      <div><w-animate property="border-radius" from="0px" to="20px" start="0" end="10"></w-animate></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.borderRadius).toBe("10px");
  });

  it("reparses when a tween attribute changes", () => {
    const root = mount(`
      <div><w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate></div>`);
    const el = root.firstElementChild as HTMLElement;

    applyFrame(root, ctx(10));
    expect(el.style.opacity).toBe("1");

    (root.querySelector("w-animate") as Element).setAttribute("to", "0.4");
    applyFrame(root, ctx(10));
    expect(el.style.opacity).toBe("0.4");
  });
});

describe("applyFrame with <w-defs> and motion references", () => {
  const DEFS = `
    <w-defs>
      <w-animation name="fade">
        <w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate>
      </w-animation>
      <w-animation name="rise">
        <w-animate property="y" from="40" to="0" start="0" end="10"></w-animate>
      </w-animation>
    </w-defs>`;

  it("applies a named animation to the referencing element", () => {
    const root = mount(`${DEFS}<div motion="fade"></div>`);
    const el = root.querySelector("div") as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
  });

  it("applies multiple names left to right", () => {
    const root = mount(`${DEFS}<div motion="fade rise"></div>`);
    const el = root.querySelector("div") as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.transform).toBe("translate(0px, 20px) scale(1) rotate(0deg)");
  });

  it("ignores unresolved names silently", () => {
    const root = mount(`${DEFS}<div motion="no-such fade"></div>`);
    const el = root.querySelector("div") as HTMLElement;

    applyFrame(root, ctx(5));
    expect(el.style.opacity).toBe("0.5");
  });

  it("lets inline tweens override named ones", () => {
    const root = mount(`
      ${DEFS}
      <div motion="fade">
        <w-animate property="opacity" from="0" to="0.6" start="0" end="10"></w-animate>
      </div>`);
    const el = root.querySelector("div") as HTMLElement;

    applyFrame(root, ctx(10));
    expect(el.style.opacity).toBe("0.6");
  });

  it("shadows outer definitions with the nearest scope", () => {
    const root = mount(`
      ${DEFS}
      <section>
        <w-defs>
          <w-animation name="fade">
            <w-animate property="opacity" from="0" to="0.5" start="0" end="10"></w-animate>
          </w-animation>
        </w-defs>
        <div motion="fade"></div>
      </section>`);
    const el = root.querySelector("section div") as HTMLElement;

    applyFrame(root, ctx(10));
    expect(el.style.opacity).toBe("0.5");
  });

  it("never renders or recurses into defs", () => {
    const root = mount(`${DEFS}<div motion="fade"></div>`);
    const defTween = root.querySelector("w-animation w-animate") as HTMLElement;

    applyFrame(root, ctx(5));
    expect(defTween.style.opacity).toBe("");
  });
});

describe("applyFrame with sequences", () => {
  const scene = `
    <w-sequence from="10" duration="20">
      <div><w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate></div>
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
          <div><w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate></div>
        </w-sequence>
      </w-sequence>`);
    const inner = root.querySelector("div") as HTMLElement;

    applyFrame(root, ctx(20));
    expect(inner.style.opacity).toBe("0.5");
  });

  it("staggers instances of one definition through sequence windows", () => {
    const root = mount(`
      <w-defs>
        <w-animation name="fade">
          <w-animate property="opacity" from="0" to="1" start="0" end="10"></w-animate>
        </w-animation>
      </w-defs>
      <w-sequence from="0"><div id="a" motion="fade"></div></w-sequence>
      <w-sequence from="8"><div id="b" motion="fade"></div></w-sequence>`);
    const a = root.querySelector("#a") as HTMLElement;
    const b = root.querySelector("#b") as HTMLElement;

    applyFrame(root, ctx(10));
    expect(a.style.opacity).toBe("1");
    expect(b.style.opacity).toBe("0.2");
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
