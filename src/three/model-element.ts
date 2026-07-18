// <w-model>: a 3D entity. Loads a glTF/GLB model (parsed once per url, cloned
// per element), renders it through the page-wide shared WebGL context into an
// inline 2D canvas, and drives its animation clip as a pure function of the
// sequence-local frame (AnimationMixer.setTime, never a clock), so preview
// and export are deterministic like every other entity. Transform and opacity
// tweens on the element behave exactly as on 2D entities: during export the
// compositor applies them to the layer, so the scene is never re-rendered for
// a slide, fade, spin, or zoom.
import * as THREE from "three";
import { WEntity } from "../elements/elements.js";
import type { FrameContext } from "../elements/registry.js";
import { num } from "../elements/parse.js";
import { sharedRenderer } from "./shared-renderer.js";
import { loadGLTF, instantiate } from "./model-cache.js";
import {
  applyLightFrame,
  buildContactShadow,
  buildPreset,
  createDeclaredLight,
  resolveEnvironment,
  resolveToneMapping,
  type DeclaredLight,
} from "./lighting.js";

// The clip time for a sequence-local frame. Pure so it can be unit tested:
// `from` is the frame where the clip starts, `speed` scales playback, and
// looping wraps on the clip duration.
export function clipTimeAt(
  frame: number,
  fps: number,
  opts: { from: number; speed: number; loop: boolean; duration: number },
): number {
  const t = Math.max(0, ((frame - opts.from) / fps) * opts.speed);
  if (opts.duration <= 0) return 0;
  if (opts.loop) return t % opts.duration;
  return Math.min(t, opts.duration);
}

// Bounds for camera framing. Box3.setFromObject reads bind-pose geometry
// boxes; on skinned meshes those interact badly with rigs that carry node
// scale (a Blender-style 100x rig makes the box frame a phantom a hundred
// times the visible character, which then renders as a speck). Rigid meshes
// use their geometry boxes in world space; skinned meshes are bounded by
// their bones' world positions, which trace the articulated character
// regardless of how the rig encodes scale. Padded because flesh extends
// past the last joint.
function computeModelBox(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const point = new THREE.Vector3();
  const seenBones = new Set<THREE.Bone>();
  let sawSkinned = false;

  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && o.skeleton) {
      sawSkinned = true;
      for (const bone of o.skeleton.bones) {
        if (seenBones.has(bone)) continue;
        seenBones.add(bone);
        point.setFromMatrixPosition(bone.matrixWorld);
        box.expandByPoint(point);
      }
    } else if (o instanceof THREE.Mesh) {
      const geom = o.geometry as THREE.BufferGeometry;
      if (!geom.boundingBox) geom.computeBoundingBox();
      if (geom.boundingBox) {
        tmp.copy(geom.boundingBox).applyMatrix4(o.matrixWorld);
        box.union(tmp);
      }
    }
  });

  if (box.isEmpty()) return box.setFromObject(root);
  if (sawSkinned) {
    // Joints sit inside the surface; grow by a slice of the diagonal.
    const pad = box.getSize(new THREE.Vector3()).length() * 0.06;
    box.expandByScalar(pad);
  }
  return box;
}

function parseVec3(value: string | null): THREE.Vector3 | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return new THREE.Vector3(parts[0], parts[1], parts[2]);
}

export class WModel extends WEntity {
  static override get observedAttributes(): string[] {
    return [...WEntity.observedAttributes, "src"];
  }

  /** Resolves when the model (and so the first meaningful frame) is loadable. */
  wmReady: Promise<void> = Promise.resolve();

  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  // The model is re-centered inside this pivot so `rotation` and `spin`
  // turn it about its own center, turntable style.
  private pivot: THREE.Group | null = null;
  private clipDuration = 0;
  private loadedSrc: string | null = null;
  private lastRenderKey = "";
  private pendingRender: Promise<void> = Promise.resolve();
  private cssW = 300;
  private cssH = 300;
  private dpr = 1;
  private backgroundColor: THREE.Color | null = null;
  private declaredLights: DeclaredLight[] = [];
  private fxEls: HTMLElement[] = [];
  private toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  private exposure = 1;
  private shadowOpacity = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    sharedRenderer.acquire();
    if (!this.canvas) {
      // Adopt a canvas child if one exists (a cloned element carries its
      // previous incarnation's canvas); setupScene resizes it.
      this.canvas = this.querySelector(":scope > canvas") ?? document.createElement("canvas");
      this.canvas.style.cssText = "display:block;width:100%;height:100%;";
      if (!this.canvas.parentElement) this.appendChild(this.canvas);
      this.ctx2d = this.canvas.getContext("2d");
    }
    this.load();
  }

  override attributeChangedCallback(): void {
    super.attributeChangedCallback();
    if (this.isConnected) this.load();
  }

  disconnectedCallback(): void {
    sharedRenderer.release();
    this.loadedSrc = null;
  }

  // Export integration: the compositor captures this canvas per frame instead
  // of rasterizing DOM, and the whole-stage fallback snapshots it as an image.
  wmLiveCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  // Called by the frame walk after tweens are applied. Renders only when the
  // resolved clip time, orientation, or GL context changed, so paused frames
  // are free.
  wmApplyFrame(ctx: FrameContext): void {
    if (!this.scene || !this.camera || !this.pivot) return;
    let time = 0;
    if (this.mixer) {
      time = clipTimeAt(ctx.frame, ctx.fps, {
        from: num(this.getAttribute("animation-from"), 0),
        speed: num(this.getAttribute("speed"), 1),
        loop: this.getAttribute("loop") !== "false",
        duration: this.clipDuration,
      });
    }

    // Static orientation plus a frame-driven turntable spin (degrees per
    // second around Y), both pure functions of the frame.
    const rot = parseVec3(this.getAttribute("rotation")) ?? new THREE.Vector3();
    const spin = num(this.getAttribute("spin"), 0);
    const yDeg = rot.y + spin * (ctx.frame / ctx.fps);

    // Declarative lights and shader effects sample their tweens here; their
    // state joins the render key so animation on them re-renders a static
    // model correctly.
    let lightsKey = "";
    for (const decl of this.declaredLights) {
      lightsKey += applyLightFrame(decl, ctx.frame) + "|";
    }
    for (const fx of this.fxEls) {
      const sample = (fx as { wmFxFrame?: (f: number, fps: number) => string }).wmFxFrame;
      if (typeof sample === "function") lightsKey += sample.call(fx, ctx.frame, ctx.fps) + "|";
    }

    const key =
      time + ":" + rot.x + ":" + yDeg + ":" + rot.z + ":" + lightsKey +
      ":g" + sharedRenderer.generation;
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    if (this.mixer) this.mixer.setTime(time);
    const toRad = Math.PI / 180;
    this.pivot.rotation.set(rot.x * toRad, yDeg * toRad, rot.z * toRad);
    this.renderPass();
  }

  /**
   * Async settle for frame-exact consumers: the export loop awaits this so
   * captures see the completed WebGPU render and blit.
   */
  wmAwaitFrame(): Promise<void> {
    return this.pendingRender;
  }

  private renderPass(): void {
    if (!this.scene || !this.camera || !this.ctx2d) return;
    this.pendingRender = sharedRenderer.renderInto(this.scene, this.camera, this.ctx2d, {
      width: this.cssW,
      height: this.cssH,
      dpr: this.dpr,
      background: this.backgroundColor,
      toneMapping: this.toneMapping,
      toneMappingExposure: this.exposure,
      shadows: this.shadowOpacity > 0,
    });
  }

  private load(): void {
    const src = this.getAttribute("src");
    if (!src || src === this.loadedSrc || !this.canvas) return;
    this.loadedSrc = src;

    this.wmReady = sharedRenderer
      .ready()
      .then(() => loadGLTF(new URL(src, document.baseURI).href))
      .then((gltf) => {
        if (this.loadedSrc !== src) return;
        this.setupScene(instantiate(gltf));
        return this.setupEnvironment();
      })
      .catch((e) => {
        console.warn("[webmotion] <w-model> failed to load", src, e);
      });
  }

  // Environment maps load after the scene exists; export waits on wmReady, so
  // the first captured frame always has its reflections.
  private async setupEnvironment(): Promise<void> {
    if (!this.scene) return;
    const tex = await resolveEnvironment(this.getAttribute("environment") ?? "none");
    if (!this.scene) return;
    if (tex) {
      this.scene.environment = tex;
      this.scene.environmentIntensity = num(this.getAttribute("environment-intensity"), 1);
    }
    this.lastRenderKey = "";
    this.renderPass();
  }

  private setupScene(model: { scene: THREE.Group; animations: THREE.AnimationClip[] }): void {
    if (!this.canvas) return;
    this.cssW = Math.max(1, num(this.getAttribute("width"), 300));
    this.cssH = Math.max(1, num(this.getAttribute("height"), 300));
    this.dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);

    this.scene = new THREE.Scene();
    const bg = this.getAttribute("background");
    this.backgroundColor = bg ? new THREE.Color(bg) : null;
    this.toneMapping = resolveToneMapping(this.getAttribute("tone-mapping"));
    this.exposure = num(this.getAttribute("exposure"), 1);
    this.shadowOpacity = Math.max(0, num(this.getAttribute("shadow"), 0));

    // Preset rig plus any declarative <w-light> children.
    const presetLights = buildPreset(this.getAttribute("lights"));
    for (const light of presetLights) this.scene.add(light);
    this.declaredLights = [];
    for (const el of Array.from(this.querySelectorAll<HTMLElement>(":scope > w-light"))) {
      const decl = createDeclaredLight(el);
      if (decl) {
        this.declaredLights.push(decl);
        this.scene.add(decl.light);
        if (decl.light instanceof THREE.SpotLight || decl.light instanceof THREE.DirectionalLight) {
          this.scene.add((decl.light as THREE.SpotLight | THREE.DirectionalLight).target);
        }
      }
    }

    // Re-center the model inside a pivot so rotation and spin turn it about
    // its own center regardless of where the file's origin sits.
    const box = computeModelBox(model.scene);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.pivot = new THREE.Group();
    model.scene.position.sub(center);
    this.pivot.add(model.scene);
    this.scene.add(this.pivot);

    // Contact shadow: the model casts onto an invisible plane at its feet,
    // which stays fixed while the pivot spins, like a real turntable floor.
    if (this.shadowOpacity > 0) {
      model.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      const allLights = [...presetLights, ...this.declaredLights.map((d) => d.light)];
      const ground = buildContactShadow(
        allLights,
        sphere.radius,
        box.min.y - center.y,
        this.shadowOpacity,
      );
      if (ground) this.scene.add(ground);
      else console.warn("[webmotion] <w-model> shadow needs a directional light in the rig");
    }

    // Frame the model: fit the bounding sphere unless camera/look-at say
    // otherwise. Computed once at load, so it stays constant across frames.
    // `fit` is the padding factor around the bounding sphere: 1.35 breathes,
    // ~1.0 fills the box edge to edge for tight product shots.
    const fov = num(this.getAttribute("fov"), 35);
    const fit = Math.max(0.5, num(this.getAttribute("fit"), 1.35));
    const aspect = this.cssW / this.cssH;
    const distance = (sphere.radius * fit) / Math.tan((fov * Math.PI) / 360);

    this.camera = new THREE.PerspectiveCamera(fov, aspect, sphere.radius / 100, distance * 20);
    const camPos = parseVec3(this.getAttribute("camera"));
    this.camera.position.copy(camPos ?? new THREE.Vector3(0, sphere.radius * 0.15, distance));
    this.camera.lookAt(parseVec3(this.getAttribute("look-at")) ?? new THREE.Vector3(0, 0, 0));

    // Material-text and shader-effect slots attach once the scene exists;
    // they clone their target materials (sharing one clone per slot) and can
    // invalidate the render key on data updates.
    for (const el of Array.from(
      this.querySelectorAll(":scope > w-material-text, :scope > w-shader-fx"),
    )) {
      const attach = (el as { wmAttach?: (root: THREE.Object3D, inv: () => void) => void })
        .wmAttach;
      if (typeof attach === "function") {
        attach.call(el, model.scene, () => {
          this.lastRenderKey = "";
        });
      }
    }
    this.fxEls = Array.from(this.querySelectorAll(":scope > w-shader-fx"));

    const clips = model.animations ?? [];
    const wanted = this.getAttribute("animation");
    const clip = wanted ? (THREE.AnimationClip.findByName(clips, wanted) ?? clips[0]) : clips[0];
    if (clip) {
      this.mixer = new THREE.AnimationMixer(model.scene);
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      this.clipDuration = clip.duration;
    }

    // First paint at rest pose so the model is visible before the first
    // frame walk reaches it.
    this.lastRenderKey = "";
    this.renderPass();
  }
}

export function defineModelElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-model")) customElements.define("w-model", WModel);
}
