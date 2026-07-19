// Which frames to look at. Sampling every frame is wasteful and sampling
// blindly misses the moments that matter, so the default derives frames from
// the scene's own structure: the beats the author labelled.
import type { Beat, CompositionInfo } from "./browser/api.js";

export interface FramePick {
  frame: number;
  /** The innermost labelled beat covering this frame, when there is one. */
  label: string | null;
}

function labelAt(beats: Beat[], frame: number): string | null {
  let best: Beat | null = null;
  for (const beat of beats) {
    if (frame < beat.from || frame >= beat.to) continue;
    if (best === null || beat.depth > best.depth) best = beat;
  }
  return best?.label ?? null;
}

function clamp(frame: number, duration: number): number {
  return Math.max(0, Math.min(duration - 1, Math.round(frame)));
}

/**
 * Beat boundaries plus a midpoint each, bookended by the first and last frame.
 * A beat's opening frame catches an entrance that never fires, its midpoint
 * catches the settled composition, its last frame catches an exit that lands
 * late.
 */
export function autoFrames(info: CompositionInfo): FramePick[] {
  const picked = new Set<number>([0, info.duration - 1]);

  const beats = info.beats.filter((beat) => beat.depth === 0);
  for (const beat of beats.length > 0 ? beats : info.beats) {
    picked.add(clamp(beat.from, info.duration));
    picked.add(clamp((beat.from + beat.to) / 2, info.duration));
    picked.add(clamp(beat.to - 1, info.duration));
  }

  // No labelled structure to go on: fall back to an even spread.
  if (picked.size < 4) {
    const count = Math.min(8, info.duration);
    for (let i = 0; i < count; i++) {
      picked.add(clamp((i * (info.duration - 1)) / Math.max(1, count - 1), info.duration));
    }
  }

  return Array.from(picked)
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, label: labelAt(info.beats, frame) }));
}

/** Explicit frame list, as passed to --frames. */
export function parseFrames(spec: string, info: CompositionInfo): FramePick[] {
  const frames = spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const value = Number(part);
      if (!Number.isFinite(value)) throw new Error(`--frames: "${part}" is not a number`);
      return clamp(value, info.duration);
    });
  if (frames.length === 0) throw new Error("--frames was empty");

  return Array.from(new Set(frames))
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, label: labelAt(info.beats, frame) }));
}

export function resolveFrames(spec: string | undefined, info: CompositionInfo): FramePick[] {
  return spec === undefined || spec === "auto" ? autoFrames(info) : parseFrames(spec, info);
}

/**
 * Frames inside one beat, for judging whether anything actually happens in it.
 * Sampled rather than exhaustive: motion that is invisible across five evenly
 * spaced frames is not motion anyone will see.
 */
export function beatSamples(beat: Beat, info: CompositionInfo, count = 5): number[] {
  const last = Math.min(beat.to, info.duration) - 1;
  if (last <= beat.from) return [clamp(beat.from, info.duration)];
  const span = last - beat.from;
  const frames = new Set<number>();
  for (let i = 0; i < count; i++) {
    frames.add(clamp(beat.from + (span * i) / (count - 1), info.duration));
  }
  return Array.from(frames).sort((a, b) => a - b);
}
