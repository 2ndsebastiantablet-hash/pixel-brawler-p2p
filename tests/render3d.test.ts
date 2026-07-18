import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createLowPolyCube, createLowPolyPlanetPlaceholder, createLowPolySharkPlaceholder } from "../src/game/render3d/LowPolyFactory";
import { ModelRegistry, createModelActor } from "../src/game/render3d/ModelRegistry";
import { ThreeLayer, type Render3DRendererAdapter } from "../src/game/render3d/ThreeLayer";
import { resolveRender3DConfig, worldToThreePosition } from "../src/game/render3d/Render3DTypes";

describe("hybrid 3D rendering foundation", () => {
  it("maps 2D world coordinates into stable Three.js positions relative to the 2D camera", () => {
    const viewport = { width: 1280, height: 720 };
    const camera = { x: 100, y: 40 };

    expect(worldToThreePosition({ x: 740, y: 400 }, camera, viewport)).toMatchObject({
      x: 0,
      y: -0,
      z: -5,
    });
    expect(worldToThreePosition({ x: 164, y: 104 }, camera, viewport)).toMatchObject({
      x: -9,
      y: 4.625,
      z: -5,
    });
  });

  it("resolves 3D flags so the layer is optional and the demo is opt-in", () => {
    const storage = fakeStorage({
      "pixel-brawler-p2p.render3d.disabled": "false",
      "pixel-brawler-p2p.render3d.demo": "true",
    });

    expect(resolveRender3DConfig({ search: "", storage })).toMatchObject({
      enabled: true,
      demoEnabled: true,
    });
    expect(resolveRender3DConfig({ search: "?render3d=0&render3dDemo=1", storage })).toMatchObject({
      enabled: false,
      demoEnabled: true,
    });
    expect(resolveRender3DConfig({ search: "?render3d=1", storage: fakeStorage({ "pixel-brawler-p2p.render3d.disabled": "true" }) })).toMatchObject({
      enabled: true,
      demoEnabled: false,
    });
  });

  it("registers model actor factories and disposes actors without leaking scene children", () => {
    const scene = new THREE.Scene();
    const registry = new ModelRegistry();
    const update = vi.fn();
    const dispose = vi.fn();

    registry.register("demo-cube", ({ id, position }) => createModelActor({
      id,
      object: new THREE.Object3D(),
      position,
      update,
      dispose,
    }));

    const actor = registry.create("demo-cube", { id: "cube-1", position: { x: 1, y: 2, z: -3 } });
    expect(actor.id).toBe("cube-1");
    expect(actor.object.position.toArray()).toEqual([1, 2, -3]);

    registry.addToScene(scene, actor);
    expect(scene.children).toContain(actor.object);

    registry.updateAll({ deltaSeconds: 0.5, timeSeconds: 2, camera: { x: 0, y: 0 }, viewport: { width: 800, height: 600 } });
    expect(update).toHaveBeenCalledWith(actor, expect.objectContaining({ deltaSeconds: 0.5, timeSeconds: 2 }));

    registry.disposeAll(scene);
    expect(scene.children).not.toContain(actor.object);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("creates real Three.js low-poly placeholders for future Space-series models", () => {
    const cube = createLowPolyCube("demo-cube", { color: 0x44ccff });
    const planet = createLowPolyPlanetPlaceholder("demo-planet");
    const shark = createLowPolySharkPlaceholder("demo-shark");

    expect(cube).toBeInstanceOf(THREE.Mesh);
    expect(cube.geometry.attributes.position.count).toBeGreaterThan(0);
    expect((cube.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    expect(planet).toBeInstanceOf(THREE.Mesh);
    expect((planet.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    expect(shark).toBeInstanceOf(THREE.Group);
    expect(shark.children.map((child) => child.name)).toEqual(expect.arrayContaining(["body", "head", "tail", "top-fin"]));
  });

  it("fails closed when WebGL initialization throws and keeps update/dispose safe", () => {
    const parent = document.createElement("main");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const layer = new ThreeLayer({
      parent,
      enabled: true,
      demoEnabled: true,
      rendererFactory: () => {
        throw new Error("no webgl");
      },
    });

    expect(layer.status).toMatchObject({ enabled: true, available: false, actorCount: 0 });
    expect(parent.querySelector(".game-3d-layer")).toBeNull();
    expect(() => {
      layer.resize(800, 600);
      layer.update({ deltaSeconds: 0.1, timeSeconds: 1, camera: { x: 0, y: 0 }, viewport: { width: 800, height: 600 } });
      layer.render();
      layer.dispose();
    }).not.toThrow();
    expect(warn).toHaveBeenCalledWith("3D render layer disabled; falling back to 2D canvas", expect.any(Error));
    warn.mockRestore();
  });

  it("can initialize with an injected renderer, render an opt-in demo actor, and clean up", () => {
    const parent = document.createElement("main");
    const render = vi.fn();
    const setSize = vi.fn();
    const dispose = vi.fn();
    const renderer: Render3DRendererAdapter = {
      domElement: document.createElement("canvas"),
      setSize,
      render,
      dispose,
    };
    const layer = new ThreeLayer({
      parent,
      enabled: true,
      demoEnabled: true,
      rendererFactory: () => renderer,
    });

    expect(parent.querySelector(".game-3d-layer")).toBe(renderer.domElement);
    expect(layer.status).toMatchObject({ available: true, actorCount: 1 });

    layer.resize(800, 600);
    expect(setSize).toHaveBeenCalledWith(800, 600, false);

    layer.update({ deltaSeconds: 0.25, timeSeconds: 3, camera: { x: 0, y: 0 }, viewport: { width: 800, height: 600 } });
    layer.render();
    expect(render).toHaveBeenCalledWith(expect.any(THREE.Scene), expect.any(THREE.PerspectiveCamera));

    layer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(parent.querySelector(".game-3d-layer")).toBeNull();
  });
});

function fakeStorage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem: (key: string) => values[key] ?? null,
  };
}
