import { describe, expect, it } from "vitest";
import type { Beat, CompositionInfo, EntitySnapshot, FrameProbe, SceneFacts } from "./browser/api.js";
import { autoFrames, beatSamples, parseFrames } from "./frames.js";
import { contrastRatio, runRules, type LintInput } from "./rules.js";

function info(overrides: Partial<CompositionInfo> = {}): CompositionInfo {
  return { width: 1280, height: 720, fps: 30, duration: 120, beats: [], ...overrides };
}

function beat(label: string, from: number, to: number, depth = 0): Beat {
  return { label, from, to, depth };
}

function entity(overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    key: "w-text[0]",
    tag: "w-text",
    text: "Headline",
    box: { x: 0, y: 100, width: 1280, height: 110 },
    opacity: 1,
    displayed: true,
    overflowX: 0,
    overflowY: 0,
    color: "rgb(255, 255, 255)",
    backdrop: "rgb(0, 0, 0)",
    fontSize: 96,
    signature: "stable",
    ...overrides,
  };
}

function facts(overrides: Partial<SceneFacts> = {}): SceneFacts {
  return {
    fontStatus: "loaded",
    pendingFaces: [],
    unresolvedStacks: [],
    foreignAssets: [],
    tweenConflicts: [],
    ...overrides,
  };
}

function lint(overrides: Partial<LintInput> = {}) {
  const input: LintInput = {
    info: info(),
    facts: facts(),
    probes: new Map<number, FrameProbe>(),
    beatFrames: new Map<string, number[]>(),
    pageErrors: [],
    missingAssets: [],
    ...overrides,
  };
  return runRules(input);
}

function rules(findings: ReturnType<typeof lint>): string[] {
  return findings.map((finding) => finding.rule);
}

describe("blank-frame", () => {
  it("reports a frame with nothing visible on it", () => {
    const probes = new Map([[0, { frame: 0, entities: [entity({ opacity: 0 })] }]]);
    expect(rules(lint({ probes }))).toEqual(["blank-frame"]);
  });

  it("treats a collapsed box as nothing, which is how a closed sequence reads", () => {
    const hidden = entity({ box: { x: 0, y: 0, width: 0, height: 0 } });
    const probes = new Map([[0, { frame: 0, entities: [hidden] }]]);
    expect(rules(lint({ probes }))).toEqual(["blank-frame"]);
  });

  it("stays quiet when something is on screen", () => {
    const probes = new Map([[0, { frame: 0, entities: [entity()] }]]);
    expect(rules(lint({ probes }))).toEqual([]);
  });
});

describe("out-of-bounds", () => {
  const outside = entity({ box: { x: 1400, y: 300, width: 600, height: 220 } });
  const inside = entity({ box: { x: 100, y: 300, width: 600, height: 220 } });

  it("reports an entity that is never fully inside the frame", () => {
    const probes = new Map([
      [0, { frame: 0, entities: [outside] }],
      [30, { frame: 30, entities: [outside] }],
    ]);
    expect(rules(lint({ probes }))).toContain("out-of-bounds");
  });

  it("allows an entity that starts outside and slides in", () => {
    const probes = new Map([
      [0, { frame: 0, entities: [outside] }],
      [30, { frame: 30, entities: [inside] }],
    ]);
    expect(rules(lint({ probes }))).not.toContain("out-of-bounds");
  });
});

describe("text-overflow", () => {
  it("reports text wider than its box", () => {
    const probes = new Map([[0, { frame: 0, entities: [entity({ overflowX: 189 })] }]]);
    expect(rules(lint({ probes }))).toEqual(["text-overflow"]);
  });

  it("ignores a couple of pixels of inline slack", () => {
    const probes = new Map([[0, { frame: 0, entities: [entity({ overflowY: 2 })] }]]);
    expect(rules(lint({ probes }))).toEqual([]);
  });

  it("only judges text, since an image in a box is not a layout defect", () => {
    const box = entity({ tag: "w-el", text: "", overflowY: 40 });
    const probes = new Map([[0, { frame: 0, entities: [box] }]]);
    expect(rules(lint({ probes }))).toEqual([]);
  });
});

describe("dead-beat", () => {
  const still = (frame: number): [number, FrameProbe] => [
    frame,
    { frame, entities: [entity({ signature: "unchanged" })] },
  ];

  it("reports a long beat where nothing changes", () => {
    const findings = lint({
      info: info({ beats: [beat("Frozen", 0, 60)] }),
      probes: new Map([still(0), still(30), still(59)]),
      beatFrames: new Map([["Frozen", [0, 30, 59]]]),
    });
    expect(rules(findings)).toEqual(["dead-beat"]);
  });

  it("stays quiet when something moves", () => {
    const findings = lint({
      info: info({ beats: [beat("Title", 0, 60)] }),
      probes: new Map([
        still(0),
        [30, { frame: 30, entities: [entity({ signature: "moved" })] }],
      ]),
      beatFrames: new Map([["Title", [0, 30]]]),
    });
    expect(rules(findings)).toEqual([]);
  });

  it("leaves short beats alone, since a held cut is a choice", () => {
    const findings = lint({
      info: info({ beats: [beat("Flash", 0, 8)] }),
      probes: new Map([still(0), still(7)]),
      beatFrames: new Map([["Flash", [0, 7]]]),
    });
    expect(rules(findings)).toEqual([]);
  });
});

describe("low-contrast", () => {
  it("reports text that is too close in tone to its backdrop", () => {
    const faint = entity({ color: "rgb(20, 22, 31)", backdrop: "rgb(11, 13, 20)", fontSize: 20 });
    const probes = new Map([[0, { frame: 0, entities: [faint] }]]);
    expect(rules(lint({ probes }))).toEqual(["low-contrast"]);
  });

  it("does not judge a frame mid-fade, where faint is the point", () => {
    const fading = entity({
      color: "rgb(20, 22, 31)",
      backdrop: "rgb(11, 13, 20)",
      opacity: 0.4,
    });
    const probes = new Map([[0, { frame: 0, entities: [fading] }]]);
    expect(rules(lint({ probes }))).toEqual([]);
  });

  it("holds large text to the lower bar", () => {
    // 3.4:1: under the body floor of 4.5, over the large-text floor of 3.
    const grey = entity({ color: "rgb(255,255,255)", backdrop: "rgb(140,140,140)" });
    const probes = new Map([[0, { frame: 0, entities: [grey] }]]);
    expect(rules(lint({ probes }))).toEqual([]);
  });
});

describe("contrastRatio", () => {
  it("gives the full range for black on white", () => {
    expect(contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBeCloseTo(21, 5);
  });

  it("gives 1 for a colour against itself, whichever order", () => {
    expect(contrastRatio("rgb(40, 40, 40)", "rgb(40, 40, 40)")).toBeCloseTo(1, 5);
    expect(contrastRatio("rgb(255, 255, 255)", "rgb(0, 0, 0)")).toBeCloseTo(21, 5);
  });

  it("returns null for something it cannot parse", () => {
    expect(contrastRatio("rebeccapurple", "rgb(0,0,0)")).toBeNull();
  });
});

describe("scene facts", () => {
  it("passes through conflicts, missing assets, and unloaded faces", () => {
    const findings = lint({
      facts: facts({
        tweenConflicts: [
          { key: "w-text", tag: "w-text", text: "Hi", property: "opacity", sources: ["a", "b"] },
        ],
        pendingFaces: ["Inter"],
        unresolvedStacks: ["Nope Sans"],
        foreignAssets: ["https://cdn.example.com/logo.png"],
      }),
      missingAssets: ["/logo.png"],
      pageErrors: ["boom", "boom"],
    });

    expect(rules(findings).sort()).toEqual([
      "font-pending",
      "font-unresolved",
      "foreign-asset",
      "missing-asset",
      "page-error",
      "tween-conflict",
    ]);
  });

  it("sorts errors ahead of warnings", () => {
    const findings = lint({
      facts: facts({ pendingFaces: ["Inter"], unresolvedStacks: ["Nope Sans"] }),
    });
    expect(findings.map((finding) => finding.severity)).toEqual(["error", "warn"]);
  });
});

describe("frame selection", () => {
  it("samples the start, middle, and end of every top-level beat", () => {
    const picks = autoFrames(info({ duration: 120, beats: [beat("Title", 0, 60), beat("Outro", 60, 120)] }));
    expect(picks.map((pick) => pick.frame)).toEqual([0, 30, 59, 60, 90, 119]);
  });

  it("labels each frame with the beat covering it", () => {
    const picks = autoFrames(info({ duration: 60, beats: [beat("Title", 0, 60)] }));
    expect(picks.every((pick) => pick.label === "Title")).toBe(true);
  });

  it("prefers the innermost beat when they nest", () => {
    const beats = [beat("Act", 0, 60), beat("Line", 20, 40, 1)];
    const picks = autoFrames(info({ duration: 60, beats }));
    expect(picks.find((pick) => pick.frame === 30)?.label).toBe("Line");
  });

  it("spreads evenly when the scene has no labelled beats", () => {
    const picks = autoFrames(info({ duration: 100 }));
    expect(picks.length).toBeGreaterThan(4);
    expect(picks[0]?.frame).toBe(0);
    expect(picks.at(-1)?.frame).toBe(99);
  });

  it("parses and clamps an explicit list", () => {
    const picks = parseFrames("60, 0, 9999, 60", info({ duration: 120 }));
    expect(picks.map((pick) => pick.frame)).toEqual([0, 60, 119]);
  });

  it("rejects a list it cannot read", () => {
    expect(() => parseFrames("first,second", info())).toThrow(/not a number/);
  });

  it("samples inside a beat without running past its end", () => {
    const frames = beatSamples(beat("Title", 10, 50), info({ duration: 120 }));
    expect(frames[0]).toBe(10);
    expect(frames.at(-1)).toBe(49);
  });
});
