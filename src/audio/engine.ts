import type { AudioClip } from "./schedule.js";

// Decoded buffers are cached per URL; decodeAudioData is deterministic for a
// given file, and clips are rescheduled on every play/seek/export.
const bufferCache = new Map<string, Promise<ArrayBuffer>>();

function fetchAudio(url: string): Promise<ArrayBuffer> {
  let hit = bufferCache.get(url);
  if (!hit) {
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`audio fetch ${url} status ${r.status}`);
      return r.arrayBuffer();
    });
    bufferCache.set(url, hit);
    hit.catch(() => {
      if (bufferCache.get(url) === hit) bufferCache.delete(url);
    });
  }
  // Callers decode per-context, so hand out a copy of the bytes.
  return hit.then((buf) => buf.slice(0));
}

// Decoded buffers per context, so a looping preview does not re-decode on
// every wrap. Offline contexts are single-use and fall out with their render.
const decodedCache = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>();

export async function loadClipBuffers(
  ctx: BaseAudioContext,
  clips: AudioClip[],
): Promise<Map<string, AudioBuffer>> {
  let perCtx = decodedCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    decodedCache.set(ctx, perCtx);
  }

  const out = new Map<string, AudioBuffer>();
  const srcs = [...new Set(clips.map((c) => c.src))];
  await Promise.all(
    srcs.map(async (src) => {
      try {
        let decoded = perCtx.get(src);
        if (!decoded) {
          const url = new URL(src, typeof document !== "undefined" ? document.baseURI : src).href;
          decoded = fetchAudio(url).then((bytes) => ctx.decodeAudioData(bytes));
          perCtx.set(src, decoded);
          decoded.catch(() => {
            if (perCtx.get(src) === decoded) perCtx.delete(src);
          });
        }
        out.set(src, await decoded);
      } catch (e) {
        console.warn("[webmotion] failed to load audio", src, e);
      }
    }),
  );
  return out;
}

export interface ScheduledAudio {
  stop(): void;
}

/**
 * Schedule clips into an audio context, live or offline. `fromFrame` is the
 * timeline position that corresponds to `contextStartTime` on the context's
 * clock; clips that ended before it are skipped, clips already underway start
 * partway in. The gain envelope is applied as linear ramps, so preview and
 * offline export produce the same mix.
 */
export function scheduleClips(
  ctx: BaseAudioContext,
  clips: AudioClip[],
  buffers: Map<string, AudioBuffer>,
  fps: number,
  fromFrame: number,
  contextStartTime: number,
): ScheduledAudio {
  const sources: AudioBufferSourceNode[] = [];

  for (const clip of clips) {
    const buffer = buffers.get(clip.src);
    if (!buffer) continue;

    // How far into the clip's own playback the timeline position lands.
    const intoClipFrames = Math.max(0, fromFrame - clip.startFrame);
    const offsetSec = (clip.offsetFrames + intoClipFrames) / fps;
    if (offsetSec >= buffer.duration) continue;

    // Remaining audible span from `fromFrame`, bounded by window and buffer.
    const clipEndSec = Math.min(
      (clip.endFrame - clip.startFrame - intoClipFrames) / fps,
      buffer.duration - offsetSec,
    );
    if (clipEndSec <= 0 || clip.endFrame <= fromFrame) continue;

    const when = contextStartTime + Math.max(0, clip.startFrame - fromFrame) / fps;

    const gainNode = ctx.createGain();
    if (clip.envelope) {
      // Envelope frames are global; map them onto the context clock relative
      // to `fromFrame`. Points at or before the start seed the initial value.
      const param = gainNode.gain;
      let seeded = false;
      for (const point of clip.envelope) {
        const t = contextStartTime + (point.frame - fromFrame) / fps;
        if (t <= contextStartTime) {
          param.setValueAtTime(point.value, contextStartTime);
          seeded = true;
        } else {
          if (!seeded) {
            param.setValueAtTime(clip.envelope[0]?.value ?? clip.gain, contextStartTime);
            seeded = true;
          }
          param.linearRampToValueAtTime(point.value, t);
        }
      }
    } else {
      gainNode.gain.value = clip.gain;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(when, offsetSec, clipEndSec);
    sources.push(source);
  }

  return {
    stop() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already stopped or never started; nothing to do.
        }
        source.disconnect();
      }
    },
  };
}
