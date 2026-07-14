// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { collectAudioClips } from "./schedule.js";

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("collectAudioClips", () => {
  it("collects a root-level clip spanning the composition", () => {
    const root = mount(`<w-audio src="score.mp3" gain="0.8"></w-audio>`);
    const clips = collectAudioClips(root, 30, 300);

    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      src: "score.mp3",
      startFrame: 0,
      endFrame: 300,
      offsetFrames: 0,
      gain: 0.8,
      envelope: null,
    });
  });

  it("applies from, duration, and offset attributes", () => {
    const root = mount(`<w-audio src="a.mp3" from="30" duration="60" offset="15"></w-audio>`);
    const clips = collectAudioClips(root, 30, 300);

    expect(clips[0]).toMatchObject({ startFrame: 30, endFrame: 90, offsetFrames: 15 });
  });

  it("shifts and bounds clips through nested sequences", () => {
    const root = mount(`
      <w-sequence from="78" duration="112">
        <w-sequence from="10">
          <w-audio src="whoosh.mp3"></w-audio>
        </w-sequence>
      </w-sequence>`);
    const clips = collectAudioClips(root, 30, 600);

    // Starts at 78 + 10; audible window ends with the outer sequence at 190.
    expect(clips[0]).toMatchObject({ startFrame: 88, endFrame: 190 });
  });

  it("drops clips whose window is empty and clips without src", () => {
    const root = mount(`
      <w-sequence from="290" duration="20">
        <w-audio src="late.mp3" from="30"></w-audio>
      </w-sequence>
      <w-audio></w-audio>`);
    expect(collectAudioClips(root, 30, 300)).toHaveLength(0);
  });

  it("ignores audio inside defs", () => {
    const root = mount(`
      <w-defs><w-animation name="x"><w-audio src="no.mp3"></w-audio></w-animation></w-defs>`);
    expect(collectAudioClips(root, 30, 300)).toHaveLength(0);
  });

  it("samples gain tweens into an envelope in global frames", () => {
    const root = mount(`
      <w-sequence from="100">
        <w-audio src="a.mp3" duration="50">
          <w-animate property="gain" from="1" to="0" start="40" end="50"></w-animate>
        </w-audio>
      </w-sequence>`);
    const clips = collectAudioClips(root, 30, 300);
    const env = clips[0]?.envelope;

    expect(env).not.toBeNull();
    // Clamped at 1 until local frame 40 (global 140), reaching 0 at global 150.
    expect(env?.[0]).toEqual({ frame: 100, value: 1 });
    const mid = env?.find((p) => p.frame === 145);
    expect(mid?.value).toBeCloseTo(0.5, 5);
    expect(env?.[env.length - 1]).toEqual({ frame: 150, value: 0 });
  });

  it("returns null envelope when gain tweens are flat", () => {
    const root = mount(`
      <w-audio src="a.mp3" duration="50">
        <w-animate property="gain" from="0.5" to="0.5" start="0" end="10"></w-animate>
      </w-audio>`);
    expect(collectAudioClips(root, 30, 300)[0]?.envelope).toBeNull();
  });
});
