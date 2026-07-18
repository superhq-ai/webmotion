// <w-material-text>: declares that a named material slot on the enclosing
// <w-model> receives runtime text (the donor name and number on a jersey).
// The text renders to an offscreen canvas that becomes the material's map:
// injection-safe by construction, since data never touches markup. The
// target material is cloned per instance, so concurrent props with different
// names never fight over the shared GLTF cache materials.
//
//   <w-model src="jersey.gltf">
//     <w-material-text material="BackPrint" aspect="1.27" color="#11224d">
//       {name}
//       {number}
//     </w-material-text>
//   </w-model>
//
// Each non-empty line of text content is a stacked line on the texture,
// auto-fitted to the slot; short lines (a jersey number) come out big.
import * as THREE from "three";
import { num } from "../elements/parse.js";

const MAX_LINES = 3;
const MAX_LINE_CHARS = 48;

/**
 * Fit stacked lines into a box: each line gets an equal height slot and a
 * font size bounded by both the slot and the measured width at a reference
 * size. Pure, injectable measurement, so it unit-tests without a canvas.
 */
export function fitLines(
  lines: string[],
  boxW: number,
  boxH: number,
  measureAt100: (text: string) => number,
): { text: string; fontSize: number; y: number }[] {
  const usable = lines.slice(0, MAX_LINES).map((l) => l.slice(0, MAX_LINE_CHARS));
  if (usable.length === 0) return [];
  const slotH = (boxH * 0.84) / usable.length;
  const maxW = boxW * 0.86;
  const out: { text: string; fontSize: number; y: number }[] = [];
  for (let i = 0; i < usable.length; i++) {
    const text = usable[i] ?? "";
    const widthAt100 = Math.max(1, measureAt100(text));
    const fontSize = Math.min(slotH * 0.82, (maxW / widthAt100) * 100);
    const y = boxH * 0.08 + slotH * i + slotH / 2;
    out.push({ text, fontSize, y });
  }
  return out;
}

export class WMaterialText extends HTMLElement {
  /** Resolves once the optional base image is decoded; export waits on it. */
  wmReady: Promise<void> = Promise.resolve();

  private canvas: HTMLCanvasElement | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private invalidate: (() => void) | null = null;
  private baseImage: HTMLImageElement | null = null;
  private lastText = "";

  private logoImage: HTMLImageElement | null = null;

  connectedCallback(): void {
    this.style.display = "none";
    // A base image composites under the text (a product photo whose alpha
    // cuts the silhouette), and a logo image lands in its own area (a chest
    // patch). Both loads join wmReady so preload and export wait for them.
    const loads: Promise<void>[] = [];
    const loadInto = (attr: string, assign: (img: HTMLImageElement) => void) => {
      const src = this.getAttribute(attr);
      if (!src) return;
      const img = new Image();
      loads.push(
        new Promise((resolve) => {
          img.onload = () => {
            assign(img);
            this.render(this.lastText || (this.textContent ?? ""));
            this.invalidate?.();
            resolve();
          };
          img.onerror = () => {
            console.warn(`[webmotion] <w-material-text> ${attr} image failed:`, src);
            resolve();
          };
        }),
      );
      img.src = new URL(src, document.baseURI).href;
    };
    if (!this.baseImage) loadInto("image", (img) => (this.baseImage = img));
    if (!this.logoImage) loadInto("logo", (img) => (this.logoImage = img));
    if (loads.length > 0) this.wmReady = Promise.all(loads).then(() => undefined);
  }

  /** Wired by the enclosing w-model once its scene exists. */
  wmAttach(root: THREE.Object3D, invalidate: () => void): void {
    const slot = this.getAttribute("material");
    if (!slot) {
      console.warn("[webmotion] <w-material-text> needs a material attribute");
      return;
    }

    let mesh: THREE.Mesh | null = null;
    let index = -1;
    root.traverse((o) => {
      if (mesh || !(o as THREE.Mesh).isMesh) return;
      const m = o as THREE.Mesh;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const i = mats.findIndex((mat) => mat && mat.name === slot);
      if (i !== -1) {
        mesh = m;
        index = i;
      }
    });
    if (!mesh) {
      console.warn("[webmotion] <w-material-text> found no material named", slot);
      return;
    }

    const target: THREE.Mesh = mesh;
    const raw = Array.isArray(target.material) ? target.material[index] : target.material;
    // Standard materials and their node flavors both carry map/color slots.
    // A shader effect may already have swapped the slot to a node material
    // (TSL), so flag checks, not instanceof: they also survive a consumer
    // app bundling a second copy of three.
    const flags = raw as unknown as {
      isMeshStandardMaterial?: boolean;
      isMeshStandardNodeMaterial?: boolean;
      isMeshPhysicalNodeMaterial?: boolean;
    };
    if (
      !flags.isMeshStandardMaterial &&
      !flags.isMeshStandardNodeMaterial &&
      !flags.isMeshPhysicalNodeMaterial
    ) {
      console.warn("[webmotion] <w-material-text> slot is not a standard material:", slot);
      return;
    }
    const source = raw as THREE.MeshStandardMaterial;
    // One clone per instance per slot, shared between slot systems: cloning
    // again would drop another system's onBeforeCompile (Material.copy does
    // not carry it).
    let cloned: THREE.MeshStandardMaterial;
    if (source.userData["wmCloned"]) {
      cloned = source;
    } else {
      cloned = source.clone();
      cloned.name = source.name;
      cloned.userData["wmCloned"] = true;
      if (Array.isArray(target.material)) target.material[index] = cloned;
      else target.material = cloned;
    }

    const resolution = Math.min(2048, Math.max(64, num(this.getAttribute("resolution"), 512)));
    const aspect = num(this.getAttribute("aspect"), 1);
    this.canvas = document.createElement("canvas");
    this.canvas.width = resolution;
    this.canvas.height = Math.round(resolution * aspect);
    this.texture = new THREE.CanvasTexture(this.canvas);
    // No runtime mip generation: dynamic-texture mipmapping is buggy on
    // older embedded Chromium (OBS CEF 127 WebGPU corrupts the mip chain,
    // sampling eats holes in the print at minification). Linear filtering
    // of a high-resolution canvas looks correct everywhere and behaves the
    // same on every backend.
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // glTF UV convention: do not flip; the draw code writes top-down.
    this.texture.flipY = false;
    // DCC-authored UVs regularly sit outside [0,1] (tiled or offset islands);
    // clamp-to-edge would smear the corner texel across the mesh.
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    cloned.map = this.texture;
    cloned.color.set(0xffffff);
    if (this.hasAttribute("image")) {
      // Image alpha defines the silhouette.
      cloned.transparent = true;
      cloned.alphaTest = 0.02;
    }
    cloned.needsUpdate = true;

    this.material = cloned;
    this.invalidate = invalidate;
    this.render(this.textContent ?? "");
  }

  /**
   * Live update path. `source` names the data key for the text; bind-*
   * attributes name data keys for style inputs, so a dashboard can recolor
   * or re-badge a mounted prop without remounting it:
   *   bind-background="color" bind-color="textColor" bind-logo="logoUrl"
   */
  wmBind(data: Record<string, unknown>): void {
    let dirty = false;

    for (const [attr, bindAttr] of [
      ["background", "bind-background"],
      ["color", "bind-color"],
    ] as const) {
      const key = this.getAttribute(bindAttr);
      if (key && key in data && this.getAttribute(attr) !== String(data[key])) {
        this.setAttribute(attr, String(data[key]));
        dirty = true;
      }
    }

    const logoKey = this.getAttribute("bind-logo");
    if (logoKey && logoKey in data) {
      const url = String(data[logoKey] ?? "");
      if ((this.getAttribute("logo") ?? "") !== url) {
        this.setAttribute("logo", url);
        if (!url) {
          this.logoImage = null;
          dirty = true;
        } else {
          const img = new Image();
          img.onload = () => {
            this.logoImage = img;
            this.render(this.lastText);
            this.invalidate?.();
          };
          img.src = new URL(url, document.baseURI).href;
        }
      }
    }

    const source = this.getAttribute("source");
    if (source && source in data) {
      this.render(String(data[source]));
      this.invalidate?.();
      return;
    }
    if (dirty) {
      this.render(this.lastText || (this.textContent ?? ""));
      this.invalidate?.();
    }
  }

  wmRelease(): void {
    this.texture?.dispose();
    this.material?.dispose();
    this.texture = null;
    this.material = null;
  }

  private render(text: string): void {
    if (!this.canvas || !this.texture) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    this.lastText = text;
    const { width, height } = this.canvas;

    // Textures load with flipY false per glTF convention, which matches
    // assets authored in DCC tools (Blender exports). Meshes whose UVs went
    // through other conversions can declare flip="180" to compensate.
    if (this.getAttribute("flip") === "180") {
      ctx.setTransform(-1, 0, 0, -1, width, height);
    }
    ctx.clearRect(0, 0, width, height);
    if (this.baseImage) {
      ctx.drawImage(this.baseImage, 0, 0, width, height);
    } else {
      ctx.fillStyle = this.getAttribute("background") ?? "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    // The text zone: center x, center y, width, height as fractions of the
    // texture, so text lands on the garment's print area, not the whole cloth.
    const area = (this.getAttribute("text-area") ?? "0.5 0.5 1 1")
      .trim()
      .split(/\s+/)
      .map(Number);
    const [cx = 0.5, cy = 0.5, aw = 1, ah = 1] = area;
    const boxW = width * aw;
    const boxH = height * ah;

    const family = this.getAttribute("font") ?? "Impact, 'Arial Black', sans-serif";
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fitted = fitLines(lines, boxW, boxH, (t) => {
      ctx.font = `700 100px ${family}`;
      return ctx.measureText(t).width;
    });
    ctx.fillStyle = this.getAttribute("color") ?? "#11224d";
    for (const line of fitted) {
      ctx.font = `700 ${Math.floor(line.fontSize)}px ${family}`;
      ctx.fillText(line.text, width * cx, height * cy - boxH / 2 + line.y);
    }

    // Logo patch: contain-fit into its own area (fractions like text-area).
    if (this.logoImage) {
      const la = (this.getAttribute("logo-area") ?? "0.5 0.5 0.2 0.2")
        .trim()
        .split(/\s+/)
        .map(Number);
      const [lx = 0.5, ly = 0.5, lw = 0.2, lh = 0.2] = la;
      const boxLW = width * lw;
      const boxLH = height * lh;
      const scale = Math.min(boxLW / this.logoImage.width, boxLH / this.logoImage.height);
      const dw = this.logoImage.width * scale;
      const dh = this.logoImage.height * scale;
      ctx.drawImage(this.logoImage, width * lx - dw / 2, height * ly - dh / 2, dw, dh);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.texture.needsUpdate = true;
  }
}

export function defineMaterialTextElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-material-text")) {
    customElements.define("w-material-text", WMaterialText);
  }
}
