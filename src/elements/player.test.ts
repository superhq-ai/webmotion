// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineElements, WComposition } from "./elements.js";
import { definePlayer, WPlayer } from "./player.js";

beforeAll(() => {
  defineElements();
  definePlayer();
});

beforeEach(() => {
  document.body.replaceChildren();
});

async function mountPlayer(html: string): Promise<{ player: WPlayer; comp: WComposition }> {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const player = host.querySelector("w-player") as WPlayer;
  await player.ready;
  return { player, comp: host.querySelector("w-composition") as WComposition };
}

function shadow(player: WPlayer): ShadowRoot {
  return player.shadowRoot as ShadowRoot;
}

describe("WPlayer", () => {
  it("binds the slotted composition and sizes the transport", async () => {
    const { player, comp } = await mountPlayer(`
      <w-player>
        <w-composition width="640" height="360" fps="30" duration="90"></w-composition>
      </w-player>`);

    expect(player.source).toBe(comp);
    const seek = shadow(player).querySelector(".seek") as HTMLInputElement;
    expect(seek.max).toBe("89");
    expect((shadow(player).querySelector(".dur") as HTMLElement).textContent).toBe("0:03");
  });

  it("toggles playback from the play button and mirrors state", async () => {
    const { player, comp } = await mountPlayer(`
      <w-player><w-composition duration="60"></w-composition></w-player>`);
    const playBtn = shadow(player).querySelector(".play") as HTMLButtonElement;

    playBtn.click();
    expect(comp.playing).toBe(true);
    expect(playBtn.getAttribute("aria-label")).toBe("Pause");

    playBtn.click();
    expect(comp.playing).toBe(false);
    expect(playBtn.getAttribute("aria-label")).toBe("Play");
  });

  it("scrubs the source through the seek input, pausing while dragging", async () => {
    const { player, comp } = await mountPlayer(`
      <w-player><w-composition fps="30" duration="90"></w-composition></w-player>`);
    const seek = shadow(player).querySelector(".seek") as HTMLInputElement;

    comp.play();
    seek.value = "45";
    seek.dispatchEvent(new Event("input"));
    expect(comp.playing).toBe(false);
    expect(comp.currentFrame).toBe(45);
    expect((shadow(player).querySelector(".cur") as HTMLElement).textContent).toBe("0:02");

    seek.dispatchEvent(new Event("change"));
    expect(comp.playing).toBe(true);
    comp.pause();
  });

  it("drives volume and mute and reflects w-volumechange back", async () => {
    const { player, comp } = await mountPlayer(`
      <w-player><w-composition duration="60"></w-composition></w-player>`);
    const vol = shadow(player).querySelector(".vol") as HTMLInputElement;
    const mute = shadow(player).querySelector(".mute") as HTMLButtonElement;

    vol.value = "0.3";
    vol.dispatchEvent(new Event("input"));
    expect(comp.volume).toBeCloseTo(0.3);

    mute.click();
    expect(comp.muted).toBe(true);
    expect(mute.getAttribute("aria-label")).toBe("Unmute");
    expect(vol.value).toBe("0");

    // Raising the volume slider unmutes.
    vol.value = "0.8";
    vol.dispatchEvent(new Event("input"));
    expect(comp.muted).toBe(false);
    expect(comp.volume).toBeCloseTo(0.8);
  });

  it("renders chapter segments and seeks on click", async () => {
    const { player, comp } = await mountPlayer(`
      <w-player><w-composition duration="90"></w-composition></w-player>`);
    player.chapters = [
      { label: "Intro", from: 0 },
      { label: "Reveal", from: 60 },
    ];

    const segments = [...shadow(player).querySelectorAll(".segment")] as HTMLElement[];
    expect(segments.map((s) => s.textContent)).toEqual(["Intro", "Reveal"]);
    expect(segments[0].style.flexGrow).toBe("60");
    expect(segments[1].style.flexGrow).toBe("30");
    expect(segments[0].classList.contains("active")).toBe(true);

    segments[1].click();
    expect(comp.currentFrame).toBe(60);
    expect(segments[1].classList.contains("active")).toBe(true);
    expect(segments[0].classList.contains("active")).toBe(false);
  });

  it("steps frames from the keyboard", async () => {
    const { player, comp } = await mountPlayer(`
      <w-player><w-composition duration="90"></w-composition></w-player>`);

    player.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(comp.currentFrame).toBe(1);
    player.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );
    expect(comp.currentFrame).toBe(11);
    player.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(comp.currentFrame).toBe(10);
    player.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(comp.currentFrame).toBe(89);
    player.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(comp.currentFrame).toBe(0);
    player.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));
    expect(comp.muted).toBe(true);
    player.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(comp.playing).toBe(true);
    comp.pause();
  });

  it("zooms the timeline by widening the inner track, clamped to 1..12", async () => {
    const { player } = await mountPlayer(`
      <w-player><w-composition duration="60"></w-composition></w-player>`);
    const inner = shadow(player).querySelector(".inner") as HTMLElement;
    const zoomIn = shadow(player).querySelector(".zoom-in") as HTMLButtonElement;
    const zoomOut = shadow(player).querySelector(".zoom-out") as HTMLButtonElement;

    expect(zoomOut.disabled).toBe(true);
    zoomIn.click();
    expect(player.timelineZoom).toBeCloseTo(1.6);
    expect(inner.style.width).toBe("160%");
    expect(zoomOut.disabled).toBe(false);

    player.timelineZoom = 99;
    expect(player.timelineZoom).toBe(12);
    expect(zoomIn.disabled).toBe(true);
    player.timelineZoom = 0;
    expect(player.timelineZoom).toBe(1);
  });

  it("derives chapter segments from labelled sequences", async () => {
    const { player } = await mountPlayer(`
      <w-player>
        <w-composition duration="120">
          <w-sequence label="Title" from="10" duration="50"><w-el></w-el></w-sequence>
          <w-sequence label="Features" from="60"><w-el></w-el></w-sequence>
        </w-composition>
      </w-player>`);

    const segments = [...shadow(player).querySelectorAll(".segment")] as HTMLElement[];
    expect(segments.map((s) => s.textContent)).toEqual(["Title", "Features"]);
    // The first section stretches back to 0 so the track reads full.
    expect(segments[0].dataset.from).toBe("0");
    expect(segments[1].dataset.from).toBe("60");
  });

  it("renders the audio lane from <w-audio> clips", async () => {
    const { player } = await mountPlayer(`
      <w-player>
        <w-composition fps="30" duration="100">
          <w-audio src="assets/score.m4a"></w-audio>
          <w-sequence from="50" duration="25"><w-audio src="assets/whoosh.m4a"></w-audio></w-sequence>
        </w-composition>
      </w-player>`);

    const clips = [...shadow(player).querySelectorAll(".clip")] as HTMLElement[];
    expect(clips.map((c) => c.textContent)).toEqual(["score.m4a", "whoosh.m4a"]);
    expect(clips[1].style.left).toBe("50%");
    expect(clips[1].style.width).toBe("25%");
  });

  it("binds an explicit source over slotted content", async () => {
    const seeks: number[] = [];
    const fake = Object.assign(new EventTarget(), {
      fps: 30,
      durationInFrames: 120,
      currentFrame: 0,
      playing: false,
      volume: 1,
      muted: false,
      loop: false,
      play(): void {},
      pause(): void {},
      seek(frame: number): void {
        seeks.push(frame);
      },
    });

    const player = document.createElement("w-player") as WPlayer;
    player.source = fake;
    document.body.appendChild(player);
    await player.ready;

    expect(player.source).toBe(fake);
    expect((shadow(player).querySelector(".seek") as HTMLInputElement).max).toBe("119");
    expect(seeks).toEqual([0]);
  });
});
