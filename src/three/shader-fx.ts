// <w-shader-fx>: a tweenable shader effect on a named material slot of the
// enclosing <w-model>. The framework ships NO effects: applications register
// their own in JavaScript (TSL node materials, onBeforeCompile injection,
// whatever fits) and the host handles the declarative side: slot targeting,
// per-instance material cloning, tween sampling, render-key invalidation,
// and teardown.
//
//   registerShaderEffect("digitize", ({ material, accent }) => {
//     const amount = uniform(0);
//     const t = uniform(0);
//     // ... author nodes with three/tsl, or mutate the material directly
//     return { update: (a, timeSec) => { amount.value = a; t.value = timeSec; } };
//   });
//
//   <w-shader-fx material="Front" effect="digitize" accent="#4db8ff">
//     <w-animate property="amount" from="1" to="0" start="0" end="42"></w-animate>
//   </w-shader-fx>
//
// The update hook receives time derived from the frame, so effects stay
// deterministic between live rendering and export.
import * as THREE from "three";
import { num } from "../elements/parse.js";
import { gatherTweens } from "../elements/registry.js";
import { readTween, sampleTween } from "../elements/tween.js";

export interface ShaderEffectContext {
  /** The per-instance clone of the targeted material slot. */
  material: THREE.Material;
  /** The mesh carrying the slot, for effects that need geometry context. */
  mesh: THREE.Mesh;
  /** Parsed accent color from the element. */
  accent: THREE.Color;
  /** The declaring element, for custom attributes. */
  el: HTMLElement;
}

export interface ShaderEffectInstance {
  /** Called per frame with the sampled amount and frame-derived seconds. */
  update(amount: number, timeSeconds: number): void;
  /** Optional teardown when the prop unmounts. */
  dispose?(): void;
}

export type ShaderEffectFactory = (ctx: ShaderEffectContext) => ShaderEffectInstance | null;

const effects = new Map<string, ShaderEffectFactory>();

/** Register an application-defined shader effect under a name. */
export function registerShaderEffect(name: string, factory: ShaderEffectFactory): void {
  effects.set(name, factory);
}

export class WShaderFx extends HTMLElement {
  private instance: ShaderEffectInstance | null = null;
  private baseAmount = 0;
  private restoreMaterial: (() => void) | null = null;

  connectedCallback(): void {
    this.style.display = "none";
  }

  /** Wired by the enclosing w-model once its scene exists. */
  wmAttach(root: THREE.Object3D): void {
    const slot = this.getAttribute("material");
    const effectName = this.getAttribute("effect") ?? "";
    const factory = effects.get(effectName);
    if (!factory) {
      console.warn(
        "[webmotion] <w-shader-fx> unknown effect (register it with registerShaderEffect):",
        effectName,
      );
      return;
    }
    if (!slot) {
      console.warn("[webmotion] <w-shader-fx> needs a material attribute");
      return;
    }

    let mesh: THREE.Mesh | null = null;
    let material: THREE.Material | null = null;
    root.traverse((node) => {
      if (material || !(node as THREE.Mesh).isMesh) return;
      const o = node as THREE.Mesh;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const i = mats.findIndex((m) => m && m.name === slot);
      if (i === -1) return;
      let m = mats[i] as THREE.Material;
      // One clone per instance per slot, shared with other slot systems
      // (material text); cloning again would drop their setup.
      if (!m.userData["wmCloned"]) {
        m = m.clone();
        m.name = slot;
        m.userData["wmCloned"] = true;
        if (Array.isArray(o.material)) o.material[i] = m;
        else o.material = m;
      }
      mesh = o;
      material = m;
    });
    if (!mesh || !material) {
      console.warn("[webmotion] <w-shader-fx> found no material named", slot);
      return;
    }

    this.baseAmount = num(this.getAttribute("amount"), 0);
    // Snapshot the slot before the factory runs: factories may swap the
    // mesh's material entirely (node materials), and a runtime-applied
    // effect must hand the slot back exactly as it found it on release.
    const snapshotMesh = mesh as THREE.Mesh;
    const snapshot = Array.isArray(snapshotMesh.material)
      ? [...snapshotMesh.material]
      : snapshotMesh.material;
    this.restoreMaterial = () => {
      snapshotMesh.material = Array.isArray(snapshot) ? [...snapshot] : snapshot;
    };
    this.instance = factory({
      material,
      mesh,
      accent: new THREE.Color(this.getAttribute("accent") ?? "#ffffff"),
      el: this,
    });
  }

  /**
   * Sample tweens and update the effect for the frame. Returns a key
   * fragment; a non-zero amount keys on the frame so the effect animates
   * every tick.
   */
  wmFxFrame(frame: number, fps: number): string {
    if (!this.instance) return "";
    let amount = this.baseAmount;
    for (const tween of gatherTweens(this)) {
      const data = readTween(tween);
      if (data.property === "amount") amount = sampleTween(data, frame);
    }
    this.instance.update(amount, frame / fps);
    return amount > 0.001 ? `fx${amount.toFixed(3)}@${frame.toFixed(2)}` : "fx0";
  }

  wmRelease(): void {
    this.instance?.dispose?.();
    this.instance = null;
    this.restoreMaterial?.();
    this.restoreMaterial = null;
  }
}

export function defineShaderFxElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-shader-fx")) customElements.define("w-shader-fx", WShaderFx);
}
