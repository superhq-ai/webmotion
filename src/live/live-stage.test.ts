// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveStage } from "./live-stage.js";
import { ManualTicker } from "./ticker.js";
import "../elements/index.js";

// A 30fps, 30-frame one-shot: one second of life on the manual clock.
const SHOT = `
<w-prop fps="30" duration="30" width="1000" height="500">
  <w-text id="donor" x="0" y="100" width="1000">{name} tipped</w-text>
  <w-el x="0" y="0" width="100" height="100">
    <w-animate property="x" from="0" to="300" start="0" end="30"></w-animate>
  </w-el>
</w-prop>`;

const BAR = `
<w-prop persistent fps="30" width="1000" height="500">
  <w-el id="bar" x="0" y="0" width="400" height="40"></w-el>
</w-prop>`;

// A persistent prop placed by data: the storefront shape. Updates must
// move it in place, never remount it.
const STAND = `
<w-prop persistent fps="30" width="1920" height="1080">
  <w-el id="stand" x="{x}" y="{y}" width="340" height="500">
    <w-text id="team" x="0" y="452" width="340" text="{team}"></w-text>
  </w-el>
</w-prop>`;

let ticker: ManualTicker;
let stage: LiveStage;
let errors: string[];

beforeEach(() => {
  ticker = new ManualTicker();
  errors = [];
  stage = new LiveStage({ ticker, onPropError: (name) => errors.push(name) });
  stage.registerProp("shot", SHOT);
  stage.registerProp("bar", BAR);
  stage.registerProp("stand", STAND);
});

afterEach(() => {
  stage.dispose();
  document.body.innerHTML = "";
});

describe("LiveStage lifecycle", () => {
  it("mounts on trigger with expanded data and unmounts at duration", () => {
    stage.trigger("shot", { name: "ada" });
    const text = stage.container.querySelector("#donor");
    expect(text?.textContent).toContain("ada tipped");
    expect(stage.active("shot")).toBe(true);

    ticker.advance(999);
    expect(stage.active("shot")).toBe(true);
    ticker.advance(2);
    expect(stage.active("shot")).toBe(false);
    expect(stage.container.querySelector("#donor")).toBeNull();
  });

  it("subscribes to the ticker only while props are mounted", () => {
    expect(ticker.subscriberCount).toBe(0);
    stage.trigger("shot", { name: "a" });
    expect(ticker.subscriberCount).toBe(1);
    ticker.advance(1100);
    expect(ticker.subscriberCount).toBe(0);
  });

  it("advances tweens on the local clock", () => {
    stage.trigger("shot", { name: "a" });
    const el = stage.container.querySelector<HTMLElement>("w-el");
    ticker.advance(500);
    const mid = el?.style.transform ?? "";
    const midX = parseFloat(/translate\(([\d.]+)px/.exec(mid)?.[1] ?? "0");
    expect(midX).toBeGreaterThan(100);
    expect(midX).toBeLessThan(200);
  });

  it("coalesces a re-trigger at depth 1 with latest data", () => {
    stage.trigger("shot", { name: "first" });
    ticker.advance(200);
    stage.trigger("shot", { name: "second" });
    stage.trigger("shot", { name: "third" });
    expect(stage.container.querySelector("#donor")?.textContent).toContain("first");

    ticker.advance(900);
    expect(stage.active("shot")).toBe(true);
    expect(stage.container.querySelector("#donor")?.textContent).toContain("third");
    ticker.advance(1100);
    expect(stage.active("shot")).toBe(false);
  });

  it("update re-resolves attribute placeholders on the mounted element", () => {
    stage.trigger("stand", { x: 1500, y: 280, team: "TEAM A" });
    const el = stage.container.querySelector<HTMLElement>("#stand");
    expect(el?.getAttribute("x")).toBe("1500");
    expect(stage.container.querySelector("#team")?.getAttribute("text")).toBe("TEAM A");

    ticker.advance(200);
    stage.trigger("stand", { x: 960, y: 140, team: "TEAM B" });

    // Same node: the prop moved and re-labeled without remounting.
    expect(stage.container.querySelector<HTMLElement>("#stand")).toBe(el);
    expect(el?.getAttribute("x")).toBe("960");
    expect(el?.getAttribute("y")).toBe("140");
    expect(el?.style.left).toBe("960px");
    expect(stage.container.querySelector("#team")?.getAttribute("text")).toBe("TEAM B");
  });

  it("restarts immediately in restart mode", () => {
    stage.trigger("shot", { name: "first" });
    ticker.advance(200);
    stage.trigger("shot", { name: "second" }, { mode: "restart" });
    expect(stage.container.querySelector("#donor")?.textContent).toContain("second");
    ticker.advance(900);
    expect(stage.active("shot")).toBe(true);
  });

  it("keeps persistent props mounted and routes trigger to update", () => {
    stage.trigger("bar", { pct: 40 });
    ticker.advance(5000);
    expect(stage.active("bar")).toBe(true);

    const bar = stage.container.querySelector<HTMLElement>("#bar") as HTMLElement & {
      wmBind(d: Record<string, unknown>): void;
      seen?: unknown;
    };
    bar.wmBind = function (d: Record<string, unknown>) {
      this.seen = d["pct"];
    };
    stage.trigger("bar", { pct: 55 });
    expect(bar.seen).toBe(55);
  });

  it("fails a throwing prop to nothing without harming others", () => {
    stage.trigger("bar", {});
    stage.trigger("shot", { name: "a" });
    const el = stage.container.querySelector<HTMLElement>("w-el:not(#bar)") as HTMLElement & {
      wmApplyFrame(): void;
    };
    el.wmApplyFrame = () => {
      throw new Error("boom");
    };

    ticker.advance(100);
    expect(stage.active("shot")).toBe(false);
    expect(stage.active("bar")).toBe(true);
    expect(errors).toEqual(["shot"]);

    // The stage still accepts new triggers after a failure.
    stage.trigger("shot", { name: "again" });
    expect(stage.active("shot")).toBe(true);
  });

  it("warns and ignores triggers for unregistered props", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stage.trigger("nope", {});
    expect(stage.active()).toBe(false);
    warn.mockRestore();
  });
});
