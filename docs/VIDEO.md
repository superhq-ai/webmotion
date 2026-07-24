# Video clips

`<w-video>` plays a video file as an entity in a composition. It is a box like
`<w-text>` or `<w-model>`: the same `x`/`y`/`width`/`height`, it lives inside
sequences, and it accepts `<w-animate>` tweens. Each frame it shows is a pure
function of the composition frame, decoded exactly, so preview and export agree
and seeking to frame N always paints the same picture. The clip's own audio is
folded into the export mix.

## Setup

Decoding uses WebCodecs (`VideoDecoder`) with [mp4box.js](https://github.com/gpac/mp4box.js)
to demux the container. mp4box is an optional peer dependency, so only
compositions that use video pay for it.

```bash
npm install mp4box
```

```js
import "@superhq/webmotion/elements";
import "@superhq/webmotion/video"; // registers <w-video>
```

Export needs a Chromium-based browser (WebCodecs decode and encode).

## Usage

```html
<w-composition width="1920" height="1080" fps="30" duration="240">
  <w-sequence from="0" duration="180">
    <w-video src="assets/clip.mp4" fit="cover" trim="2" volume="0.8"
             x="0" y="0" width="1920" height="1080">
      <w-animate property="opacity" from="0" to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
    </w-video>
  </w-sequence>
</w-composition>
```

## Attributes

| Attribute | Meaning | Default |
| --- | --- | --- |
| `src` | video url, resolved against the document base | required |
| `from` | sequence-local frame where playback begins | `0` |
| `trim` | seconds into the source to start from (the in point) | `0` |
| `speed` | playback rate multiplier | `1` |
| `loop` | wrap at the source end instead of holding the last frame | off |
| `muted` | drop the clip's audio from the mix | off |
| `volume` | audio gain, `0`..`1` | `1` |
| `fit` | `cover` (fill and clip), `contain` (letterbox), `fill` (stretch) | `cover` |
| `x` `y` `width` `height` `opacity` | the box, like any entity | |

The source time for a composition frame is
`trim + (frame - from) / fps * speed`, clamped at the source end or wrapped when
`loop` is set. A clip is bounded on the timeline by its enclosing
`<w-sequence>`, the same as everything else.

## How it works

`<w-video>` draws into an inline canvas and exposes it through the live-canvas
protocol, the same path `<w-model>` uses: at export the compositor captures the
canvas with `createImageBitmap` on the GPU path rather than rasterizing DOM (a
live `<video>` cannot be serialized into a frame anyway). Transform and opacity
tweens on the element are applied by the compositor, so a slide or fade costs a
draw, not a re-decode.

Decoding is frame-exact. mp4box builds an index of every coded sample with its
presentation time and keyframe flag; a seek anchors on the keyframe at or before
the target and decodes forward to it, while sequential playback (the export
case) simply feeds the next sample. Because the source frame is chosen purely
from the composition frame, exporting twice is identical.

Place `<w-video>` at the top level (a direct child of the stage or of an active
`<w-sequence>`) so it becomes its own live layer. Nested below a plain element
it falls back into that parent's DOM raster, which cannot capture a canvas
cheaply.

## Audio

A clip's audio rides the normal mix. `decodeAudioData` decodes the file's audio
track like any `<w-audio>` source, so the clip is scheduled into the offline
mixdown (`renderAudioMix`) and encoded into the MP4's audio track, and it shows
on the player's audio lane. `muted` drops it; `volume` sets its gain. In this
version the audio plays at natural rate from the in point: `speed` and `loop`
shape the picture but not the sound.

## Limits

- **MP4 only.** mp4box demuxes MP4/MOV; WebM is not supported. The codec must be
  one the browser's `VideoDecoder` handles (H.264 everywhere; H.265, VP9, and
  AV1 in MP4 where the browser supports them).
- The whole file is fetched and demuxed up front, which is fine for
  launch-length clips; very large files cost memory.
- Preview decodes per frame too. Sequential playback keeps up; a hard scrub
  re-seeks from a keyframe and may briefly lag.
