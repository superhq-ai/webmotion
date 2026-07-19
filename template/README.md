# My WebMotion video

A starter for making videos with [WebMotion](https://github.com/superhq-ai/webmotion): browser-native, deterministic video composition. Author your scene as markup, preview it with a scrub bar and play controls, and export a real MP4 from the browser. No headless Chrome, no FFmpeg, no render farm.

## Quick start

```bash
npm install
npm run dev
```

The dev server opens a live preview built on `<w-player>`, WebMotion's standard transport: play/pause, a zoomable scrub timeline with section labels and an audio lane, volume and mute, fullscreen, keyboard control (space, arrows to step frames, `m`, `f`, `+`/`-`), and an **Export MP4** button.

## Make it yours

Everything you author lives in [`src/scene.js`](./src/scene.js):

- `config` sets `width`, `height`, `fps`, `duration` (in frames), the background, and the export file name. Scrub-bar section labels come from `label="..."` on the top-level `<w-sequence>` beats.
- `scene` is the markup: a `<style>` block for the frame-constant look plus `<w-*>` elements and `<w-animate>` tweens for anything that moves.

Audio rides the same timeline. The starter plays `public/ambient.m4a` (a `<w-audio>` clip in the scene) and it shows up on the audio lane under the scrub bar and in the exported MP4. Swap the file for your own soundtrack or voiceover, or delete the `<w-audio>` block. Drop extra assets (images, more audio) in `public/` and reference them by name.

Save the file and the preview reloads instantly. You rarely need to touch `src/player.js` (the preview and export UI) or `src/main.js`.

The one rule that keeps preview and export pixel-identical: **everything visible is a pure function of the current frame.** Never read `Date.now()`, `Math.random()`, or wall-clock time. Derive every value from the frame index through `<w-animate>`.

## Check it without scrubbing

Two commands render the scene and tell you about it, which is faster than hunting for a bad frame by hand and works well when an AI agent is doing the editing:

```bash
npm install --save-dev playwright   # once; it drives your installed Chrome
npx webmotion lint                  # what is mechanically wrong
npx webmotion shoot                 # PNGs of the key frames, into .webmotion/shots
```

`lint` catches things that are easy to miss and expensive to ship: two tweens fighting over one property, text overflowing its box, an element that never makes it into the frame, a missing asset, a beat where nothing moves. `shoot` writes one image per key frame, picked from the `label="..."` beats in your scene, so put labels on your top-level `<w-sequence>` beats and you get a contact sheet of the cut for free.

Narrow either one while you iterate:

```bash
npx webmotion lint --beat "Outro"
npx webmotion shoot --frames 120,135,150
```

Full rule reference: [CLI.md](https://github.com/superhq-ai/webmotion/blob/main/docs/CLI.md).

## Export notes

Preview works in any modern browser. **MP4 export needs a Chromium-based browser** (WebCodecs H.264 and `OffscreenCanvas`). The exported file downloads with the name set by `config.downloadName`.

## Build a static site

```bash
npm run build      # outputs to dist/
npm run preview    # serve the build locally
```

## Learn the format

- Elements, motion, and styling reference: the [WebMotion README](https://github.com/superhq-ai/webmotion) and the specs under `docs/` (motion, template, audio, architecture).
- Using an AI coding agent? Install the WebMotion skill and ask it for a scene:

  ```bash
  npx skills add superhq-ai/webmotion
  ```

  Then: "make me a 10 second launch film for X" and paste the result into `src/scene.js`.
