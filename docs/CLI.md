# Command line

How `webmotion shoot` and `webmotion lint` see a scene, and what every lint rule means. Both exist for one reason: whoever is iterating on a video, a person in a hurry or an agent with no eyes, needs to know what the frames actually look like without opening a browser and scrubbing by hand.

## Principles

1. **The page gathers facts, Node applies judgement.** The browser half (`cli/browser/api.ts`) reports where every entity sits, what it looks like, and what the document says about fonts and assets. It decides nothing. Rules (`cli/rules.ts`) are pure functions over those facts, which is why they are unit-tested without a browser.
2. **Sampling follows the scene's own structure.** Frames come from `label="..."` on `<w-sequence>` beats, the same labels the player turns into a chapter rail. There is no separate list of interesting frames to declare or keep in sync.
3. **No pixels.** Nothing rasterizes. Motion is judged by whether the DOM state changes across a beat, which is both faster than diffing images and closer to what "nothing happens here" actually means.
4. **A finding has to be actionable.** Every rule names the element, the frame, and what to do. A rule that fires on working scenes is worse than no rule, so several deliberately trade recall for precision (see the notes below).

## Running

```bash
npx webmotion shoot          # PNGs of key frames, into .webmotion/shots
npx webmotion lint           # findings, as text
```

Both resolve a scene entry in this order unless you pass one: `src/scene.js`, `scene.js`, `src/scene.mjs`, `index.html`. Two entry shapes work:

| Entry | Shape |
| --- | --- |
| `.js` / `.mjs` | A module exporting `config` (`width`, `height`, `fps`, `duration`, `background`) and `scene`, a string of `<w-*>` markup. This is the starter's `src/scene.js`. |
| `.html` | A page containing a `<w-composition>`. Loaded as-is, with an import map injected so bare specifiers resolve. |

The scene is served over http from the project root, not `file://`, so relative asset paths, module imports, and the same-origin rules the exporter depends on all behave exactly as they do under the dev server.

### Options

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--frames <spec>` | shoot | `auto` (default) or an explicit list, `0,45,120`. Out-of-range values clamp. |
| `--out <dir>` | shoot | Output directory, default `.webmotion/shots`. |
| `--scale <n>` | shoot | Screenshot pixel density, default 1 (composition pixels). |
| `--beat <label>` | lint | Only check frames inside that beat. |
| `--json` | both | Machine-readable output. |
| `--verbose` | both | Stream the page's console, for a scene that will not boot. |

`lint` exits non-zero when it finds an error, so it works in CI. `shoot` also writes an `index.json` mapping every frame to its beat label and file.

### Requirements

Playwright, as an optional peer dependency:

```bash
npm install --save-dev playwright
```

It launches your installed Chrome (`channel: "chrome"`) and falls back to a downloaded Chromium. Export needs a Chromium-based browser anyway, so this adds nothing to the ask.

## Frame selection

`--frames auto` picks the first frame, the last frame, and the start, midpoint, and final frame of every top-level labelled beat. The opening frame catches an entrance that never fires, the midpoint catches the settled composition, the last frame catches an exit that lands late. A scene with no labelled beats falls back to an even spread of eight.

Beat labels are how both tools know where to look. **Label your top-level beats**; an unlabelled scene reviews badly.

## Rules

| Rule | Severity | Fires when | Fix |
| --- | --- | --- | --- |
| `tween-conflict` | error | Two or more tweens target the same property of the same element, whether from `motion="..."` or inline `<w-animate>` children. | Split entrance and exit across nesting levels: the wrapper `<w-el>` owns the exit, the inner element owns the entrance. Clamped values still write, so these fight across the whole timeline, not just where the windows overlap. |
| `missing-asset` | error | The scene requested a file that does not exist. | Fix the path. It renders as a hole in both preview and export. |
| `foreign-asset` | error | An image or model is cross-origin. | Serve it same-origin or make it CORS-readable. The export rasterizer inlines assets and cannot read this one. |
| `out-of-bounds` | error | An entity is never fully inside the frame at any sampled frame it is visible at. | Reposition it. Requiring *every* frame to be clipped is deliberate: an element sliding in from off-screen is normal, so only one that never arrives is reported. |
| `text-overflow` | error | A `<w-text>` overflows its own box by more than 2px. | Widen the box, shorten the copy, or drop the font size. Applies only to text; a couple of pixels of inline slack under an image is not a defect. |
| `font-pending` | error | A declared `@font-face` never finished loading. | Wait on `document.fonts.ready` before exporting. The first frames otherwise render in a fallback face. |
| `page-error` | error | The page threw. | Read the message; the scene is broken. |
| `dead-beat` | warn | A labelled beat of 10+ frames where no entity's transform, opacity, box, or text changes across five sampled frames. | Give it motion or shorten it. Beats under 10 frames are exempt: a held cut is a choice. |
| `blank-frame` | warn | A sampled frame where nothing is visible but the background. | Usually a beat that starts later than you think, or an entrance tween that begins at the wrong frame. |
| `low-contrast` | warn | Text at full opacity whose contrast against its backdrop is under 4.5:1 (3:1 at 24px and above). | Adjust the colour. Mid-fade frames are exempt, since faint is the point there. |
| `font-unresolved` | warn | Nothing in a font stack resolves and the stack has no generic fallback. | Add `sans-serif` or load the face. A stack naming faces for other platforms is doing its job, so only a stack that resolves to *nothing* is reported. |

### On the two approximations

**Backdrop detection** walks earlier siblings and ancestors for the topmost opaque background whose box covers the text, falling back to the composition background. It is not a pixel sample, so text over a gradient or an image is judged against whatever solid colour sits behind it. It reliably catches the case that matters: light text dropped onto a light panel.

**Font resolution** measures text width against two metrically different fallbacks rather than asking `document.fonts.check()`, which assumes any family it has no `FontFace` for is an installed system font and so answers `true` for names that do not exist.

## Adding a rule

Rules take the gathered facts and return findings:

```ts
function myRule(input: LintInput): Finding[] {
  // input.info, input.facts, input.probes (frame -> entities), input.beatFrames
}
```

Add it to the `RULES` array in `cli/rules.ts` and a case to `cli/rules.test.ts`. If it needs something the page does not yet report, extend `EntitySnapshot` or `SceneFacts` in `cli/browser/api.ts`; that file gathers, it never judges.
