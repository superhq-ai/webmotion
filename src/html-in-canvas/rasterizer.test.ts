// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { normalizeFontFamily, parseUnicodeRange, pruneUnusedFontFaces } from "./rasterizer.js";

const usage = (families: string[], text = "") => ({
  families: new Set(families),
  codePoints: new Set([...text].map((c) => c.codePointAt(0) as number)),
});

describe("normalizeFontFamily", () => {
  it("strips quotes, padding, and case", () => {
    expect(normalizeFontFamily(' "Inter Tight" ')).toBe("inter tight");
    expect(normalizeFontFamily("'JetBrains Mono'")).toBe("jetbrains mono");
    expect(normalizeFontFamily("  system-ui")).toBe("system-ui");
  });
});

describe("parseUnicodeRange", () => {
  it("parses the three descriptor forms", () => {
    expect(parseUnicodeRange("U+26")).toEqual([[0x26, 0x26]]);
    expect(parseUnicodeRange("U+0-7F")).toEqual([[0x0, 0x7f]]);
    expect(parseUnicodeRange("U+4??")).toEqual([[0x400, 0x4ff]]);
  });

  it("parses comma separated lists", () => {
    expect(parseUnicodeRange("U+0000-00FF, U+0131, U+2000-206F")).toEqual([
      [0x0, 0xff],
      [0x131, 0x131],
      [0x2000, 0x206f],
    ]);
  });

  it("returns null when absent or unparseable, so the face is kept", () => {
    expect(parseUnicodeRange("")).toBeNull();
    expect(parseUnicodeRange("   ")).toBeNull();
    expect(parseUnicodeRange("latin")).toBeNull();
    expect(parseUnicodeRange("U+ZZZZ")).toBeNull();
  });
});

describe("pruneUnusedFontFaces", () => {
  const inter = `@font-face { font-family: "Inter Tight"; src: url(inter.woff2); }`;
  const other = `@font-face { font-family: "Comic Sans"; src: url(comic.woff2); }`;
  const rule = `.title { color: red; }`;

  it("leaves css without font faces untouched", () => {
    expect(pruneUnusedFontFaces(rule, usage([]))).toBe(rule);
  });

  it("drops faces whose family the scene never names", () => {
    const out = pruneUnusedFontFaces(`${inter}\n${other}\n${rule}`, usage(["inter tight"], "A"));
    expect(out).toContain("Inter Tight");
    expect(out).not.toContain("Comic Sans");
    // Non font-face rules survive the rebuild.
    expect(out).toContain("color: red");
  });

  it("keeps every face when all families are in use", () => {
    const css = `${inter}\n${other}`;
    const out = pruneUnusedFontFaces(css, usage(["inter tight", "comic sans"], "A"));
    // Nothing dropped means the original text is returned verbatim.
    expect(out).toBe(css);
  });

  it("drops faces whose unicode-range covers none of the rendered text", () => {
    const latin = `@font-face { font-family: "Inter Tight"; src: url(l.woff2); unicode-range: U+0000-00FF; }`;
    const cyrillic = `@font-face { font-family: "Inter Tight"; src: url(c.woff2); unicode-range: U+0400-045F; }`;
    const out = pruneUnusedFontFaces(`${latin}\n${cyrillic}`, usage(["inter tight"], "Hello"));
    expect(out).toContain("l.woff2");
    expect(out).not.toContain("c.woff2");
  });

  it("keeps a subset once the scene renders a character inside its range", () => {
    const latin = `@font-face { font-family: "Inter Tight"; src: url(l.woff2); unicode-range: U+0000-00FF; }`;
    const cyrillic = `@font-face { font-family: "Inter Tight"; src: url(c.woff2); unicode-range: U+0400-045F; }`;
    const out = pruneUnusedFontFaces(`${latin}\n${cyrillic}`, usage(["inter tight"], "Привет"));
    expect(out).toContain("c.woff2");
  });

  it("keeps faces with no unicode-range descriptor", () => {
    const out = pruneUnusedFontFaces(inter, usage(["inter tight"], "A"));
    expect(out).toContain("inter.woff2");
  });

  // CSS nesting made CSSStyleRule a CSSGroupingRule, so a rebuild that treats
  // "has cssRules" as "is a wrapper" silently empties every ordinary rule.
  it("preserves ordinary and nested style rules through a rebuild", () => {
    const nested = `.card { color: blue; } .card:hover { color: green; }`;
    const out = pruneUnusedFontFaces(`${other}\n${nested}`, usage(["inter tight"], "A"));
    expect(out).not.toContain("Comic Sans");
    expect(out).toContain("color: blue");
    expect(out).toContain("color: green");
  });

  it("keeps rules wrapped in @media while dropping unused faces inside it", () => {
    const css = `@media screen { ${other} .wide { color: teal; } }`;
    const out = pruneUnusedFontFaces(css, usage(["inter tight"], "A"));
    expect(out).toContain("@media screen");
    expect(out).toContain("color: teal");
    expect(out).not.toContain("Comic Sans");
  });
});
