// <w-behavior>: a slot where application code runs against the prop
// clock. The framework ships no behaviors, exactly as it ships no shader
// effects: an application (or a signed prop pack) registers factories
// under names, and templates or effect fragments reference them
// declaratively. The element owns the lifecycle; the factory owns the
// pixels.
//
//   registerPropBehavior("blade-fire", ({ host, el }) => {
//     const canvas = document.createElement("canvas");
//     host.appendChild(canvas);
//     // ... own a GL context, particles, whatever fits
//     return {
//       frame: (frame, timeSec, amount) => { /* render */ },
//       dispose: () => { /* release the context */ },
//     };
//   });
//
//   <w-el x="70" y="30" width="160" height="360">
//     <w-behavior name="blade-fire" accent="#7cc9ff">
//       <w-animate property="amount" from="0" to="1" start="0" end="18"></w-animate>
//     </w-behavior>
//   </w-el>
//
// Like <w-shader-fx>, the element samples its `amount` tween per frame
// and passes it to the instance, so entrances and exits ride the prop
// timeline while the behavior's own motion derives from frame time.
// A behavior that throws is dropped and its host cleared; the prop and
// the stage survive.
import { num } from "./parse.js";
import { gatherTweens } from "./registry.js";
import type { FrameContext } from "./registry.js";
import { readTween, sampleTween } from "./tween.js";

export interface PropBehaviorContext {
  /** The element's own box; behaviors create their DOM inside it. */
  host: HTMLElement;
  /** The declaring element, for custom attributes ({placeholders} are
   *  already substituted by the time the behavior mounts). */
  el: HTMLElement;
}

export interface PropBehaviorInstance {
  /** Called per frame with the prop-clock frame, frame-derived seconds,
   *  and the sampled `amount` tween (base attribute when untweened). */
  frame?(frame: number, timeSeconds: number, amount: number): void;
  /** Teardown when the prop or effect unmounts. */
  dispose?(): void;
}

export type PropBehaviorFactory = (ctx: PropBehaviorContext) => PropBehaviorInstance | null;

const behaviors = new Map<string, PropBehaviorFactory>();

/** Register an application-defined behavior under a name. */
export function registerPropBehavior(name: string, factory: PropBehaviorFactory): void {
  behaviors.set(name, factory);
}

export class WBehavior extends HTMLElement {
  private instance: PropBehaviorInstance | null = null;
  private started = false;
  private failed = false;

  connectedCallback(): void {
    this.style.position = "absolute";
    this.style.inset = "0";
    this.style.pointerEvents = "none";
  }

  private start(): void {
    this.started = true;
    const name = this.getAttribute("name") ?? "";
    const factory = behaviors.get(name);
    if (!factory) {
      console.warn(
        "[webmotion] <w-behavior> unknown behavior (register it with registerPropBehavior):",
        name,
      );
      return;
    }
    try {
      this.instance = factory({ host: this, el: this });
    } catch (e) {
      this.fail(name, e);
    }
  }

  private fail(name: string, error: unknown): void {
    this.failed = true;
    this.instance = null;
    this.replaceChildren();
    console.warn("[webmotion] behavior errored and was removed", name, error);
  }

  wmApplyFrame(ctx: FrameContext): void {
    if (this.failed) return;
    if (!this.started) this.start();
    if (!this.instance?.frame) return;
    let amount = num(this.getAttribute("amount"), 1);
    for (const tween of gatherTweens(this)) {
      const data = readTween(tween);
      if (data.property === "amount") amount = sampleTween(data, ctx.frame);
    }
    try {
      this.instance.frame(ctx.frame, ctx.frame / ctx.fps, amount);
    } catch (e) {
      this.fail(this.getAttribute("name") ?? "", e);
    }
  }

  wmRelease(): void {
    try {
      this.instance?.dispose?.();
    } catch {
      // Teardown must never throw.
    }
    this.instance = null;
    this.started = false;
  }
}
