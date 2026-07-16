# Playback

How preview playback and the standard player UI work. Companion to [AUDIO.md](./AUDIO.md); export is unaffected by anything here.

## Principles

1. **One clock.** `PlaybackController` is the only preview clock: it paces which frame index is shown, schedules timeline audio, and reports state as events. `<w-composition>` runs on it internally; canvas `Runtime` hosts drive it directly. Frames stay pure functions of their index, so playing changes nothing about what a frame looks like.
2. **One surface.** Everything a transport UI needs — `play/pause/seek`, `playing`, `volume`, `muted`, `loop`, `fps`, `durationInFrames`, `currentFrame`, and the `w-*` events — is the same on a composition element and a controller. `<w-player>` binds to either.
3. **Volume is a preview concern.** The live mix routes through a master gain that `volume`/`muted` shape. Export mixes render offline and never pass through it; a muted preview still exports full-volume audio.

## The playback surface

```js
const comp = document.querySelector("w-composition");
comp.play();
comp.pause();
comp.seek(42);
comp.playing;      // readonly
comp.volume = 0.5; // 0..1, preview only
comp.muted = true;
comp.loop = true;  // or the `loop` attribute; default is play-once
```

Events, dispatched as `CustomEvent`s: `w-play`, `w-pause`, `w-seek` (`{frame}`), `w-ended`, `w-volumechange` (`{volume, muted}`). Without `loop`, playback lands on the last frame, fires `w-pause` then `w-ended`, and the next `play()` restarts from 0.

For canvas runtimes the same surface comes from the controller:

```js
import { PlaybackController } from "@superhq/webmotion";
const controller = new PlaybackController({
  fps: 30,
  durationInFrames: 300,
  renderFrame: (frame) => runtime.renderFrame(frame), // may be async; never overlapped
  collectClips: () => clips,                          // optional timeline audio
});
```

`destroy()` stops playback and closes the controller's `AudioContext`.

## `<w-player>`: the standard transport

```html
<w-player>
  <w-composition width="1280" height="720" fps="30" duration="300">...</w-composition>
</w-player>
```

The slotted composition binds automatically. A controller-driven stage binds explicitly: slot the canvas, assign `player.source = controller`.

What the bar contains, left to right: play/pause, current/total time, the scrub timeline, mute + volume, timeline zoom, fullscreen.

### The timeline

- **Chapter segments** come from `label="..."` on `<w-sequence>` elements (collected with sequence timing applied, like audio clips are). The first section stretches back to frame 0 so the track reads full. Setting the `chapters` property (`[{label, from}]` in frames) overrides them.
- **The audio lane** shows one block per `<w-audio>` clip at its timeline position. Purely informational.
- **Zoom** (`timelineZoom`, 1–12, also the `+`/`-` keys and bar buttons) widens the track past its viewport; it scrolls horizontally and the view follows the playhead while playing.
- Scrubbing pauses playback and resumes on release.

### Keyboard

With focus on the player: space/`k` toggles, arrows step one frame (shift: ten), Home/End jump, `m` mutes, `f` fullscreens, `+`/`-` zoom the timeline.

### Theming

The player inherits `color` and `font-family`. Custom properties: `--w-player-accent`, `--w-player-accent-contrast`, `--w-player-line`, `--w-player-chip`, `--w-player-chip-active`, `--w-player-audio`, `--w-player-audio-line`, `--w-player-fullscreen-bg`. Parts for structural styling: `viewport`, `shell`, `bar`, `play-button`, `time`, `track`, `sound`, `mute-button`, `zoom`, `fullscreen-button`.

The stage always fits the viewport (largest width whose height still fits, like `object-fit: contain`); size the player, not the stage.

## Reserved for later

- Playback rate.
- A frame-accurate time readout mode (frames / timecode).
- Loop-region selection on the timeline.
