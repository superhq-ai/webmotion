// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { evaluate, expandTemplates } from "./template.js";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("evaluate", () => {
  const scopes = [{ i: 2, chip: { label: "hi", w: 300 }, rows: [10, 20, 30] }];

  it("does arithmetic with precedence and parentheses", () => {
    expect(evaluate("6 + i * 30", scopes)).toBe(66);
    expect(evaluate("(i + 1) * 80", scopes)).toBe(240);
    expect(evaluate("-i + 10", scopes)).toBe(8);
    expect(evaluate("10 / i", scopes)).toBe(5);
  });

  it("resolves paths with dots and indexes", () => {
    expect(evaluate("chip.label", scopes)).toBe("hi");
    expect(evaluate("chip.w + 40", scopes)).toBe(340);
    expect(evaluate("rows[1]", scopes)).toBe(20);
  });

  it("uses the innermost scope first", () => {
    expect(evaluate("i", [{ i: 9 }, ...scopes])).toBe(9);
  });

  it("throws on unknown names, calls, and trailing input", () => {
    expect(() => evaluate("nope", scopes)).toThrow();
    expect(() => evaluate("alert(1)", scopes)).toThrow();
    expect(() => evaluate("1 2", scopes)).toThrow();
    expect(() => evaluate("chip.label * 2", scopes)).toThrow();
  });
});

describe("expandTemplates", () => {
  it("stamps children per item with interpolation in text and attributes", () => {
    const root = mount(`
      <w-data name="lines">["one", "two", "three"]</w-data>
      <w-for each="lines" as="line">
        <w-text x="{100 + i * 50}">{line}</w-text>
      </w-for>`);
    expandTemplates(root);

    const texts = Array.from(root.querySelectorAll(":scope > w-text"));
    expect(texts.map((t) => t.textContent)).toEqual(["one", "two", "three"]);
    expect(texts.map((t) => t.getAttribute("x"))).toEqual(["100", "150", "200"]);
    // The template itself stays, inert, still holding its original child.
    expect(root.querySelector("w-for w-text")?.textContent).toBe("{line}");
  });

  it("expands count loops with no item data", () => {
    const root = mount(`<w-for count="3"><w-rect y="{i * 10}"></w-rect></w-for>`);
    expandTemplates(root);

    const rects = Array.from(root.querySelectorAll(":scope > w-rect"));
    expect(rects.map((r) => r.getAttribute("y"))).toEqual(["0", "10", "20"]);
  });

  it("reads object items through paths", () => {
    const root = mount(`
      <w-data name="stats">[{"n": "99.99%", "l": "uptime"}, {"n": "4.8", "l": "speed"}]</w-data>
      <w-for each="stats" as="s">
        <w-el><b>{s.n}</b><span>{s.l}</span></w-el>
      </w-for>`);
    expandTemplates(root);

    const els = Array.from(root.querySelectorAll(":scope > w-el"));
    expect(els).toHaveLength(2);
    expect(els[0]?.querySelector("b")?.textContent).toBe("99.99%");
    expect(els[1]?.querySelector("span")?.textContent).toBe("speed");
  });

  it("nests loops with shadowed and renamed indexes", () => {
    const root = mount(`
      <w-for count="2" index="row">
        <div class="row">
          <w-for count="2">
            <span>{row}-{i}</span>
          </w-for>
        </div>
      </w-for>`);
    expandTemplates(root);

    const spans = Array.from(root.querySelectorAll(":scope > div span"))
      .map((s) => s.textContent?.trim())
      .filter((t) => t && !t.includes("{"));
    expect(spans).toEqual(["0-0", "0-1", "1-0", "1-1"]);
  });

  it("keeps sequence timing usable through expressions", () => {
    const root = mount(`
      <w-for count="3">
        <w-sequence from="{6 + i * 30}"><w-el></w-el></w-sequence>
      </w-for>`);
    expandTemplates(root);

    const froms = Array.from(root.querySelectorAll(":scope > w-sequence")).map((s) =>
      s.getAttribute("from"),
    );
    expect(froms).toEqual(["6", "36", "66"]);
  });

  it("leaves failing placeholders as written", () => {
    const root = mount(`<w-for count="1"><w-text y="{nope + 1}">{broken.path}</w-text></w-for>`);
    expandTemplates(root);

    const stamped = root.querySelector(":scope > w-text");
    expect(stamped?.getAttribute("y")).toBe("{nope + 1}");
    expect(stamped?.textContent).toBe("{broken.path}");
  });

  it("ignores invalid w-data JSON with a warning, not a throw", () => {
    const root = mount(`
      <w-data name="bad">not json</w-data>
      <w-for each="bad"><w-el></w-el></w-for>`);
    expect(() => expandTemplates(root)).not.toThrow();
    expect(root.querySelectorAll(":scope > w-el")).toHaveLength(0);
  });
});
