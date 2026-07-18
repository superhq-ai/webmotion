// One WebGL context for every <w-model> on the page. Each model element keeps
// a plain 2D canvas in the DOM; per frame its scene is rendered into a shared
// scratch canvas (viewport plus scissor sized to the model's box) and blitted
// across in the same task. Browsers cap WebGL contexts per page, so per
// element contexts stop scaling after a handful of models; the blit also
// removes the need for preserveDrawingBuffer, and context loss becomes one
// recovery path instead of one per element.
import * as THREE from "three";

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
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private refs = 0;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;
  // Bumped when the GL context is lost and restored; consumers include it in
  // their render keys so every model re-renders on the fresh context.
  generation = 0;
  // Cached prefiltered environment maps, keyed by environment source. Owned
  // here because PMREM output is context-bound.
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

  /** The live renderer, creating it (and the scratch canvas) on demand. */
  get(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    this.canvas = document.createElement("canvas");
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      // Fresh context: prefiltered environments and renderer caches are gone.
      this.generation++;
      for (const tex of this.environments.values()) tex.dispose();
      this.environments.clear();
      this.pmrem = null;
    });
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return this.renderer;
  }

  /**
   * Render one model's scene and blit it into that model's 2D canvas. The
   * scratch surface only ever grows; the pass draws into its bottom-left
   * corner under scissor, which maps to the bottom-left of the blit source.
   */
  renderInto(
    scene: THREE.Scene,
    camera: THREE.Camera,
    out: CanvasRenderingContext2D,
    opts: RenderPassOptions,
  ): void {
    const renderer = this.get();
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
    renderer.clear();
    renderer.render(scene, camera);

    const glCanvas = renderer.domElement;
    out.clearRect(0, 0, out.canvas.width, out.canvas.height);
    // GL viewport origin is bottom-left, so the pass's pixels sit at the
    // bottom of the scratch canvas in image space.
    out.drawImage(
      glCanvas,
      0,
      glCanvas.height - h,
      w,
      h,
      0,
      0,
      out.canvas.width,
      out.canvas.height,
    );
  }

  /**
   * A prefiltered environment texture, built once per key on this context.
   * The builder returns a plain scene or equirect texture; disposal of the
   * inputs is the builder's job.
   */
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
  }
}

export const sharedRenderer = new SharedRendererImpl();
