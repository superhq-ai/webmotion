import { describe, it, expect } from "vitest";
import { Composition } from "../core/composition.js";
import type { RenderContext, WebMotionComponent } from "../core/component.js";
import { Sequence } from "../core/sequence.js";
import { NullRenderer } from "../render/null-renderer.js";
import { Layer } from "./layer.js";
import { Runtime } from "./runtime.js";

/**
 * A component that records the exact (localFrame) it was asked to render, plus
 * its lifecycle calls. Rendering through the real Runtime against a
 * NullRenderer is the closest we can get, in Node, to proving the frame logic
 * a canvas or HTML backend would run.
 */
class RecordingComponent implements WebMotionComponent {
  readonly rendered: number[] = [];
  mounts = 0;
  destroys = 0;

  mount(): void {
    this.mounts++;
  }
  renderFrame(ctx: RenderContext): void {
    this.rendered.push(ctx.frame);
  }
  destroy(): void {
    this.destroys++;
  }
}

function makeRuntime(layers: Layer[], durationInFrames = 120): { runtime: Runtime } {
  const composition = new Composition({ width: 100, height: 100, fps: 30, durationInFrames });
  const runtime = new Runtime({ composition, renderer: new NullRenderer(100, 100), layers });
  return { runtime };
}

describe("Runtime.renderFrame", () => {
  it("renders a layer only within its sequence window, with local frames", async () => {
    const comp = new RecordingComponent();
    const layer = new Layer({ component: comp, sequence: new Sequence({ from: 30, durationInFrames: 3 }) });
    const { runtime } = makeRuntime([layer]);

    for (let f = 28; f <= 34; f++) await runtime.renderFrame(f);

    // Active on global 30,31,32 -> local 0,1,2. Nothing outside.
    expect(comp.rendered).toEqual([0, 1, 2]);
  });

  it("mounts lazily on first activation, exactly once", async () => {
    const comp = new RecordingComponent();
    const layer = new Layer({ component: comp, sequence: new Sequence({ from: 10 }) });
    const { runtime } = makeRuntime([layer]);

    await runtime.renderFrame(0);
    expect(comp.mounts).toBe(0); // not active yet
    await runtime.renderFrame(10);
    await runtime.renderFrame(11);
    expect(comp.mounts).toBe(1); // mounted once, on first activation
  });

  it("composites layers in array order", async () => {
    const order: string[] = [];
    const mk = (name: string): WebMotionComponent => ({
      mount() {},
      renderFrame() {
        order.push(name);
      },
      destroy() {},
    });
    const layers = [
      new Layer({ component: mk("background") }),
      new Layer({ component: mk("foreground") }),
    ];
    const { runtime } = makeRuntime(layers);

    await runtime.renderFrame(5);
    expect(order).toEqual(["background", "foreground"]);
  });

  it("is deterministic: re-seeking a frame reproduces the identical local frame", async () => {
    const comp = new RecordingComponent();
    const layer = new Layer({ component: comp, sequence: new Sequence({ from: 5, durationInFrames: 50 }) });
    const { runtime } = makeRuntime([layer]);

    await runtime.renderFrame(20);
    await runtime.renderFrame(90); // jump away (inactive)
    await runtime.renderFrame(20); // jump back
    // Both visits to global frame 20 produced local frame 15.
    expect(comp.rendered.filter((f) => f === 15).length).toBe(2);
  });

  it("clamps out-of-range seeks to the valid frame span", async () => {
    const comp = new RecordingComponent();
    const layer = new Layer({ component: comp });
    const { runtime } = makeRuntime([layer], 10);

    const f = await runtime.renderFrame(999);
    expect(f).toBe(9); // last frame of a 10-frame composition
  });
});
