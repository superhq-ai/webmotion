---
description: Make a targeted change to an existing WebMotion scene and verify the result
argument-hint: [what to change, e.g. "slow the second beat and add an end card"]
---

Change the WebMotion scene in the working directory:

$ARGUMENTS

Use the `webmotion` skill for the authoring rules, and follow them even where
the existing scene does not.

## 1. Read before writing

Open the scene and work out how it is built: the beats and their labels, the
named animations in `<w-defs>`, the timing each beat depends on. If the request
is ambiguous about which beat or element it means, ask once. Otherwise proceed.

## 2. Make the change

Keep it targeted. Do not restyle, re-time, or reformat anything the request did
not ask about, and do not "improve" surrounding markup along the way. If you
believe something adjacent is broken, mention it afterwards instead of fixing
it unasked.

Timing changes ripple. `<w-sequence from>` offsets accumulate through nesting,
so lengthening a beat shifts everything after it unless the later beats are
positioned relative to it. Check the whole timeline still adds up, and update
the composition's `duration` when the end moves.

## 3. Verify what you touched

```bash
npx webmotion lint
npx webmotion shoot
```

Read the frames covering the beats you changed, and the beat on either side of
them: a timing edit usually breaks its neighbours rather than itself. Lint the
whole scene even so, since a tween conflict introduced in one beat is a
whole-timeline problem.

Narrow either tool to one beat while iterating:

```bash
npx webmotion lint --beat "Outro"
npx webmotion shoot --frames 120,135,150
```

## 4. Report

Say what changed, what the frames show, and anything the edit shifted that the
user did not explicitly ask for (a duration change, beats moving later).
