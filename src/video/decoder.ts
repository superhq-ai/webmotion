// VideoSource turns a source time into an exact decoded frame. It owns one
// file's samples and a WebCodecs VideoDecoder, and decodes deterministically:
// the same time always yields the same frame, so preview and export agree.
//
// WebCodecs can only move forward through a coded stream, so a seek anchors on
// the keyframe at or before the target and decodes forward to it; sequential
// playback (the export case) just keeps feeding the next sample. Decoded frames
// are held in a small ring and closed promptly, because a VideoDecoder stalls
// if too many outputs stay open.
import { demuxVideo, type DemuxedSample, type VideoTrackInfo } from "./mp4-demux.js";

export interface SourceTiming {
  /** Sequence-local frame where playback begins. */
  from: number;
  /** Seconds into the source to start from. */
  trim: number;
  /** Playback rate multiplier. */
  speed: number;
  /** Wrap at the source end instead of holding the last frame. */
  loop: boolean;
  /** Source duration in seconds. */
  duration: number;
}

// The source time for a composition frame. Pure so it can be unit tested, in
// the spirit of clipTimeAt for <w-model>: `trim` offsets the in point, `speed`
// scales playback, `loop` wraps on the duration, otherwise it clamps just under
// the end so the final frame stays reachable.
export function sourceTimeAt(frame: number, fps: number, t: SourceTiming): number {
  const local = Math.max(0, (frame - t.from) / fps) * t.speed;
  const raw = t.trim + local;
  if (t.duration <= 0) return Math.max(0, t.trim);
  if (t.loop) return ((raw % t.duration) + t.duration) % t.duration;
  return Math.min(raw, Math.max(0, t.duration - 1e-4));
}

// Greatest index in a sorted ascending array whose value is <= x, or 0.
function floorIndex(values: number[], x: number): number {
  let lo = 0;
  let hi = values.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= x) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

// How many decoded frames to keep open at once. Small, because the decoder's
// output pool is limited; large enough to serve a short backward scrub.
const RING = 8;

// How far past the target to feed while waiting for its frame, covering the
// codec's presentation reorder depth (B-frames) before giving up to a flush.
const REORDER = 16;

export class VideoSource {
  readonly width: number;
  readonly height: number;
  readonly durationSec: number;

  private readonly samples: DemuxedSample[];
  // Presentation timestamps (micros) in decode order, and the same sorted for
  // resolving a time to its target sample.
  private readonly keyframeIndices: number[];
  private readonly sortedPts: number[];
  private readonly sortedIdx: number[];

  private decoder: VideoDecoder;
  private readonly config: VideoDecoderConfig;
  private readonly outputs = new Map<number, VideoFrame>();
  private fedIndex = -1;
  private decodeError: unknown = null;

  private constructor(track: VideoTrackInfo, description: Uint8Array | undefined, samples: DemuxedSample[]) {
    this.width = track.width;
    this.height = track.height;
    this.durationSec = track.durationSec;
    this.samples = samples;

    this.keyframeIndices = [];
    for (let i = 0; i < samples.length; i++) if (samples[i]!.isKeyframe) this.keyframeIndices.push(i);
    // The first sample must be decodable from nothing; if the file marks no
    // early keyframe, treat sample 0 as the anchor.
    if (this.keyframeIndices[0] !== 0) this.keyframeIndices.unshift(0);

    const withIdx = samples.map((s, i) => ({ ts: s.timestampMicros, i }));
    withIdx.sort((a, b) => a.ts - b.ts);
    this.sortedPts = withIdx.map((e) => e.ts);
    this.sortedIdx = withIdx.map((e) => e.i);

    this.config = {
      codec: track.codec,
      codedWidth: track.width,
      codedHeight: track.height,
      ...(description ? { description } : {}),
    };
    this.decoder = this.makeDecoder();
  }

  /** Fetch, demux, and configure a decoder for `url`. Resolves once the first
   *  frame is decodable, so an export can gate on it. */
  static async create(url: string): Promise<VideoSource> {
    const { track, description, samples } = await demuxVideo(url);
    const support = await VideoDecoder.isConfigSupported({
      codec: track.codec,
      codedWidth: track.width,
      codedHeight: track.height,
      ...(description ? { description } : {}),
    });
    if (!support.supported) {
      throw new Error(`<w-video>: no decoder for ${track.codec} in this browser`);
    }
    return new VideoSource(track, description, samples);
  }

  private makeDecoder(): VideoDecoder {
    const decoder = new VideoDecoder({
      output: (frame) => this.onFrame(frame),
      error: (e) => {
        this.decodeError = e;
      },
    });
    decoder.configure(this.config);
    return decoder;
  }

  private onFrame(frame: VideoFrame): void {
    this.outputs.set(frame.timestamp, frame);
    // Close the oldest frames once past the ring, freeing the decoder's pool.
    while (this.outputs.size > RING) {
      const oldest = this.outputs.keys().next().value as number;
      const stale = this.outputs.get(oldest);
      this.outputs.delete(oldest);
      stale?.close();
    }
  }

  /** The presentation timestamp (micros) of the sample shown at `tSec`. Stable
   *  across calls, so the element can skip redraw when it does not change. */
  targetTimestamp(tSec: number): number {
    const idx = floorIndex(this.sortedPts, Math.round(tSec * 1e6));
    return this.samples[this.sortedIdx[idx]!]!.timestampMicros;
  }

  private targetDecodeIndex(tSec: number): { ts: number; di: number } {
    const idx = floorIndex(this.sortedPts, Math.round(tSec * 1e6));
    const di = this.sortedIdx[idx]!;
    return { ts: this.samples[di]!.timestampMicros, di };
  }

  private gopStart(di: number): number {
    return this.keyframeIndices[floorIndex(this.keyframeIndices, di)]!;
  }

  private feed(index: number): void {
    const s = this.samples[index]!;
    this.decoder.decode(
      new EncodedVideoChunk({
        type: s.isKeyframe ? "key" : "delta",
        timestamp: s.timestampMicros,
        duration: s.durationMicros,
        data: s.data,
      }),
    );
  }

  private resetTo(gop: number): void {
    this.decoder.reset();
    this.decoder.configure(this.config);
    for (const frame of this.outputs.values()) frame.close();
    this.outputs.clear();
    this.fedIndex = gop - 1;
  }

  /** The decoded frame shown at `tSec`. Owned by the source: draw it before the
   *  next call, which may recycle it. Null only on a decode error. */
  async frameAtTime(tSec: number): Promise<VideoFrame | null> {
    if (this.decodeError) throw asError(this.decodeError);
    const { ts, di } = this.targetDecodeIndex(tSec);
    const cached = this.outputs.get(ts);
    if (cached) return cached;

    const gop = this.gopStart(di);
    // Reset only when the target is behind the decode cursor or a keyframe gap
    // sits between them; otherwise keep streaming forward. A flush would force
    // outputs but leaves the decoder unable to continue with delta frames, so
    // instead we feed forward and let the output callback deliver frames,
    // flushing only to drain the tail at end of stream.
    if (di <= this.fedIndex || gop > this.fedIndex + 1) this.resetTo(gop);

    const n = this.samples.length;
    // Bounded lookahead past the target to cover the codec's reorder depth.
    const feedLimit = Math.min(n - 1, di + REORDER);
    let guard = 0;
    while (!this.outputs.has(ts)) {
      if (this.fedIndex < feedLimit) {
        this.feed(this.fedIndex + 1);
        this.fedIndex += 1;
      } else if (this.fedIndex >= n - 1) {
        // Fed the whole stream; drain any frames the decoder still holds.
        await this.decoder.flush();
        break;
      } else {
        // Fed the lookahead window without the frame appearing (reorder deeper
        // than expected); force it out. Rare; the next request may reset.
        await this.decoder.flush();
        break;
      }
      // Yield so the decoder's output callback runs and fills `outputs`.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.decodeError) throw asError(this.decodeError);
      if (++guard > n + REORDER + 8) break;
    }
    return this.outputs.get(ts) ?? null;
  }

  close(): void {
    for (const frame of this.outputs.values()) frame.close();
    this.outputs.clear();
    if (this.decoder.state !== "closed") this.decoder.close();
  }
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
