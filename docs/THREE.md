# 3D models

`<w-model>` puts an animated glTF/GLB model in a composition, rendered with
three.js. It is an entity like `<w-text>` or `<w-rect>`: it takes the same
`x`/`y`/`width`/`height` box, participates in sequences, and accepts
`<w-animate>` tweens. Its animation clip is driven by the frame clock
(`AnimationMixer.setTime`, never a wall clock), so preview and export are
deterministic like everything else. Exporting the same composition twice
produces byte-identical video.

## Setup

three.js is an optional peer dependency; only compositions that use 3D pay
for it.

```bash
npm install three
```

```js
import "@superhq/webmotion/elements";
import "@superhq/webmotion/three"; // registers <w-model>
```

## Usage

```html
<w-composition width="1280" height="720" fps="30" duration="300">
  <w-sequence from="0" duration="150">
    <w-model src="assets/fox.glb" animation="Run" speed="1.2"
             x="390" y="110" width="500" height="440">
      <w-animate property="x" from="-260" to="820" start="0" end="150"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="0" end="12"></w-animate>
    </w-model>
  </w-sequence>
</w-composition>
```

## Attributes

| Attribute | Meaning | Default |
| --- | --- | --- |
| `src` | glTF/GLB url, resolved against the document base | required |
| `animation` | clip name (`THREE.AnimationClip` name in the file) | first clip |
| `animation-from` | sequence-local frame where the clip starts | `0` |
| `speed` | playback rate multiplier | `1` |
| `loop` | `"false"` clamps at the last clip frame instead of wrapping | loops |
| `rotation` | `"x y z"` static orientation in degrees, about the model center | `0 0 0` |
| `spin` | turntable rotation around Y in degrees per second, frame-driven | `0` |
| `lights` | preset rig: `neutral`, `studio`, `dramatic`, `flat`, `none` | `neutral` |
| `environment` | `studio` (built-in room, no download) or `url(file.hdr)` | none |
| `environment-intensity` | environment contribution multiplier | `1` |
| `shadow` | contact-shadow opacity on an invisible floor at the model's feet | off |
| `tone-mapping` | `none`, `linear`, `reinhard`, `cineon`, `aces`, `agx`, `neutral` | `none` |
| `exposure` | tone-mapping exposure | `1` |
| `camera` | `"x y z"` camera position | fits the model |
| `look-at` | `"x y z"` camera target | model center |
| `fov` | vertical field of view in degrees | `35` |
| `background` | scene background color | transparent |

With no `camera` attribute the camera frames the model's bounding sphere at
load, so a model drops in without tuning.

## Lights

Presets cover most shots. For art direction, put `<w-light>` children inside
the model and set `lights="none"` (or mix with a preset). Numeric properties
are tweenable with `<w-animate>`, sampled per frame like any other tween:

```html
<w-model src="shoe.glb" lights="none" tone-mapping="aces">
  <w-light type="spot" position="3 5 2" intensity="900" angle="35"></w-light>
  <w-light type="directional" position="-4 2 -4" color="#ff2ea6" intensity="0">
    <w-animate property="intensity" from="0" to="4" start="14" end="34"></w-animate>
  </w-light>
</w-model>
```

`type` is `ambient`, `hemisphere`, `directional`, `point`, or `spot`. Static
attributes: `color`, `ground-color` (hemisphere), `position`, `intensity`,
`angle`, `penumbra`, `distance`, `decay`. Tweenable properties: `intensity`,
`x`, `y`, `z`, `angle`, `penumbra`, `distance`.

## Compressed files

DRACO geometry, KTX2/Basis textures, and Meshopt buffers all decode out of
the box. The DRACO and Basis WASM decoders load from a CDN pinned to the
running three revision by default; to self-host, serve the binaries shipped
in this package under `dist/three/decoders/` and point the loaders at them:

```js
import { configureModelLoaders } from "@superhq/webmotion/three";
configureModelLoaders({ dracoPath: "/decoders/draco/", ktx2Path: "/decoders/basis/" });
```

## Shader effects

`<w-shader-fx>` puts an application-defined shader effect on a named material
slot of the enclosing model. The framework ships no effects; it hosts them.
Register one in JavaScript, then declare it and tween its `amount`:

```js
import { registerShaderEffect } from "@superhq/webmotion/three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { uniform, uv, floor, fract, sin, dot, mix, output, smoothstep, vec2, vec4 } from "three/tsl";

registerShaderEffect("dissolve", ({ material, mesh, accent }) => {
  const nodeMat = new MeshStandardNodeMaterial();
  nodeMat.copy(material);
  const amount = uniform(0);
  const accentColor = uniform(accent);
  const cell = fract(sin(dot(floor(uv().mul(30)), vec2(12.9898, 78.233))).mul(43758.5453));
  const lit = smoothstep(cell.sub(0.05), cell.add(0.05), amount);
  nodeMat.outputNode = vec4(mix(output.rgb, accentColor, lit), output.a);
  mesh.material = nodeMat;
  return {
    update(a, timeSeconds) { amount.value = a; },
    dispose() { nodeMat.dispose(); },
  };
});
```

```html
<w-model src="jersey.glb">
  <w-shader-fx material="Front" effect="dissolve" accent="#4db8ff">
    <w-animate property="amount" from="1" to="0" start="0" end="42"></w-animate>
  </w-shader-fx>
</w-model>
```

The factory receives `{ material, mesh, accent, el }`: the per-instance clone
of the targeted slot, the mesh carrying it, the parsed `accent` color, and the
declaring element for custom attributes. It returns `{ update, dispose? }`.
`update(amount, timeSeconds)` runs per frame with the sampled `amount` tween
and seconds derived from the frame clock, never a wall clock, so live playback
and export produce the same pixels.

Author the effect however three allows: TSL node materials (shown above,
compiled to WGSL on WebGPU and GLSL on the fallback), a direct material
mutation, or a full material swap. The host takes care of slot targeting by
material name, one-clone-per-instance sharing with `<w-material-text>`, tween
sampling, render-key invalidation while the effect is active, and calling
`dispose` on teardown.

## One renderer for everything

All models share a single three `WebGPURenderer`: WGSL through WebGPU where
the browser has it, the WebGL2 backend otherwise, the same node materials
either way. Each element's scene renders into a hidden scratch surface and is
blitted to that element's own 2D canvas when the async render resolves;
passes are serialized so renderer-global state (viewport, clear color, tone
mapping) never interleaves. Twenty models cost one device, models loaded from
the same url share geometry and texture memory, and device loss recovers
centrally (every model re-renders on the fresh device on its next frame).

## How export works

During export the element is a live layer: its canvas is captured per frame
with `createImageBitmap` and composited into the output, while transform and
opacity tweens are applied at composite time by the layer compositor (see
[ARCHITECTURE.md](./ARCHITECTURE.md)). A slide, fade, spin, or zoom of the
model therefore costs one canvas draw, and the 3D scene only re-renders when
its clip time actually changes.

Custom imperative elements can join the same machinery by implementing two
methods: `wmApplyFrame(ctx)` (called by the frame walk with the
sequence-local frame; draw deterministically from `ctx.frame`) and
`wmLiveCanvas()` (return the canvas to capture). An element that loads assets
asynchronously should also expose a `wmReady` promise; export waits for it.
An element that renders asynchronously, as `<w-model>` does on WebGPU, can
expose `wmAwaitFrame()` returning a promise for the in-flight render; export
awaits it before capturing, so the canvas always holds the requested frame.

## Determinism note

Clip time is a pure function of the frame, so renders are reproducible. One
nuance: GPU rasterization (anti-aliasing in particular) can vary at the
least-significant-bit level between runs on the same machine, and between the
WebGPU and WebGL2 backends. Exports with 3D layers are visually identical
across runs (SSIM above 0.99999) but, unlike the DOM-only path, not
guaranteed byte-identical.

## Limitations

- Default decoder paths for DRACO/KTX2 fetch from a CDN on first use; fully
  offline setups must self-host via `configureModelLoaders`.
- Contact shadow needs at least one directional light in the rig.
