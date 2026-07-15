# My WebMotion video

A starter for making videos with [WebMotion](https://github.com/superhq-ai/webmotion): browser-native, deterministic video composition. Author your scene as markup, preview it with a scrub bar and play controls, and export a real MP4 from the browser. No headless Chrome, no FFmpeg, no render farm.

## Quick start

```bash
npm install
npm run dev
```

The dev server opens a live preview with play/pause, a scrub track, and an **Export MP4** button.

## Make it yours

Everything you author lives in [`src/scene.js`](./src/scene.js):

- `config` sets `width`, `height`, `fps`, `duration` (in frames), the background, and the export file name. Scrub-bar section labels come from `label="..."` on the top-level `<w-sequence>` beats.
- `scene` is the markup: a `<style>` block for the frame-constant look plus `<w-*>` elements and `<w-animate>` tweens for anything that moves.

Audio rides the same timeline. The starter plays `public/ambient.m4a` (a `<w-audio>` clip in the scene) and it shows up on the audio lane under the scrub bar and in the exported MP4. Swap the file for your own soundtrack or voiceover, or delete the `<w-audio>` block. Drop extra assets (images, more audio) in `public/` and reference them by name.

Save the file and the preview reloads instantly. You rarely need to touch `src/player.js` (the preview and export UI) or `src/main.js`.

The one rule that keeps preview and export pixel-identical: **everything visible is a pure function of the current frame.** Never read `Date.now()`, `Math.random()`, or wall-clock time. Derive every value from the frame index through `<w-animate>`.

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
