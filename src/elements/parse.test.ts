import { describe, expect, it } from "vitest";
import * as easings from "../animation/easing.js";
import { num, parseProps, resolveEasing, splitUnit } from "./parse.js";

describe("parseProps", () => {
  it("parses a semicolon-separated property string", () => {
    expect(parseProps("property: opacity; from: 0; to: 1")).toEqual({
      property: "opacity",
      from: "0",
      to: "1",
    });
  });

  it("trims whitespace around keys and values", () => {
    expect(parseProps("  from :  10px ; to:20px")).toEqual({ from: "10px", to: "20px" });
  });

  it("keeps colons inside values", () => {
    expect(parseProps("font: 600 84px/1.1 system-ui; color: rgb(1,2,3)")).toEqual({
      font: "600 84px/1.1 system-ui",
      color: "rgb(1,2,3)",
    });
  });

  it("ignores parts without a colon and empty keys", () => {
    expect(parseProps("loose; : nothing; from: 1;")).toEqual({ from: "1" });
  });

  it("returns an empty map for an empty string", () => {
    expect(parseProps("")).toEqual({});
  });

  it("lets a later duplicate key win", () => {
    expect(parseProps("from: 1; from: 2")).toEqual({ from: "2" });
  });
});

describe("num", () => {
  it("parses numbers with trailing units", () => {
    expect(num("42px")).toBe(42);
    expect(num("-3.5")).toBe(-3.5);
  });

  it("falls back when absent or unparseable", () => {
    expect(num(null, 7)).toBe(7);
    expect(num(undefined, 7)).toBe(7);
    expect(num("abc", 7)).toBe(7);
    expect(num("abc")).toBe(0);
  });
});

describe("splitUnit", () => {
  it("splits number and unit", () => {
    expect(splitUnit("40px")).toEqual({ value: 40, unit: "px" });
    expect(splitUnit("-12deg")).toEqual({ value: -12, unit: "deg" });
    expect(splitUnit("1.5")).toEqual({ value: 1.5, unit: "" });
  });

  it("trims surrounding whitespace", () => {
    expect(splitUnit("  40 px ")).toEqual({ value: 40, unit: "px" });
  });

  it("returns zero for values that do not start with a number", () => {
    expect(splitUnit("px")).toEqual({ value: 0, unit: "" });
    expect(splitUnit("")).toEqual({ value: 0, unit: "" });
  });
});

describe("resolveEasing", () => {
  it("resolves a named easing", () => {
    expect(resolveEasing("easeOutCubic")).toBe(easings.easeOutCubic);
  });

  it("defaults to linear when missing or unknown", () => {
    expect(resolveEasing(undefined)).toBe(easings.linear);
    expect(resolveEasing("noSuchEasing")).toBe(easings.linear);
  });
});
