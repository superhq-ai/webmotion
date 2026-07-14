/**
 * Shifts a child timeline by an offset and optional duration.
 */
export interface SequenceConfig {
  /** Frame, in the parent timeline, at which this sequence starts. */
  from?: number;
  /**
   * How many frames this sequence lasts. Omit or pass Infinity to run to the
   * end of the enclosing timeline.
   */
  durationInFrames?: number;
}

export interface SequenceState {
  /** Whether the sequence's content is visible on the queried frame. */
  active: boolean;
  /**
   * The sequence-local frame (0-based). Meaningful only when `active` is
   * true.
   */
  localFrame: number;
}

const INACTIVE: SequenceState = Object.freeze({ active: false, localFrame: 0 });

export class Sequence {
  readonly from: number;
  readonly durationInFrames: number;
  /**
   * Marks a sequence whose effective window collapsed during composition.
   */
  private neverActive: boolean;

  constructor(config: SequenceConfig = {}) {
    const from = config.from ?? 0;
    if (!Number.isFinite(from) || from < 0 || !Number.isInteger(from)) {
      throw new RangeError(`Sequence.from must be a non-negative integer, got ${from}`);
    }
    const duration = config.durationInFrames ?? Infinity;
    if (duration <= 0 || Number.isNaN(duration)) {
      throw new RangeError(
        `Sequence.durationInFrames must be a positive number or Infinity, got ${duration}`,
      );
    }
    this.from = from;
    this.durationInFrames = duration;
    this.neverActive = false;
  }

  /** The last frame (inclusive) on which this sequence is active, or Infinity. */
  get endFrame(): number {
    if (this.neverActive) return -1;
    return this.durationInFrames === Infinity ? Infinity : this.from + this.durationInFrames - 1;
  }

  /**
   * Map a parent frame to this sequence's local frame.
   */
  resolve(parentFrame: number): SequenceState {
    if (this.neverActive) return INACTIVE;
    const local = parentFrame - this.from;
    if (local < 0) return INACTIVE;
    if (this.durationInFrames !== Infinity && local >= this.durationInFrames) return INACTIVE;
    return { active: true, localFrame: local };
  }

  /**
   * Compose this sequence inside a parent sequence.
   */
  nestedIn(parent: Sequence): Sequence {
    const from = parent.from + this.from;

    if (parent.durationInFrames === Infinity) {
      return Sequence.window(from, this.durationInFrames);
    }

    // How much of the parent's window remains after this child's own offset.
    const parentRemaining = parent.durationInFrames - this.from;
    if (parentRemaining <= 0) {
      return Sequence.empty(from);
    }
    return Sequence.window(from, Math.min(this.durationInFrames, parentRemaining));
  }

  /** Construct a sequence from a resolved offset and (possibly infinite) length. */
  private static window(from: number, durationInFrames: number): Sequence {
    return durationInFrames === Infinity
      ? new Sequence({ from })
      : new Sequence({ from, durationInFrames });
  }

  /** A sequence that is never active, anchored at `from` for bookkeeping. */
  private static empty(from: number): Sequence {
    const s = new Sequence({ from });
    s.neverActive = true;
    return s;
  }
}
