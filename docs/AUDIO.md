# Audio

How sound is declared in WebMotion's HTML layer. Companion to [MOTION.md](./MOTION.md); the same principles apply.

## Principles

1. **Audio is a pure function of the timeline.** A clip's placement, trim, and gain envelope are declared in frames; nothing depends on when playback happens. The export mixdown renders through an `OfflineAudioContext`, which is to sound what the frame loop is to pixels: sample-exact, offline, reproducible.
2. **Time is structure, for sound too.** `<w-audio>` participates in the same `<w-sequence>` tree as visuals: a sequence shifts when a clip starts and bounds how long it can be heard. Sound effects land on beats by placement, not by timestamp bookkeeping.
3. **Preview and export play the same mix.** One scheduler builds the WebAudio graph for both; the live `AudioContext` and the offline render differ only in clock.

## `<w-audio>`: one clip

```html
<!-- A music bed under the whole film, fading out over the last 40 frames -->
<w-audio src="assets/score.wav" gain="0.9">
  <w-animate property="gain" from="0.9" to="0" start="345" end="385"></w-animate>
</w-audio>

<!-- A hit that fires when the reveal beat starts -->
<w-sequence from="72">
  <w-audio src="assets/whoosh.wav" gain="0.7"></w-audio>
</w-sequence>
```

`<w-audio>` renders nothing and is skipped by the frame walk.

### Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `src` | — | Audio file URL (anything `decodeAudioData` accepts: WAV, MP3, AAC, OGG per browser). Must be same-origin or CORS-readable. |
| `from` | `0` | Start frame, local to the nearest enclosing `<w-sequence>`. |
| `duration` | natural length | Playback length in frames. Omitted, the clip plays to its natural end, bounded by its sequence window and the composition. |
| `offset` | `0` | Frames to skip into the source file before playing. |
| `gain` | `1` | Base volume. |

### Gain envelopes

`gain` animates with the same `<w-animate>` vocabulary as visuals, inline or via `motion` references, in local frames. As with visual properties, an animated gain replaces the base attribute. The envelope is sampled per frame and applied as linear ramps, so the preview mix and the exported mix are the same curve.

### Windows

A clip is audible from its start until the earliest of: its `duration`, its source's natural end, every enclosing sequence window, and the composition's end. A `<w-sequence duration>` silences its audio exactly where it hides its visuals.

## Preview

`composition.play()` collects clips, decodes them (cached per context), and schedules them on a live `AudioContext`. When audio is present, **the audio clock paces the frames**; each rendered frame is still a pure function of its index. Seeking while playing reschedules the clips from the new position; looping restarts them.

Browser autoplay policy applies: an `AudioContext` only starts after a user gesture. A composition with `autoplay` previews silent until the first interaction; a play button counts.

## Export

`composition.export()` renders the full mix through an `OfflineAudioContext` (48kHz stereo) and encodes it into the MP4's audio track with WebCodecs `AudioEncoder`: AAC (`mp4a.40.2`) when the platform provides it, Opus otherwise. If neither is available the export proceeds silent with a console warning. Compositions without `<w-audio>` produce video-only files, exactly as before.

## Determinism footnote

An offline render is sample-exact and reproducible on a given engine. Across browser engines or versions, float DSP may differ by rounding; the same caveat applies to font rasterization on the pixel side. Timeline math (placement, trims, envelope values) is exact everywhere.

## Reserved for later

- Named audio in `<w-defs>` applied by reference, if scenes show repeated sound patterns.
- Synthesized sources (oscillator/noise elements) for UI blips without asset files.
- Per-clip pan and multi-bus mixing.
