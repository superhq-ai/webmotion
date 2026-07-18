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
  private cssW = 300;
  private cssH = 300;
  private dpr = 1;
  private backgroundColor: THREE.Color | null = null;
  private declaredLights: DeclaredLight[] = [];
  private toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  private exposure = 1;
  private shadowOpacity = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    sharedRenderer.acquire();
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.cssText = "display:block;width:100%;height:100%;";
      this.appendChild(this.canvas);
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

    // Declarative lights sample their tweens here; their state joins the
    // render key so an animated light re-renders a static model correctly.
    let lightsKey = "";
    for (const decl of this.declaredLights) {
      lightsKey += applyLightFrame(decl, ctx.frame) + "|";
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

  private renderPass(): void {
    if (!this.scene || !this.camera || !this.ctx2d) return;
    sharedRenderer.renderInto(this.scene, this.camera, this.ctx2d, {
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

    this.wmReady = loadGLTF(new URL(src, document.baseURI).href)
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
    const box = new THREE.Box3().setFromObject(model.scene);
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
    const fov = num(this.getAttribute("fov"), 35);
    const aspect = this.cssW / this.cssH;
    const distance = (sphere.radius * 1.35) / Math.tan((fov * Math.PI) / 360);

    this.camera = new THREE.PerspectiveCamera(fov, aspect, sphere.radius / 100, distance * 20);
    const camPos = parseVec3(this.getAttribute("camera"));
    this.camera.position.copy(camPos ?? new THREE.Vector3(0, sphere.radius * 0.15, distance));
    this.camera.lookAt(parseVec3(this.getAttribute("look-at")) ?? new THREE.Vector3(0, 0, 0));

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
