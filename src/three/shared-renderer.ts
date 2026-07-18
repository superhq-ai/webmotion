// One GPU renderer for every <w-model> on the page, now WebGPURenderer from
// three/webgpu (WGSL when the browser has WebGPU, automatic WebGL2 backend
// otherwise). This is what makes TSL node materials available to
// application-defined shader effects. Each model element keeps a plain 2D
// canvas in the DOM; per frame its scene renders into the shared scratch
// canvas and blits across when the async render resolves. Renders are
// serialized on one queue because viewport, scissor, and clear state are
// renderer-global.
import * as THREE from "three/webgpu";

export interface RenderPassOptions {
  /** css pixel size of the model's box. */
  width: number;
  height: number;
  /** device pixels per css pixel for this pass. */
  dpr: number;
  /** Clear color; null clears to transparent. */
  background: THREE.Color | null;
  /** Tone mapping for this pass; renderer state is set per pass. */
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  /** Enable shadow maps for this pass. */
  shadows: boolean;
}

const DISPOSE_DELAY_MS = 2000;

class SharedRendererImpl {
  private renderer: THREE.WebGPURenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private initPromise: Promise<void> | null = null;
  private refs = 0;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;
  // Serializes every render pass; renderer state is global.
  private chain: Promise<void> = Promise.resolve();
  // Bumped when the backing device is rebuilt; consumers include it in
  // their render keys so every model re-renders on the fresh device.
  generation = 0;
  private environments = new Map<string, THREE.Texture>();
  private pmrem: THREE.PMREMGenerator | null = null;

  acquire(): void {
    this.refs++;
    if (this.disposeTimer) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
  }

  release(): void {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0 && !this.disposeTimer) {
      this.disposeTimer = setTimeout(() => {
        this.disposeTimer = null;
        if (this.refs === 0) this.dispose();
      }, DISPOSE_DELAY_MS);
    }
  }

  /** The renderer instance, creating it on demand. Await ready() to use it. */
  get(): THREE.WebGPURenderer {
    if (this.renderer) return this.renderer;
    this.canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.initPromise = this.renderer.init().then(() => undefined);
    return this.renderer;
  }

  /** Resolves when the backend (WebGPU or the WebGL fallback) is usable. */
  ready(): Promise<void> {
    this.get();
    return this.initPromise ?? Promise.resolve();
  }

  /**
   * Render one model's scene and blit it into that model's 2D canvas.
   * Queued: passes never interleave. The returned promise resolves after
   * the blit, which is what wmAwaitFrame hands to the export loop.
   */
  renderInto(
    scene: THREE.Scene,
    camera: THREE.Camera,
    out: CanvasRenderingContext2D,
    opts: RenderPassOptions,
  ): Promise<void> {
    const run = async () => {
      await this.ready();
      const renderer = this.renderer;
      if (!renderer) return;
      const w = Math.max(1, Math.round(opts.width * opts.dpr));
      const h = Math.max(1, Math.round(opts.height * opts.dpr));

      const cur = renderer.getSize(new THREE.Vector2());
      if (cur.x < w || cur.y < h) {
        renderer.setSize(Math.max(cur.x, w), Math.max(cur.y, h), false);
      }

      renderer.setViewport(0, 0, w, h);
      renderer.setScissor(0, 0, w, h);
      renderer.setScissorTest(true);
      renderer.toneMapping = opts.toneMapping;
      renderer.toneMappingExposure = opts.toneMappingExposure;
      renderer.shadowMap.enabled = opts.shadows;
      if (opts.background) renderer.setClearColor(opts.background, 1);
      else renderer.setClearColor(0x000000, 0);
      await renderer.clearAsync();
      await renderer.renderAsync(scene, camera);

      const glCanvas = renderer.domElement;
      out.clearRect(0, 0, out.canvas.width, out.canvas.height);
      // WebGPURenderer's viewport origin is top-left on both backends (the
      // WebGL fallback flips Y internally), so the pass's pixels sit at the
      // top of the scratch canvas in image space.
      out.drawImage(glCanvas, 0, 0, w, h, 0, 0, out.canvas.width, out.canvas.height);
    };
    const pass = this.chain.then(run, run);
    this.chain = pass.catch(() => {});
    return pass;
  }

  /** A prefiltered environment texture, built once per key. */
  environment(key: string, build: (pmrem: THREE.PMREMGenerator) => THREE.Texture): THREE.Texture {
    const hit = this.environments.get(key);
    if (hit) return hit;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.get());
    const tex = build(this.pmrem);
    this.environments.set(key, tex);
    return tex;
  }

  private dispose(): void {
    for (const tex of this.environments.values()) tex.dispose();
    this.environments.clear();
    this.pmrem?.dispose();
    this.pmrem = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
    this.initPromise = null;
  }
}

export const sharedRenderer = new SharedRendererImpl();
