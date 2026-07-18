// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { defineMaterialTextElement, WMaterialText } from "./material-text.js";

defineMaterialTextElement();

function slotMesh(material: THREE.Material): { root: THREE.Group; mesh: THREE.Mesh } {
  material.name = "Front";
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh };
}

function attach(root: THREE.Object3D): WMaterialText {
  const el = document.createElement("w-material-text") as WMaterialText;
  el.setAttribute("material", "Front");
  el.textContent = "RILEY\n10";
  el.wmAttach(root, () => {});
  return el;
}

describe("wmAttach material acceptance", () => {
  it("binds onto a plain standard material", () => {
    const { root, mesh } = slotMesh(new THREE.MeshStandardMaterial());
    attach(root);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.userData["wmCloned"]).toBe(true);
    expect((mat.map as THREE.CanvasTexture | null)?.isCanvasTexture).toBe(true);
  });

  it("binds onto a node material a shader effect already swapped in", () => {
    // A shader effect (TSL) replaces the slot clone with a node material and
    // the wmCloned marker survives NodeMaterial.copy; material text must
    // accept that material instead of bailing on an instanceof check.
    const nodeMat = new MeshStandardNodeMaterial();
    nodeMat.userData["wmCloned"] = true;
    const { root, mesh } = slotMesh(nodeMat);
    attach(root);
    expect(mesh.material).toBe(nodeMat);
    const map = (nodeMat as unknown as { map: THREE.CanvasTexture | null }).map;
    expect(map?.isCanvasTexture).toBe(true);
  });

  it("leaves non-standard materials untouched", () => {
    const basic = new THREE.MeshBasicMaterial();
    const { root, mesh } = slotMesh(basic);
    attach(root);
    expect(mesh.material).toBe(basic);
    expect(basic.map).toBeNull();
  });
});
