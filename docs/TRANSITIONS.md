# Transitions

`<w-transition>` paints a solid color over its box and reveals it through an
animated pattern: an ordered dither, a hashed block dissolve, a linear wipe, or
a radial iris. It is the piece you reach for to cut between two scenes, dissolve
to a plate, or wipe one shot onto the next.

It is an entity like `<w-rect>` or `<w-model>`: same `x`/`y`/`width`/`height`
box, lives inside sequences, and its whole state is a pure function of the
frame, so preview and export match. Nothing to install; it ships with
`@superhq/webmotion/elements`.

## Why it exists

A dissolve is easy to fake with a grid of fading `<w-el>` cells, and it looks
fine in preview because the browser composites those cells on the GPU. Export
does not have that luxury: it serializes the DOM to an image every frame, so a
few hundred animated cells turn a 60fps preview into a 2-4fps export.

`<w-transition>` draws the whole effect on one canvas and exposes it through the
live-canvas path (the same one `<w-model>` uses), so export captures it with
`createImageBitmap` on the GPU instead of rasterizing DOM. One layer, near-free,
however fine the pattern. **Do not build transitions out of many animated
cells; use this.**

## The `amount` model

One number, `amount`, in `[0, 1]`, drives everything:

- `0` leaves the box fully transparent, so whatever is behind it shows through.
- `1` covers the box completely with `color`.
- In between, the `pattern` decides the order cells cross the frontier.

You rarely set `amount` by hand. For the common shapes, give the element timing
attributes and it derives `amount` from the sequence-local frame:

| Attribute | Meaning |
| --- | --- |
| `delay` | frames before the cover begins |
| `enter` | frames to cover (`amount` 0 -> 1) |
| `hold` | frames held fully covered |
| `exit` | frames to reveal (`amount` 1 -> 0) |

`enter` alone dissolves *to* the plate. `exit` alone reveals *from* it. Both,
with the scene swapped underneath while the plate is opaque, is a cut.

For a custom curve, drive it yourself with `<w-animate property="amount">`; an
explicit tween overrides the timing attributes. (One caveat: two `<w-animate>`
on the same property do not compose, the later one wins every frame, so use the
`enter`/`hold`/`exit` attributes for cover-then-reveal rather than two `amount`
tweens.)

## Attributes

| Attribute | Meaning | Default |
| --- | --- | --- |
| `pattern` | `dither`, `dissolve`, `wipe`, `iris` | `dither` |
| `color` | plate color, any CSS color | `#000` |
| `cell` | cell size in px; smaller is a finer pattern | `24` |
| `dir` | wipe: `right`/`left`/`down`/`up`; iris: `out`/`in` | `right` / `out` |
| `edge` | soft frontier width, `0` is crisp cells, toward `1` is a crossfade | `0` |
| `seed` | dissolve randomization, for a different block pattern | `1` |
| `smooth` | present to upscale the pattern smoothly instead of blocky | off |
| `delay`/`enter`/`hold`/`exit` | timing that derives `amount` (above) | `0` |
| `easing` | easing for `enter`/`exit` | `easeInOutSine` |

The four patterns:

- **dither** is an ordered Bayer matrix, an even textured fill. It reads as a
  dither rather than an edge, and finer `cell` looks more like true dithering.
- **dissolve** is a hashed per-cell threshold, the blocky random dissolve.
- **wipe** sweeps a straight edge along `dir`.
- **iris** opens or closes a circle from the center.

## A dissolve cut between two scenes

Place the transition at the top level (a direct child of the stage or of an
active `<w-sequence>`) so it becomes its own live layer. Sequence scene A to end
where the plate is fully down, and scene B to begin there:

```html
<w-composition width="1920" height="1080" fps="30" duration="200" background="#0f0f0f">
  <!-- Scene A plays, then hands off under the plate. -->
  <w-sequence from="0" duration="120">
    <w-text x="0" y="460" width="1920" style="text-align:center;font-size:120px;color:#e1e1e1">Before</w-text>
  </w-sequence>

  <!-- Scene B takes over while the plate is opaque. -->
  <w-sequence from="100" duration="100">
    <w-text x="0" y="460" width="1920" style="text-align:center;font-size:120px;color:#e1e1e1">After</w-text>
  </w-sequence>

  <!-- The cut: cover over 14 frames, then reveal over 14, centered on frame 107. -->
  <w-sequence from="100" duration="28">
    <w-transition pattern="dissolve" cell="96" color="#0f0f0f"
                  x="0" y="0" width="1920" height="1080"
                  enter="14" exit="14"></w-transition>
  </w-sequence>
</w-composition>
```

Chunky blocks come from a large `cell`; a fine ordered dither comes from
`pattern="dither"` with a small `cell` (say `8`). `color` is usually the
composition background, so the frame reads as being taken apart into the
backdrop and rebuilt.

## Placement matters

`<w-transition>` earns its speed only as a top-level layer. Nested below a plain
element it falls back into that parent's DOM raster, where its canvas is
serialized every frame, which is the cost it exists to avoid. Keep it a direct
child of the stage or of a `<w-sequence>`.

## Determinism

Like every WebMotion entity, the plate is a pure function of the frame: the
pattern is fixed by `pattern`/`cell`/`dir`/`seed`, and coverage comes from
`amount`, which comes from the frame. Seeking to frame N always paints the same
plate, and exporting twice is byte-identical.
