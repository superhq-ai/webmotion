# Playback

How preview playback and the standard player UI work. Companion to [AUDIO.md](./AUDIO.md); export is unaffected by anything here.

## Principles

1. **One clock.** `PlaybackController` is the only preview clock: it paces which frame index is shown, schedules timeline audio, and reports state as events. `<w-composition>` runs on it internally; canvas `Runtime` hosts drive it directly. Frames stay pure functions of their index, so playing changes nothing about what a frame looks like.
2. **One surface.** Everything a transport UI needs (`play`/`pause`/`seek`, `playing`, `volume`, `muted`, `loop`, `fps`, `durationInFrames`, `currentFrame`, and the `w-*` events) is the same on a composition element and a controller. `<w-player>` binds to either.
3. **The timeline is a projection of the scene.** Chapter segments, overlay lanes, and audio lanes are all derived from the markup the author already wrote. There is no separate track list to declare or keep in sync.
4. **Volume is a preview concern.** The live mix routes through a master gain that `volume` and `muted` shape. Export mixes render offline and never pass through it; a muted preview still exports full-volume audio.

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

The bar contains, left to right: play/pause, current and total time, the scrub timeline, mute and volume, timeline zoom, fullscreen.

## Labels and the timeline

A `label` attribute on any `<w-sequence>` names that sequence's time window. Where the label lands in the timeline is decided by nesting, the same structure that already decides timing:

```html
<w-sequence label="Intro" from="0" duration="100">...</w-sequence>

<w-sequence label="Scene 2" from="100">
  <!-- A sub-section: renders on an overlay lane under the rail. -->
  <w-sequence label="Lower third" from="20" duration="40">...</w-sequence>
</w-sequence>
```

- **Top-level labels are chapters.** Labels with no labelled ancestor form the chapter rail, in time order. Consecutive beats often butt exactly, overlap a little for a crossfade, or leave `duration` off entirely, so the rail does not draw their raw windows: each segment is cut at the next label's start, the first stretches back to frame 0, and the last runs to the end. The rail always reads as one full strip.
- **Nested labels are sub-sections.** A label inside a labelled sequence renders on an overlay lane below the rail, at its true absolute window. Overlapping sub-sections pack into as many rows as the scene needs; non-overlapping ones share a row. Unlabelled wrapper sequences (the usual staggering pattern) do not affect any of this.
- **Audio packs the same way.** Each `<w-audio>` clip renders as a block at its timeline position. Clips that overlap in time, a music bed under effects for example, go to separate lanes; clips that do not overlap share one. A block shows the clip's audible span: the file's natural length, decoded lazily for the UI, clamped by its window. Until metadata loads (or when decoding fails) the block spans the allowed window instead.

Layering in the scene itself needs no declaration: parallel sibling sequences, DOM order, and z-index already decide what renders on top. The lanes described here are only how the scrub bar draws that structure. A scene with a flat list of labelled beats gets exactly one rail and nothing else.

Clicking any segment or overlay block seeks to its start. Every block whose window contains the current frame is highlighted, on every lane. Setting the `chapters` property (`[{label, from}]` in frames) replaces the derived rail; the overlay and audio lanes still come from the markup.

The collected data is also available programmatically: `composition.sections()` returns `{label, from, to, depth}` per labelled sequence (`depth` counts labelled ancestors), and `composition.audioClips()` returns the placed audio clips. Both are what `collectSections` and `collectAudioClips` produce for the composition's stage.

### Zoom

`timelineZoom` (1 to 12, stepped by the bar buttons and the `+`/`-` keys) widens the whole track past its viewport. The track scrolls horizontally and the view follows the playhead while playing. Scrubbing pauses playback and resumes on release.

### Keyboard

With focus on the player: space or `k` toggles, arrows step one frame (shift: ten), Home/End jump, `m` mutes, `f` fullscreens, `+`/`-` zoom the timeline.

### Theming

The player inherits `color` and `font-family`. Custom properties: `--w-player-accent`, `--w-player-accent-contrast`, `--w-player-line`, `--w-player-chip`, `--w-player-chip-active`, `--w-player-audio`, `--w-player-audio-line`, `--w-player-fullscreen-bg`. Parts for structural styling: `viewport`, `shell`, `bar`, `play-button`, `time`, `track`, `sound`, `mute-button`, `zoom`, `fullscreen-button`. In fullscreen the bar switches to a built-in light-on-dark scheme.

The stage always fits the viewport (largest width whose height still fits, like `object-fit: contain`); size the player, not the stage.

## Reserved for later

- Playback rate.
- A frame-accurate time readout mode (frames or timecode).
- Loop-region selection on the timeline.
- An explicit lane override attribute, if derived packing proves wrong for a real scene.
