# WebMotion recipes

Complete patterns for launch-quality scenes. All markup assumes `import "@superhq/webmotion/elements"` has run.

## Pacing and craft (read first)

What separates keynote-grade motion from a slideshow:

- **One idea on screen at a time.** Give each beat its own `<w-sequence>`; fade the previous beat out before or as the next enters.
- **Frames, not vibes.** At 30 fps: entrances 15–20 frames, exits 10–12, holds 40–70. A 10-second film is 300 frames; storyboard the beats as `from` offsets first.
- **Ease out on entrances, ease in on exits.** `easeOutCubic` in, `easeInCubic`/`easeInOutSine` out. Never `linear` for opacity on type.
- **Move small.** Type rises 24–40px, scales 0.96→1.0. Big travel reads as cartoon, small travel reads as expensive.
- **Slow drift on holds.** A 1–3% scale or a few px of drift over the whole hold keeps stills alive (Ken Burns).
- **Track letters on hero words.** Animating `letter-spacing` from wide to normal (e.g. `18px → 2px`) with a long ease-out is the signature keynote move.
- **Two kinds of stagger.** Items that form one visual group (chips, grid cells) cascade at 6–10 frame offsets. Lines meant to be *read* one at a time (feature statements) reveal one by one: ~30 frame offsets, so each line lands and holds alone before the next enters.

## Staged typography (beat in, beat out)

**The nesting rule:** two tweens on the same property of one element fight: outside its window a tween still writes its clamped boundary value, and the last one wins, so an exit tween would hold opacity at 1 during the entrance. Put entrance and exit on different nesting levels instead; opacity and transforms compose multiplicatively through the tree.

```html
<w-defs>
  <w-animation name="beat-in">
    <w-animate property="opacity" from="0" to="1" start="0" end="16" easing="easeOutCubic"></w-animate>
    <w-animate property="y" from="28" to="0" start="0" end="16" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<!-- Beat: visible frames 20..90. The wrapper owns the exit, the text owns the entrance. -->
<w-sequence from="20" duration="70">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="58" end="70" easing="easeInCubic"></w-animate>
    <w-text class="headline" motion="beat-in" x="0" y="300" width="1280">Introducing.</w-text>
  </w-el>
</w-sequence>
```

Give beat wrappers explicit full-frame coordinates (`x="0" y="0" width height`) so children keep composition-space coordinates.

## Letter-tracking hero word

```html
<w-text class="hero" x="0" y="310" width="1280">
  WebMotion
  <w-animate property="opacity" from="0" to="1" start="0" end="24" easing="easeOutCubic"></w-animate>
  <w-animate property="letter-spacing" from="22px" to="2px" start="0" end="40" easing="easeOutCubic"></w-animate>
</w-text>
```

## Ken Burns image hold

```html
<w-el x="0" y="0" width="1280" height="720"
      style="background:url('./assets/hero.png') center/cover no-repeat;">
  <w-animate property="scale" from="1.06" to="1.0" start="0" end="160" easing="easeOutSine"></w-animate>
  <w-animate property="opacity" from="0" to="1" start="0" end="20" easing="easeOutCubic"></w-animate>
</w-el>
```

Use a wrapper `<w-el>` sized to the full frame; `scale` composes on the transform so the image drifts as one plane.

## Feature-line reveal (one by one)

Feature statements are read, not glanced, so give each line ~30 frames to itself before the next enters. With the lines as data, the stagger and layout are one expression each:

```html
<w-sequence from="150" duration="140">
  <w-data name="features">["Deterministic.", "Browser-native.", "No render farm."]</w-data>
  <w-for each="features" as="line">
    <w-sequence from="{i * 30}">
      <w-text class="feature" motion="beat-in" x="0" y="{270 + i * 80}" width="1280">{line}</w-text>
    </w-sequence>
  </w-for>
</w-sequence>
```

For grouped items (chips, cards) tighten the offset to `{i * 8}` so they read as one cascading gesture.

## Data-driven charts and boards

Templating drives motion values too: per-item tween targets and cascading windows from one template.

```html
<w-data name="velocity">[96, 132, 118, 170, 152, 208, 238]</w-data>
<div class="chart">
  <w-for each="velocity" as="peak">
    <div class="bar"><w-animate property="height" from="16px" to="{peak}px"
         start="{18 + i * 4}" end="{44 + i * 4}" easing="easeOutCubic"></w-animate></div>
  </w-for>
</div>
```

Nested loops handle boards and grids; the inner `each` resolves through the outer binding:

```html
<w-data name="board">[
  { "title": "Backlog", "cards": [{ "t": "Billing", "id": "ORB-341" }] },
  { "title": "Done",    "cards": [{ "t": "Sync engine", "id": "ORB-290" }] }
]</w-data>
<w-for each="board" as="col">
  <div class="col"><h4>{col.title}</h4>
    <w-for each="col.cards" as="card">
      <div class="card">{card.t}<span class="tag">{card.id}</span></div>
    </w-for>
  </div>
</w-for>
```

## Soundtrack

A music bed under the whole film, faded out by envelope over the last ~40 frames, and effects placed on beats by structure. Lead a hit by 4–6 frames so its sweep peaks as the visual lands:

```html
<w-audio src="assets/score.m4a" gain="0.9">
  <w-animate property="gain" from="0.9" to="0" start="345" end="385"></w-animate>
</w-audio>
<w-sequence from="74">  <!-- reveal beat starts at 78 -->
  <w-audio src="assets/whoosh.m4a" gain="0.55"></w-audio>
</w-sequence>
```

Levels that sit well: loudness-normalized music around `gain` 0.8–0.9, effects 0.3–0.6. Use CC0/CC-BY sources and keep a credits file; trim and normalize clips offline (`ffmpeg -af loudnorm`) rather than shipping full-length tracks.

## 3D product turntable

The canonical product shot: model spinning on a turntable, studio look,
caption stickers around it. Put the `<w-model>` directly under its sequence
(never nested inside a wrapper entity) so it composites as a live layer, and
put captions in a sibling wrapper:

```html
<w-sequence from="94" duration="70">
  <w-model src="assets/product.glb" x="-40" y="380" width="1160" height="1160"
           spin="150" rotation="18 30 -8" fov="28"
           lights="studio" environment="studio" tone-mapping="aces" shadow="0.35">
    <w-light type="directional" position="-4 2 -4" color="#ff2ea6" intensity="0">
      <w-animate property="intensity" from="0" to="4" start="14" end="34" easing="easeOutCubic"></w-animate>
    </w-light>
    <w-animate property="scale" from="1.4" to="1" start="0" end="8" easing="cubic-bezier(0.2, 1.4, 0.3, 1)"></w-animate>
  </w-model>
  <w-el x="0" y="0" width="1080" height="1920"><!-- stickers, captions --></w-el>
</w-sequence>
```

The looks, roughly: `lights="neutral"` is fine for stylized/toon models;
photoreal products want `lights="studio" environment="studio"
tone-mapping="aces"` (bright catalog) or `lights="dramatic"` with a colored
`<w-light>` rim (campaign mood). `shadow` grounds the object; without it the
model floats. `spin` of 120-170 deg/sec reads well at 30 fps; hard cuts
between different `rotation` angles every 20-24 frames make a montage.
Free models: Khronos glTF sample assets (credit CC-BY ones), Sketchfab
downloadable GLBs (check license; compressed files decode automatically).

## End card

```html
<w-sequence from="240">
  <w-el motion="beat-in" x="0" y="0" width="1280" height="720"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;">
    <div class="wordmark">webmotion</div>
    <div class="install">npm install @superhq/webmotion</div>
  </w-el>
</w-sequence>
```

Arbitrary HTML inside `<w-el>` renders and exports; flex layout is fine because it is frame-constant.

## Wiring preview + export in a page

```html
<w-composition id="film" width="1280" height="720" fps="30" duration="300" poster="80"></w-composition>
<button id="export">Export MP4</button>
<script type="module">
  import "@superhq/webmotion/elements";
  const comp = document.getElementById("film");
  document.getElementById("export").onclick = async () => {
    const blob = await comp.export({ onProgress: ({ frame, total }) => console.log(frame, "/", total) });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob), download: "film.mp4",
    });
    a.click();
  };
</script>
```

## Frame math cheat sheet (30 fps)

| Duration | Frames |
| --- | --- |
| Entrance | 15–20 |
| Exit | 10–12 |
| Hold (read a line) | 45–60 |
| Hold (hero shot) | 60–90 |
| Cross-beat gap | 6–10 |
| 10 s film | 300 |
