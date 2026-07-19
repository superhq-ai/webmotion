// The lint rules. Every rule reads facts already gathered from the page and
// returns findings; none of them touch the browser. That split keeps rules
// cheap to add and makes them testable against recorded probes.
import type { Beat, CompositionInfo, EntitySnapshot, FrameProbe, SceneFacts } from "./browser/api.js";

export type Severity = "error" | "warn";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  /** Frame the problem is clearest at, when it is frame-specific. */
  frame?: number;
  beat?: string;
}

export interface LintInput {
  info: CompositionInfo;
  facts: SceneFacts;
  /** Probes at the frames the caller sampled, keyed by frame. */
  probes: Map<number, FrameProbe>;
  /** Frames sampled inside each beat, in order. */
  beatFrames: Map<string, number[]>;
  /** Errors the page raised. */
  pageErrors: string[];
  /** Asset paths the scene requested that do not exist. */
  missingAssets: string[];
}

const VISIBLE_OPACITY = 0.02;
/** Below this, text and its backdrop are too close to read comfortably. */
const MIN_CONTRAST_BODY = 4.5;
const MIN_CONTRAST_LARGE = 3;
/** Font size at which the lower contrast bar applies, per WCAG. */
const LARGE_TEXT_PX = 24;

function isVisible(entity: EntitySnapshot): boolean {
  // A collapsed box paints nothing even when the browser says it is visible,
  // which is how a sequence outside its window reads.
  return (
    entity.displayed &&
    entity.opacity > VISIBLE_OPACITY &&
    entity.box.width > 0 &&
    entity.box.height > 0
  );
}

function intersectsFrame(entity: EntitySnapshot, info: CompositionInfo): boolean {
  const { x, y, width, height } = entity.box;
  return x < info.width && y < info.height && x + width > 0 && y + height > 0;
}

function describe(entity: EntitySnapshot): string {
  return entity.text ? `${entity.tag} "${entity.text}"` : entity.tag;
}

function parseRgb(color: string): [number, number, number] | null {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
  if (!match) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number(part ?? NaN));
  if (r === undefined || g === undefined || b === undefined) return null;
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  return [r, g, b];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return null;
  const [light, dark] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Nothing is on screen: a hole in the cut, or a beat that renders empty. */
function blankFrames(input: LintInput): Finding[] {
  const findings: Finding[] = [];
  for (const [frame, probe] of input.probes) {
    const visible = probe.entities.filter(
      (entity) => isVisible(entity) && intersectsFrame(entity, input.info),
    );
    if (visible.length > 0) continue;
    findings.push({
      rule: "blank-frame",
      severity: "warn",
      frame,
      message: `frame ${frame} renders nothing but the background`,
    });
  }
  return findings;
}

/** A labelled beat whose every sampled frame is identical: no motion in it. */
function deadBeats(input: LintInput): Finding[] {
  const findings: Finding[] = [];

  for (const beat of input.info.beats) {
    const frames = input.beatFrames.get(beat.label);
    if (!frames || frames.length < 2) continue;
    // Short beats are cuts, not movements; holding still is a valid choice.
    if (beat.to - beat.from < 10) continue;

    const signatures = frames.map((frame) => {
      const probe = input.probes.get(frame);
      if (!probe) return null;
      return probe.entities
        .filter((entity) => isVisible(entity))
        .map((entity) => `${entity.key}=${entity.signature}`)
        .join("\n");
    });
    if (signatures.some((signature) => signature === null)) continue;

    const first = signatures[0];
    if (!signatures.every((signature) => signature === first)) continue;

    findings.push({
      rule: "dead-beat",
      severity: "warn",
      beat: beat.label,
      frame: beat.from,
      message:
        `beat "${beat.label}" (frames ${beat.from}-${beat.to}) holds completely still for ` +
        `${beat.to - beat.from} frames`,
    });
  }
  return findings;
}

/**
 * An entity that is never fully inside the frame. Partly outside is normal for
 * a slide-in, so a finding needs the entity to be clipped at every frame it is
 * visible at.
 */
function outOfBounds(input: LintInput): Finding[] {
  interface Track {
    entity: EntitySnapshot;
    frames: number[];
    everInside: boolean;
    everVisible: boolean;
  }

  const tracks = new Map<string, Track>();
  for (const [frame, probe] of input.probes) {
    for (const entity of probe.entities) {
      const track = tracks.get(entity.key) ?? {
        entity,
        frames: [],
        everInside: false,
        everVisible: false,
      };
      if (isVisible(entity)) {
        track.everVisible = true;
        const { x, y, width, height } = entity.box;
        const inside =
          x >= -1 && y >= -1 && x + width <= input.info.width + 1 && y + height <= input.info.height + 1;
        if (inside) track.everInside = true;
        else track.frames.push(frame);
        track.entity = entity;
      }
      tracks.set(entity.key, track);
    }
  }

  const findings: Finding[] = [];
  for (const track of tracks.values()) {
    if (!track.everVisible || track.everInside || track.frames.length === 0) continue;
    const off = intersectsFrame(track.entity, input.info) ? "extends past" : "sits entirely outside";
    findings.push({
      rule: "out-of-bounds",
      severity: "error",
      frame: track.frames[0],
      message:
        `${describe(track.entity)} ${off} the ${input.info.width}x${input.info.height} frame ` +
        `at every frame it is visible (box ${track.entity.box.x},${track.entity.box.y} ` +
        `${track.entity.box.width}x${track.entity.box.height})`,
    });
  }
  return findings;
}

/** Text wider or taller than the box it was given, so it clips on export. */
function textOverflow(input: LintInput): Finding[] {
  const worst = new Map<string, { entity: EntitySnapshot; frame: number }>();

  for (const [frame, probe] of input.probes) {
    for (const entity of probe.entities) {
      // Only text, and only past a couple of pixels: inline layout leaves
      // sub-pixel slack under images and that is not a defect.
      if (entity.tag !== "w-text" || !isVisible(entity)) continue;
      if (entity.overflowX <= 2 && entity.overflowY <= 2) continue;
      const current = worst.get(entity.key);
      const size = entity.overflowX + entity.overflowY;
      if (!current || size > current.entity.overflowX + current.entity.overflowY) {
        worst.set(entity.key, { entity, frame });
      }
    }
  }

  return Array.from(worst.values()).map(({ entity, frame }) => ({
    rule: "text-overflow",
    severity: "error" as const,
    frame,
    message:
      `${describe(entity)} overflows its ${entity.box.width}x${entity.box.height} box by ` +
      [entity.overflowX > 2 ? `${entity.overflowX}px horizontally` : null,
       entity.overflowY > 2 ? `${entity.overflowY}px vertically` : null]
        .filter(Boolean)
        .join(" and "),
  }));
}

/** Text that is close enough in tone to its backdrop to be hard to read. */
function lowContrast(input: LintInput): Finding[] {
  const seen = new Map<string, Finding>();

  for (const [frame, probe] of input.probes) {
    for (const entity of probe.entities) {
      // Only judge text that is meant to be fully visible; mid-fade frames are
      // supposed to be faint.
      if (!isVisible(entity) || entity.opacity < 0.9) continue;
      if (entity.color === null || entity.backdrop === null) continue;

      const ratio = contrastRatio(entity.color, entity.backdrop);
      if (ratio === null) continue;
      const floor = entity.fontSize >= LARGE_TEXT_PX ? MIN_CONTRAST_LARGE : MIN_CONTRAST_BODY;
      if (ratio >= floor) continue;

      if (seen.has(entity.key)) continue;
      seen.set(entity.key, {
        rule: "low-contrast",
        severity: "warn",
        frame,
        message:
          `${describe(entity)} has a contrast ratio of ${ratio.toFixed(2)}:1 against its ` +
          `backdrop (${entity.color} on ${entity.backdrop}), below the ${floor}:1 floor`,
      });
    }
  }
  return Array.from(seen.values());
}

function sceneFacts(input: LintInput): Finding[] {
  const findings: Finding[] = [];

  for (const conflict of input.facts.tweenConflicts) {
    findings.push({
      rule: "tween-conflict",
      severity: "error",
      message:
        `${conflict.tag}${conflict.text ? ` "${conflict.text}"` : ""} has ${conflict.sources.length} ` +
        `tweens on "${conflict.property}" (${conflict.sources.join(", ")}). They fight across the ` +
        `whole timeline; split entrance and exit across nesting levels instead`,
    });
  }

  for (const family of input.facts.pendingFaces) {
    findings.push({
      rule: "font-pending",
      severity: "error",
      message:
        `the @font-face for "${family}" never finished loading, so frames render in a fallback. ` +
        `Wait on document.fonts.ready before exporting`,
    });
  }

  for (const stack of input.facts.unresolvedStacks) {
    findings.push({
      rule: "font-unresolved",
      severity: "warn",
      message:
        `nothing in the font stack "${stack}" resolves, so text renders in the browser default. ` +
        `Add a generic fallback such as sans-serif, or load the face`,
    });
  }

  for (const asset of input.facts.foreignAssets) {
    findings.push({
      rule: "foreign-asset",
      severity: "error",
      message: `${asset} is cross-origin; the export rasterizer cannot inline it and it will render as a hole`,
    });
  }

  if (input.facts.fontStatus !== "loaded") {
    findings.push({
      rule: "fonts-pending",
      severity: "warn",
      message: `document.fonts.status is "${input.facts.fontStatus}" after setup; the first frames may export unstyled`,
    });
  }

  for (const asset of input.missingAssets) {
    findings.push({
      rule: "missing-asset",
      severity: "error",
      message: `${asset} does not exist; it will render as a hole in preview and export`,
    });
  }

  for (const error of new Set(input.pageErrors)) {
    findings.push({ rule: "page-error", severity: "error", message: `the page reported: ${error}` });
  }

  return findings;
}

const RULES = [blankFrames, deadBeats, outOfBounds, textOverflow, lowContrast, sceneFacts];

export function runRules(input: LintInput): Finding[] {
  const order: Record<Severity, number> = { error: 0, warn: 1 };
  return RULES.flatMap((rule) => rule(input)).sort(
    (a, b) => order[a.severity] - order[b.severity] || (a.frame ?? 0) - (b.frame ?? 0),
  );
}

export type { Beat };
