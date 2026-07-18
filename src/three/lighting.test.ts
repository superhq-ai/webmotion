// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyLightFrame, buildPreset, createDeclaredLight, resolveToneMapping } from "./lighting.js";

describe("buildPreset", () => {
  it("builds the documented rigs", () => {
    expect(buildPreset("neutral")).toHaveLength(2);
    expect(buildPreset(null)).toHaveLength(2);
    expect(buildPreset("studio")).toHaveLength(4);
    expect(buildPreset("dramatic")).toHaveLength(3);
    expect(buildPreset("flat")).toHaveLength(1);
    expect(buildPreset("none")).toHaveLength(0);
  });
});

describe("resolveToneMapping", () => {
  it("maps names and defaults to none", () => {
    expect(resolveToneMapping("aces")).toBe(THREE.ACESFilmicToneMapping);
    expect(resolveToneMapping(null)).toBe(THREE.NoToneMapping);
    expect(resolveToneMapping("bogus")).toBe(THREE.NoToneMapping);
  });
});

describe("declared lights", () => {
  function lightEl(html: string): HTMLElement {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    return holder.firstElementChild as HTMLElement;
  }

  it("creates typed lights from attributes", () => {
    const spot = createDeclaredLight(
      lightEl(`<w-light type="spot" color="#ff0000" angle="30"></w-light>`),
    );
    expect(spot?.light).toBeInstanceOf(THREE.SpotLight);
    const dir = createDeclaredLight(lightEl(`<w-light></w-light>`));
    expect(dir?.light).toBeInstanceOf(THREE.DirectionalLight);
    expect(createDeclaredLight(lightEl(`<w-light type="laser"></w-light>`))).toBeNull();
  });

  it("samples intensity tweens as a pure function of frame", () => {
    const decl = createDeclaredLight(
      lightEl(`<w-light intensity="2" position="1 2 3">
        <w-animate property="intensity" from="0" to="2" start="0" end="10"></w-animate>
      </w-light>`),
    );
    if (!decl) throw new Error("light not created");

    const keyAt5 = applyLightFrame(decl, 5);
    expect(decl.light.intensity).toBe(1);
    applyLightFrame(decl, 10);
    expect(decl.light.intensity).toBe(2);
    expect(decl.light.position.x).toBe(1);

    // Same frame, same state string: render keys stay stable on pauses.
    expect(applyLightFrame(decl, 5)).toBe(keyAt5);
  });
});
