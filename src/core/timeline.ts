import { Composition } from "./composition.js";

/**
 * Tracks the current global frame for a composition.
 */
export class Timeline {
  readonly composition: Composition;
  private _frame = 0;

  constructor(composition: Composition) {
    this.composition = composition;
  }

  /** The current global frame, clamped to `[0, durationInFrames - 1]`. */
  get frame(): number {
    return this._frame;
  }

  /** Presentation time of the current frame, in seconds. */
  get time(): number {
    return this.composition.frameToSeconds(this._frame);
  }

  /**
   * Move to an absolute frame. Values are clamped and floored to a whole frame.
   */
  seek(frame: number): number {
    const last = this.composition.durationInFrames - 1;
    const clamped = Math.min(Math.max(Math.floor(frame), 0), last);
    this._frame = clamped;
    return clamped;
  }

  /** Advance by `delta` frames (default 1), clamped to range. */
  advance(delta = 1): number {
    return this.seek(this._frame + delta);
  }

  /** True once the playhead is on the final frame. */
  get atEnd(): boolean {
    return this._frame >= this.composition.durationInFrames - 1;
  }

  /**
   * Iterate every frame of the composition in order, from 0 to the last
   * frame. Used by the offline exporter to drive a full render.
   */
  *frames(): IterableIterator<number> {
    for (let f = 0; f < this.composition.durationInFrames; f++) {
      yield f;
    }
  }
}
