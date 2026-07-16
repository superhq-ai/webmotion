import { num } from "./parse.js";

/** One labelled <w-sequence>, resolved to absolute composition frames. */
export interface TimelineSection {
  label: string;
  from: number;
  to: number;
}

const INERT = new Set(["W-DEFS", "W-ANIMATION", "W-ANIMATE", "W-AUDIO", "W-FOR", "W-DATA", "W-IF"]);

/**
 * Collect every `<w-sequence label>` under `root` with sequence timing applied,
 * mirroring the frame walk the way collectAudioClips does. Player UIs read
 * these as chapter marks, so the scrub bar's labels come from the scene's own
 * structure instead of a parallel chapter list.
 */
export function collectSections(root: Element, durationInFrames: number): TimelineSection[] {
  const out: TimelineSection[] = [];
  walk(root, 0, durationInFrames, out);
  return out.sort((a, b) => a.from - b.from);
}

function walk(container: Element, base: number, windowEnd: number, out: TimelineSection[]): void {
  for (const child of Array.from(container.children)) {
    if (INERT.has(child.tagName)) continue;

    if (child.tagName === "W-SEQUENCE") {
      const from = base + num(child.getAttribute("from"), 0);
      const durAttr = child.getAttribute("duration");
      const to = durAttr == null ? windowEnd : Math.min(windowEnd, from + num(durAttr, 0));
      const label = child.getAttribute("label");
      if (label && to > from) out.push({ label, from, to });
      walk(child, from, to, out);
      continue;
    }

    walk(child, base, windowEnd, out);
  }
}
