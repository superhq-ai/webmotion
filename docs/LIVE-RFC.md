# RFC: live rendering mode

Status: accepted. Phase 1 in progress.

WebMotion today renders a bounded timeline to an encoded file. This RFC adds
a second target: an unbounded, event-driven, real-time scene on a visible
page, for overlay products (the driving consumer is a livestream
donation/alerts platform whose pages run inside OBS browser sources). The
governing constraint: **one prop definition renders both live and to a
file.** Live means continuous rendering of the page; WebMotion never
encodes or transmits in the live path.

## Design principles

1. **One extension surface.** Elements integrate through a small protocol,
   never through core edits. The full contract:

   | Protocol | Caller | Purpose |
   | --- | --- | --- |
   | `wmApplyFrame(ctx)` | frame walk | deterministic per-frame behavior |
   | `wmReady` | export, preload | asset readiness promise |
   | `wmLiveCanvas()` | export compositor | capture surface for non-DOM pixels |
   | `wmAwaitFrame(ctx)` | export loop only | async settle for frame-exact media (video) |
   | `wmBind(data)` | live runtime | receive or refresh runtime data |
   | `wmRelease()` | unmount | resource teardown beyond disconnect |

   Inert tags (never walked as entities) are a registry
   (`registerInertTag`), not a hardcoded list; optional packages register
   their own.

2. **One ticker, many local timelines.** A Ticker produces time: the rAF
   ticker for live, the export loop for files, a fake ticker for tests.
   Each mounted prop is a timeline instance mapping ticker time to its own
   local frame 0. Export is the degenerate case: one bounded instance.
   `wmApplyFrame` cannot tell which world it is in; that is what makes
   "author once, render both" hold by construction.

3. **Live is DOM-native; props are subtrees.** The page is the output (OBS
   captures the page; CEF composites with transparency). A triggered prop
   is an expanded template mounted as an independent subtree. Concurrency,
   isolation, transparency, and teardown are structural:
   - Concurrent props render simultaneously as siblings. No queue across
     different props.
   - A prop that throws during its frame is unmounted to nothing; other
     props and the stage survive. Nothing intended-invisible ever paints.
   - Idle cost is zero: the ticker runs only while instances are mounted
     (or transitions settling). No instances, no rAF, static DOM.

## Prop model

A prop is markup, registered three ways that converge on one parser:
inline `<w-prop name="jersey" fps="30" duration="180">` template elements,
`registerProp(name, html)` from JS, or `registerPropUrl(name, url)`
fetching the same fragment from a server. Props reference their assets
(GLB models, images, audio) by URL; `preload()` resolves every `wmReady`
in a hidden mount and renders one frame so shader compilation and texture
upload happen before any trigger.

Lifecycle:

- `trigger(name, data, opts)` expands the template with `data` (the
  existing `<w-for>`/`{expr}` machinery), mounts it, and runs its local
  timeline. One-shots unmount at `duration`; `persistent` props stay.
- Re-triggering an active one-shot coalesces at depth 1: the running
  instance finishes, then the latest pending data plays. `mode:
  "restart"` opts into unmount-and-replay.
- `update(name, data)` refreshes a persistent prop without remount by
  calling `wmBind` down its subtree. Declarative bindings
  (`<w-bind property source transition>`: tween current value to new
  value on data change) land in phase 2; `w-animate` stays timeline-only.

## Time discipline

Live code takes time exclusively from the ticker through `ctx.frame`.
Nothing in a prop may read the wall clock. Consequence: a log of
`{name, data, tickTime}` trigger events replays deterministically against
an export clock, which makes "export a clip of the live moment" a replay,
not a second implementation. This discipline costs nothing now and cannot
be retrofitted later.

## Untrusted data

Runtime data (donor names, messages) is hostile by assumption: arbitrary
length, arbitrary script, adversarial content. Text lands via text nodes
or canvas rendering, never markup interpolation into HTML. Phase 2 adds
material-slot text for models (offscreen canvas to texture: injection-safe
by construction) with length caps, fit-to-box scaling, and font fallback.

## Shader effects

Product-specific looks (a donation alert's glitch materialization, a brand
glow) live in application code, not in the framework. The `three` entry
exposes `registerShaderEffect(name, factory)`; `<w-shader-fx material
effect accent>` inside a `w-model` targets a material slot, samples its
`amount` tween per frame, and hands the factory's instance frame-derived
time. Effects are authored in JavaScript with three's TSL nodes, which
compile to WGSL on WebGPU and GLSL on the WebGL2 fallback; the shared
renderer is three's `WebGPURenderer`, so node materials work everywhere
the framework runs. The framework ships no effects.

## Runtime effects

A mounted prop can take effect fragments while it runs:
`applyEffect(name, fragment, options)` mounts fragment roots onto the
running instance: `w-shader-fx` roots wire to the prop's first
`w-model`, everything else (positioned `w-el` overlays, `w-animate`
roots) mounts on `options.target` (default: the prop root). It
substitutes `options.params` through the same injection-safe
path trigger data takes, and returns a handle. Tween frames in a
fragment are authored relative to the effect's own start; the stage
offsets them onto the prop's clock at apply, so a fragment is one
artifact regardless of when it fires.

- `mode: "burst"` (default) unmounts the effect after `frames`;
  `mode: "toggle"` holds until `clearEffect(name, handle)`.
- Re-applying an explicit `id` replaces that run instead of stacking.
- `clearEffect(name)` with no handle clears every effect on the prop;
  teardown of the prop releases effects with everything else.

Two contracts make this safe on a long-lived stage: `w-model` adopts
late-added `w-shader-fx` into its live scene (`wmAdoptFx`/`wmDropFx`)
and re-keys its render, and `w-shader-fx` snapshots its material slot
before the factory runs, restoring it on release, so an effect always
hands the mesh back exactly as it found it.

## Behaviors

`<w-behavior name="...">` is the slot where application code runs
against the prop clock: the framework ships no behaviors, exactly as it
ships no shader effects. `registerPropBehavior(name, factory)` (from
`elements`) registers a factory that receives the element as its host
and returns `{ frame?(frame, timeSeconds, amount), dispose?() }`. The
element samples its `amount` tween per frame like `w-shader-fx`, so
entrances and exits ride the prop timeline while the behavior owns its
pixels (a GL canvas, particles, whatever fits). A behavior that throws
is dropped and its host cleared; the prop and the stage survive. In the
pack model this is the Tier-2 seam: signed behavior modules register
names, templates and effect fragments reference them declaratively.

## Package layout

- `@superhq/webmotion/live` (new): `LiveStage`, `RafTicker`, `w-prop`.
  No new dependencies.
- `elements` gains `w-bind` (phase 2) and `w-video` (phase 3); `three`
  gains material-slot text and video textures. Camera/screen capture is
  a later `MediaStream` source behind the same protocols; nothing more is
  designed for it now, and nothing blocks it.

## Phases

1. Live runtime: ticker, prop registry, trigger/coalesce/persistent,
   preload, idle gating, fail-to-nothing, overlay demo.
2. Runtime binding: `w-bind`, `update()` tweening, material-slot text with
   sanitization.
3. Video (`w-video` layer via the live-canvas protocol, frame-exact export
   seeking via WebCodecs, video textures), then validation: soak test
   (hours idle plus sporadic triggers, flat heap, no GL leaks), live
   context-loss recovery, p99 frame time during triggers.
