---
description: Render a WebMotion scene's key frames and critique it, changing nothing
argument-hint: [path to a scene entry, optional]
---

Review the WebMotion scene at `$ARGUMENTS` (or let the tools find it: they
default to `src/scene.js`, `scene.js`, or `index.html` in the working
directory).

**Change no files.** This is a read-only review. If the user wants the problems
fixed, that is `/webmotion:edit-scene`.

## Gather

```bash
npx webmotion lint
npx webmotion shoot
```

Read every PNG `shoot` writes. A review built only on the lint output is half a
review, because the failures that matter most (a beat that reads as empty, a
headline colliding with a logo, pacing that lurches) are visible and nothing
else surfaces them.

## Report

Lead with what works, briefly and specifically. Then the problems, worst first,
each one naming the frame or beat it happens in so the user can look at the
same thing you did. Separate the two kinds:

- **Mechanical**, straight from lint: these are defects, not opinions.
- **Craft**, from the frames: pacing, hierarchy, spacing, contrast, whether a
  beat earns its screen time. Say which are subjective.

Close with the two or three changes that would improve it most. Be direct about
weak work. A review that calls everything fine is worth nothing to someone
about to publish.

Consult the `webmotion` skill for what correct authoring looks like, especially
its pitfalls list, before calling something a defect.
