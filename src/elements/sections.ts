import { num } from "./parse.js";

/** One labelled <w-sequence>, resolved to absolute composition frames. */
export interface TimelineSection {
  label: string;
  from: number;
  to: number;
  /**
   * Count of labelled ancestor sequences. Depth 0 sections are top-level
   * chapters; deeper ones are sub-sections of the labelled sequence they
   * sit inside. Unlabelled wrapper sequences do not add depth.
   */
  depth: number;
}

const INERT = new Set(["W-DEFS", "W-ANIMATION", "W-ANIMATE", "W-AUDIO", "W-FOR", "W-DATA", "W-IF"]);

/**
 * Collect every `<w-sequence label>` under `root` with sequence timing
 * applied, mirroring the frame walk the way collectAudioClips does. Player
 * UIs read these as timeline marks: depth 0 sections become the chapter
 * rail, deeper ones become overlay lanes. The scrub bar is a projection of
 * the scene's own structure; there is no separate track list to maintain.
 */
export function collectSections(root: Element, durationInFrames: number): TimelineSection[] {
  const out: TimelineSection[] = [];
  walk(root, 0, durationInFrames, 0, out);
  return out.sort((a, b) => a.from - b.from || b.to - a.to);
}

function walk(
  container: Element,
  base: number,
  windowEnd: number,
  depth: number,
  out: TimelineSection[],
): void {
  for (const child of Array.from(container.children)) {
    if (INERT.has(child.tagName)) continue;

    if (child.tagName === "W-SEQUENCE") {
      const from = base + num(child.getAttribute("from"), 0);
      const durAttr = child.getAttribute("duration");
      const to = durAttr == null ? windowEnd : Math.min(windowEnd, from + num(durAttr, 0));
      const label = child.getAttribute("label");
      const labelled = label != null && label !== "" && to > from;
      if (labelled) out.push({ label, from, to, depth });
      walk(child, from, to, depth + (labelled ? 1 : 0), out);
      continue;
    }

    walk(child, base, windowEnd, depth, out);
  }
}
