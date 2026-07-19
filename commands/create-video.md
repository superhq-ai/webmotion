---
description: Author a WebMotion video from a brief, then check the rendered frames
argument-hint: [what the video is for, plus any length, aspect, or brand notes]
---

Create a WebMotion video for this brief:

$ARGUMENTS

Use the `webmotion` skill for every authoring decision. Its rules are not
optional: everything visible is a pure function of the frame, stagger comes
from structure rather than delay parameters, and frame-constant styling belongs
in CSS while only frame-varying values become tweens.

## 1. Settle the brief

Ask at most one round of questions, and only about things the brief leaves open
that would change what you build: duration and aspect, the copy itself, brand
colours, and whether there are assets (a logo, imagery, a soundtrack) to work
from. If the brief already answers something, do not ask about it. Never ask
more than three questions, and never ask a second round.

## 2. Find or create the project

- An existing scene in the working directory (`src/scene.js`, `scene.js`, or an
  HTML page holding a `<w-composition>`): work in it.
- Nothing yet: scaffold the starter, which ships a live preview, a scrub
  timeline, and an export button.

```bash
npx degit superhq-ai/webmotion/template <name> && cd <name> && npm install
```

Tell the user which one you did before you start writing.

## 3. Author the scene

Write the scene as `<w-*>` markup. Put a `label="..."` on every top-level
`<w-sequence>` beat: the labels name the sections on the scrub bar, and both
tools below key their sampling off them, so an unlabelled scene reviews badly.

Pace it. The skill's `references/recipes.md` carries the craft guidance for
entrances, holds, and end cards; a beat that flashes past unread is a defect
even when nothing errors.

## 4. Check it

Run both, in this order:

```bash
npx webmotion lint
npx webmotion shoot
```

`lint` reports what is mechanically wrong: tweens fighting over a property,
text overflowing its box, an entity outside the frame, an asset that will
export as a hole, a beat where nothing moves. Fix every error it reports, and
every warning you agree with.

`shoot` writes a PNG per key frame into `.webmotion/shots` and prints the
paths. **Read the images.** They are the only way to see what you built. Judge
composition, spacing, and whether each beat reads at a glance, then say plainly
what you think is weak.

## 5. Iterate, then hand over

Revise and re-check. Stop after two rounds even if it is not perfect, and say
what you would change next.

Finish by telling the user to run `npm run dev` to watch it play, scrub the
timeline, and export an MP4 from the browser. Export is theirs to press: it
needs a Chromium-based browser and it lands as a real file in their downloads.

Never introduce `Date.now()`, `Math.random()`, wall-clock time, or CSS
transitions and animations into a scene. Each of them breaks determinism, and
the export smears because the encoder seeks frames faster than wall time.
