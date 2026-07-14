import { describe, it, expect } from "vitest";
import { Sequence } from "./sequence.js";

describe("Sequence", () => {
  it("is inactive before its start frame", () => {
    const seq = new Sequence({ from: 30, durationInFrames: 60 });
    expect(seq.resolve(29).active).toBe(false);
  });

  it("maps the start frame to local frame 0", () => {
    const seq = new Sequence({ from: 30, durationInFrames: 60 });
    expect(seq.resolve(30)).toEqual({ active: true, localFrame: 0 });
  });

  it("maps interior frames to zero-based local time", () => {
    const seq = new Sequence({ from: 30, durationInFrames: 60 });
    expect(seq.resolve(45)).toEqual({ active: true, localFrame: 15 });
  });

  it("is active on the last frame but not one past it", () => {
    const seq = new Sequence({ from: 30, durationInFrames: 60 });
    expect(seq.resolve(89).active).toBe(true); // 30 + 60 - 1
    expect(seq.resolve(90).active).toBe(false);
  });

  it("runs forever with an infinite duration", () => {
    const seq = new Sequence({ from: 10 });
    expect(seq.resolve(1_000_000)).toEqual({ active: true, localFrame: 999_990 });
    expect(seq.endFrame).toBe(Infinity);
  });

  it("rejects invalid configuration", () => {
    expect(() => new Sequence({ from: -1 })).toThrow();
    expect(() => new Sequence({ from: 1.5 })).toThrow();
    expect(() => new Sequence({ durationInFrames: 0 })).toThrow();
  });

  describe("nesting", () => {
    it("adds offsets so children stay zero-based", () => {
      const parent = new Sequence({ from: 100, durationInFrames: 100 });
      const child = new Sequence({ from: 10, durationInFrames: 20 });
      const composed = child.nestedIn(parent);

      // Child begins at global 110, local 0 there.
      expect(composed.resolve(109).active).toBe(false);
      expect(composed.resolve(110)).toEqual({ active: true, localFrame: 0 });
      expect(composed.resolve(129)).toEqual({ active: true, localFrame: 19 });
      expect(composed.resolve(130).active).toBe(false);
    });

    it("clips a child to the parent's window", () => {
      const parent = new Sequence({ from: 0, durationInFrames: 15 });
      const child = new Sequence({ from: 10, durationInFrames: 20 }); // wants to reach 30
      const composed = child.nestedIn(parent);
      // Parent ends at 14, so the child can only survive to 14.
      expect(composed.resolve(14).active).toBe(true);
      expect(composed.resolve(15).active).toBe(false);
    });

    it("produces a never-active sequence when the child starts after the parent ends", () => {
      const parent = new Sequence({ from: 0, durationInFrames: 10 });
      const child = new Sequence({ from: 20, durationInFrames: 5 });
      const composed = child.nestedIn(parent);
      expect(composed.resolve(20).active).toBe(false);
      expect(composed.resolve(25).active).toBe(false);
      expect(composed.endFrame).toBe(-1);
    });

    it("inherits an infinite parent's openness", () => {
      const parent = new Sequence({ from: 5 });
      const child = new Sequence({ from: 5, durationInFrames: 10 });
      const composed = child.nestedIn(parent);
      expect(composed.resolve(10)).toEqual({ active: true, localFrame: 0 });
      expect(composed.resolve(19)).toEqual({ active: true, localFrame: 9 });
      expect(composed.resolve(20).active).toBe(false);
    });
  });
});
