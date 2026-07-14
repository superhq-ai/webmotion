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
- **Stagger by 6–10 frames**, not 2 (reads as jitter) or 20 (reads as separate events).

## Staged typography (beat in, beat out)

**The nesting rule:** two tweens on the same property of one element fight — outside its window a tween still writes its clamped boundary value, and the last one wins, so an exit tween would hold opacity at 1 during the entrance. Put entrance and exit on different nesting levels instead: opacity and transforms compose multiplicatively through the tree.

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

## Feature-line stagger

```html
<w-sequence from="150" duration="90">
  <w-sequence from="0"><w-text class="feature" motion="beat-in" x="0" y="270" width="1280">Deterministic.</w-text></w-sequence>
  <w-sequence from="9"><w-text class="feature" motion="beat-in" x="0" y="350" width="1280">Browser-native.</w-text></w-sequence>
  <w-sequence from="18"><w-text class="feature" motion="beat-in" x="0" y="430" width="1280">No render farm.</w-text></w-sequence>
</w-sequence>
```

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
