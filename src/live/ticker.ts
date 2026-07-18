// Time sources for the live runtime. A ticker produces monotonic time in
// milliseconds; who consumes it decides what a frame is. The rAF ticker runs
// only while it has subscribers, which is the live mode's idle guarantee: no
// mounted props means no subscribers means no animation frame loop at all.
export interface Ticker {
  /** Subscribe to ticks; returns an unsubscribe function. */
  subscribe(fn: (nowMs: number) => void): () => void;
  /** The ticker's current time, for stamping trigger moments. */
  now(): number;
}

export class RafTicker implements Ticker {
  private readonly subs = new Set<(nowMs: number) => void>();
  private rafId = 0;
  private running = false;

  subscribe(fn: (nowMs: number) => void): () => void {
    this.subs.add(fn);
    if (!this.running) {
      this.running = true;
      this.rafId = requestAnimationFrame(this.tick);
    }
    return () => {
      this.subs.delete(fn);
      if (this.subs.size === 0 && this.running) {
        this.running = false;
        cancelAnimationFrame(this.rafId);
      }
    };
  }

  now(): number {
    return performance.now();
  }

  private readonly tick = (nowMs: number): void => {
    if (!this.running) return;
    for (const fn of [...this.subs]) fn(nowMs);
    if (this.running) this.rafId = requestAnimationFrame(this.tick);
  };
}

/** Deterministic ticker for tests: time moves only when advanced. */
export class ManualTicker implements Ticker {
  private readonly subs = new Set<(nowMs: number) => void>();
  private time = 0;

  subscribe(fn: (nowMs: number) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
    for (const fn of [...this.subs]) fn(this.time);
  }

  get subscriberCount(): number {
    return this.subs.size;
  }
}
