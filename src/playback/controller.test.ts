// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { PlaybackController } from "./controller.js";

function makeController(overrides: { fps?: number; durationInFrames?: number; loop?: boolean } = {}) {
  const frames: number[] = [];
  const controller = new PlaybackController({
    fps: overrides.fps ?? 30,
    durationInFrames: overrides.durationInFrames ?? 60,
    renderFrame: (frame) => {
      frames.push(frame);
    },
  });
  if (overrides.loop != null) controller.loop = overrides.loop;
  return { controller, frames };
}

function events(controller: PlaybackController, type: string): unknown[] {
  const out: unknown[] = [];
  controller.addEventListener(type, (e) => out.push((e as CustomEvent).detail));
  return out;
}

describe("PlaybackController", () => {
  it("seeks with clamping, renders, and reports through w-seek", () => {
    const { controller, frames } = makeController();
    const seeks = events(controller, "w-seek") as Array<{ frame: number }>;

    controller.seek(10);
    controller.seek(-5);
    controller.seek(999);

    expect(frames).toEqual([10, 0, 59]);
    expect(seeks.map((d) => d.frame)).toEqual([10, 0, 59]);
    expect(controller.currentFrame).toBe(59);
  });

  it("reports play and pause state as events", () => {
    const { controller } = makeController();
    const plays = events(controller, "w-play");
    const pauses = events(controller, "w-pause");

    expect(controller.playing).toBe(false);
    controller.play();
    expect(controller.playing).toBe(true);
    controller.play(); // idempotent
    controller.pause();
    expect(controller.playing).toBe(false);
    controller.pause(); // idempotent

    expect(plays).toHaveLength(1);
    expect(pauses).toHaveLength(1);
  });

  it("clamps volume, applies mute, and fires w-volumechange once per change", () => {
    const { controller } = makeController();
    const changes = events(controller, "w-volumechange") as Array<{
      volume: number;
      muted: boolean;
    }>;

    controller.volume = 2; // clamps to 1, the current value: no event
    controller.volume = 0.4;
    controller.muted = true;
    controller.muted = true; // no-op

    expect(controller.volume).toBe(0.4);
    expect(controller.muted).toBe(true);
    expect(changes).toEqual([
      { volume: 0.4, muted: false },
      { volume: 0.4, muted: true },
    ]);
  });

  it("stops on the last frame and fires w-ended when loop is off", async () => {
    const { controller } = makeController({ fps: 1000, durationInFrames: 4 });
    const ended = events(controller, "w-ended");
    const pauses = events(controller, "w-pause");

    controller.play();
    await vi.waitFor(() => expect(ended).toHaveLength(1), { timeout: 2000 });

    expect(controller.playing).toBe(false);
    expect(controller.currentFrame).toBe(3);
    expect(pauses).toHaveLength(1);
  });

  it("wraps to frame 0 and keeps playing when loop is on", async () => {
    const { controller, frames } = makeController({ fps: 1000, durationInFrames: 4, loop: true });
    const ended = events(controller, "w-ended");

    controller.play();
    await vi.waitFor(() => expect(frames.length).toBeGreaterThan(6), { timeout: 2000 });
    controller.pause();

    expect(ended).toHaveLength(0);
    // The walk wrapped: some frame was rendered again after a later one.
    const wrapped = frames.some((f, i) => i > 0 && f < frames[i - 1]);
    expect(wrapped).toBe(true);
  });

  it("restarts from the top when played at the end", () => {
    const { controller, frames } = makeController();
    const plays = events(controller, "w-play") as Array<{ frame: number }>;

    controller.seek(59);
    controller.play();
    controller.pause();

    expect(plays[0]?.frame).toBe(0);
    expect(frames[0]).toBe(59);
  });

  it("keeps only the latest frame when async renders pile up", async () => {
    const rendered: number[] = [];
    const controller = new PlaybackController({
      fps: 30,
      durationInFrames: 60,
      renderFrame: async (frame) => {
        await Promise.resolve();
        rendered.push(frame);
      },
    });

    controller.seek(1);
    controller.seek(2);
    controller.seek(3);
    await vi.waitFor(() => expect(rendered.length).toBeGreaterThanOrEqual(2));

    // The first render was in flight; intermediate seeks collapse to the last.
    expect(rendered).toEqual([1, 3]);
  });

  it("refuses to play after destroy", () => {
    const { controller } = makeController();
    const plays = events(controller, "w-play");

    controller.destroy();
    controller.play();

    expect(controller.playing).toBe(false);
    expect(plays).toHaveLength(0);
  });
});
