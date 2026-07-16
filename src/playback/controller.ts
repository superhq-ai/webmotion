import type { AudioClip } from "../audio/schedule.js";
import { loadClipBuffers, scheduleClips, type ScheduledAudio } from "../audio/engine.js";

/**
 * What the controller drives: frame timing plus a way to show one frame.
 * `renderFrame` may be async (canvas backends rasterize before presenting);
 * the controller never overlaps two renders.
 */
export interface PlaybackMedia {
  fps: number;
  durationInFrames: number;
  renderFrame(frame: number): void | Promise<void>;
  /** Clips placed on the timeline, re-collected on every play/seek/loop. */
  collectClips?(): AudioClip[];
}

/**
 * The one preview clock. Paces which frame index is shown (each frame stays a
 * pure function of its index), schedules timeline audio, and reports state as
 * events: `w-play`, `w-pause`, `w-seek`, `w-ended`, `w-volumechange`. With
 * audio present the audio clock is authoritative; without it, the wall clock.
 * Both <w-composition> and canvas Runtime hosts play through this class, so
 * every player UI binds to one surface. Volume and mute shape preview only;
 * export mixes are rendered offline and never pass through the master gain.
 */
export class PlaybackController extends EventTarget {
  loop = false;

  private readonly media: PlaybackMedia;
  private frame = 0;
  private isPlaying = false;
  private rafId = 0;
  private playToken = 0;
  private disposed = false;
  private volumeValue = 1;
  private mutedValue = false;
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private audioHandle: ScheduledAudio | null = null;
  private clock: {
    audioCtx: AudioContext | null;
    t0: number;
    wall0: number;
    baseFrame: number;
  } | null = null;
  private renderBusy = false;
  private renderQueued = -1;

  constructor(media: PlaybackMedia) {
    super();
    this.media = media;
  }

  get fps(): number {
    return this.media.fps;
  }

  get durationInFrames(): number {
    return this.media.durationInFrames;
  }

  get currentFrame(): number {
    return this.frame;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get volume(): number {
    return this.volumeValue;
  }

  set volume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    if (clamped === this.volumeValue) return;
    this.volumeValue = clamped;
    this.applyGain();
    this.dispatch("w-volumechange", { volume: this.volumeValue, muted: this.mutedValue });
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  set muted(value: boolean) {
    if (value === this.mutedValue) return;
    this.mutedValue = value;
    this.applyGain();
    this.dispatch("w-volumechange", { volume: this.volumeValue, muted: this.mutedValue });
  }

  seek(frame: number): void {
    const clamped = Math.max(0, Math.min(this.durationInFrames - 1, Math.round(frame)));
    this.frame = clamped;
    this.render(clamped);
    this.dispatch("w-seek", { frame: clamped });
    // Scrubbing while playing restarts playback (and its audio) from here.
    if (this.isPlaying && clamped !== this.playbackFrame()) {
      this.stopPlayback();
      void this.startPlayback(clamped);
    }
  }

  play(): void {
    if (this.isPlaying || this.disposed) return;
    this.isPlaying = true;
    const startFrame = this.frame >= this.durationInFrames - 1 ? 0 : this.frame;
    this.dispatch("w-play", { frame: startFrame });
    void this.startPlayback(startFrame);
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.stopPlayback();
    this.dispatch("w-pause", { frame: this.frame });
  }

  /** Stop playback and release the audio context. The controller is done. */
  destroy(): void {
    this.pause();
    this.disposed = true;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.masterGain = null;
  }

  private dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private applyGain(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this.mutedValue ? 0 : this.volumeValue;
    }
  }

  // Render one frame, never overlapping an in-flight async render; when a
  // render is busy, only the latest requested frame is kept. A synchronous
  // renderFrame (the elements backend) completes before this returns.
  private render(frame: number): void {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderQueued = frame;
      return;
    }
    let result: void | Promise<void>;
    try {
      result = this.media.renderFrame(frame);
    } catch (err) {
      console.error(err);
      return;
    }
    if (result && typeof result.then === "function") {
      this.renderBusy = true;
      result
        .catch((err) => console.error(err))
        .then(() => {
          this.renderBusy = false;
          if (this.renderQueued >= 0) {
            const next = this.renderQueued;
            this.renderQueued = -1;
            this.render(next);
          }
        });
    }
  }

  // The frame the running playback clock currently points at, or -1 when the
  // clock has not started.
  private playbackFrame(): number {
    if (!this.clock) return -1;
    const elapsed = this.clock.audioCtx
      ? Math.max(0, this.clock.audioCtx.currentTime - this.clock.t0)
      : (performance.now() - this.clock.wall0) / 1000;
    return this.clock.baseFrame + Math.floor(elapsed * this.fps);
  }

  private async startPlayback(startFrame: number): Promise<void> {
    const token = ++this.playToken;
    const clips = this.media.collectClips?.() ?? [];

    let audioCtx: AudioContext | null = null;
    let handle: ScheduledAudio | null = null;
    let t0 = 0;
    if (clips.length > 0 && typeof AudioContext !== "undefined") {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.connect(this.audioCtx.destination);
        this.applyGain();
      }
      audioCtx = this.audioCtx;
      if (audioCtx.state === "suspended") {
        // Needs a user gesture. resume() can stay pending forever without
        // one, so race it against a short deadline; losing means we play
        // silent on the wall clock instead of freezing on frame zero.
        const resumed = await Promise.race([
          audioCtx.resume().then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
        ]);
        if (!resumed) audioCtx = null;
      }
      if (audioCtx && audioCtx.state === "running") {
        const buffers = await loadClipBuffers(audioCtx, clips);
        if (!this.isPlaying || token !== this.playToken) return;
        t0 = audioCtx.currentTime + 0.05;
        handle = scheduleClips(
          audioCtx,
          clips,
          buffers,
          this.fps,
          startFrame,
          t0,
          this.masterGain ?? undefined,
        );
      } else {
        audioCtx = null;
      }
    }
    if (!this.isPlaying || token !== this.playToken) {
      handle?.stop();
      return;
    }

    this.audioHandle = handle;
    this.clock = { audioCtx, t0, wall0: performance.now(), baseFrame: startFrame };

    const tick = (): void => {
      if (!this.isPlaying || token !== this.playToken) return;
      const f = this.playbackFrame();
      if (f >= this.durationInFrames) {
        if (this.loop) {
          // Restart clock and audio from the top.
          this.stopPlayback();
          void this.startPlayback(0);
          return;
        }
        // Land on the last frame and stop, HTMLMediaElement-style: pause
        // state first, then the ended signal.
        this.isPlaying = false;
        this.stopPlayback();
        const last = this.durationInFrames - 1;
        if (last !== this.frame) {
          this.frame = last;
          this.render(last);
          this.dispatch("w-seek", { frame: last });
        }
        this.dispatch("w-pause", { frame: last });
        this.dispatch("w-ended", { frame: last });
        return;
      }
      if (f !== this.frame) {
        this.frame = f;
        this.render(f);
        this.dispatch("w-seek", { frame: f });
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopPlayback(): void {
    this.playToken++;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.audioHandle?.stop();
    this.audioHandle = null;
    this.clock = null;
  }
}
