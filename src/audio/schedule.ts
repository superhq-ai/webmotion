import { num } from "../elements/parse.js";
import { gatherTweens } from "../elements/registry.js";
import { readTween, sampleTween } from "../elements/tween.js";

// One <w-audio> resolved against the time tree: where it starts on the global
// timeline, how long it plays, and its gain envelope. Frames throughout; the
// engine converts to sample time. See docs/AUDIO.md.
export interface AudioClip {
  /** Resolved source URL. */
  src: string;
  /** Global frame at which playback begins. */
  startFrame: number;
  /**
   * Global frame at which playback must stop, from the duration attribute and
   * every enclosing sequence window. Infinity means "natural clip length,
   * bounded by the composition".
   */
  endFrame: number;
  /** Seconds into the source file to start reading from (offset attr, frames). */
  offsetFrames: number;
  /** Base gain. */
  gain: number;
  /**
   * Per-frame gain envelope from `gain` tweens, in global frames, or null when
   * the gain is constant. Points are deduplicated; consumers interpolate
   * linearly between them.
   */
  envelope: Array<{ frame: number; value: number }> | null;
}

const INERT = new Set(["W-DEFS", "W-ANIMATION", "W-ANIMATE", "W-FOR", "W-DATA", "W-IF"]);

// Collect every <w-audio> under `root` with sequence timing applied, mirroring
// the frame walk: a <w-sequence from duration> shifts the start and bounds the
// audible window of everything inside it.
export function collectAudioClips(
  root: Element,
  fps: number,
  durationInFrames: number,
): AudioClip[] {
  const out: AudioClip[] = [];
  walk(root, 0, durationInFrames, out, fps, durationInFrames);
  return out;
}

function walk(
  container: Element,
  base: number,
  windowEnd: number,
  out: AudioClip[],
  fps: number,
  compEnd: number,
): void {
  for (const child of Array.from(container.children)) {
    if (INERT.has(child.tagName)) continue;

    if (child.tagName === "W-SEQUENCE") {
      const from = num(child.getAttribute("from"), 0);
      const durAttr = child.getAttribute("duration");
      const end =
        durAttr == null ? windowEnd : Math.min(windowEnd, base + from + num(durAttr, 0));
      walk(child, base + from, end, out, fps, compEnd);
      continue;
    }

    if (child.tagName === "W-AUDIO") {
      const clip = readClip(child, base, windowEnd, compEnd);
      if (clip) out.push(clip);
      continue;
    }

    walk(child, base, windowEnd, out, fps, compEnd);
  }
}

function readClip(
  el: Element,
  base: number,
  windowEnd: number,
  compEnd: number,
): AudioClip | null {
  const src = el.getAttribute("src");
  if (!src) return null;

  const startFrame = base + num(el.getAttribute("from"), 0);
  const durAttr = el.getAttribute("duration");
  let endFrame = Math.min(windowEnd, compEnd);
  if (durAttr != null) endFrame = Math.min(endFrame, startFrame + num(durAttr, 0));
  if (endFrame <= startFrame) return null;

  return {
    src,
    startFrame,
    endFrame,
    offsetFrames: num(el.getAttribute("offset"), 0),
    gain: num(el.getAttribute("gain"), 1),
    envelope: readEnvelope(el, base, startFrame, endFrame),
  };
}

// Sample `gain` tweens per frame across the clip's audible window. Tween
// start/end are local to the nearest sequence, i.e. relative to `base`, the
// same convention visuals use.
function readEnvelope(
  el: Element,
  base: number,
  startFrame: number,
  endFrame: number,
): Array<{ frame: number; value: number }> | null {
  if (!(el instanceof HTMLElement)) return null;
  const gainTweens = gatherTweens(el)
    .map((tween) => readTween(tween))
    .filter((t) => t.property === "gain");
  if (gainTweens.length === 0) return null;

  const points: Array<{ frame: number; value: number }> = [];
  let last = Number.NaN;
  for (let f = startFrame; f <= endFrame; f++) {
    let value = 1;
    for (const t of gainTweens) value = sampleTween(t, f - base);
    if (value !== last) {
      points.push({ frame: f, value });
      last = value;
    }
  }
  // A flat envelope adds nothing over the base gain.
  return points.length > 1 ? points : null;
}
