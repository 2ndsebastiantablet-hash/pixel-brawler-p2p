import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createLowPolyCube,
  createLowPolyPlanetPlaceholder,
  createLowPolySharkPlaceholder,
  createMarsPlanet,
  createMoonSphere,
  createNeptuneBoss,
  createNeptuneClownFish,
  createNeptuneGiantShark,
  createNeptuneOctopus,
  createNeptuneSeaUrchin,
  createRingChomper,
  createSaturnPlanet,
} from "../src/game/render3d/LowPolyFactory";
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
    expect(shark.children.map((child) => child.name)).toEqual(expect.arrayContaining(["body", "head-wedge", "tail", "dorsal-fin"]));
  });

  it("creates real event model groups for sharks, Saturn, Ring Chomper, Moon, Mars, and Neptune", () => {
    const shark = createLowPolySharkPlaceholder("shark-model");
    const saturn = createSaturnPlanet("uranus-saturn");
    const chomper = createRingChomper("ring-chomper", { mouthOpen: 0.7 });
    const moon = createMoonSphere("moon-model");
    const mars = createMarsPlanet("mars-model");
    const neptune = createNeptuneBoss("neptune-model");
    const urchin = createNeptuneSeaUrchin("urchin-model");
    const octopus = createNeptuneOctopus("octopus-model");
    const giantShark = createNeptuneGiantShark("giant-shark-model");
    const clownFish = createNeptuneClownFish("clown-fish-model");

    expect(shark.children.map((child) => child.name)).toEqual(expect.arrayContaining(["body", "head-wedge", "tail", "dorsal-fin", "left-fin", "right-fin", "left-eye", "right-eye"]));
    expect(shark.children.length).toBeLessThanOrEqual(10);
    expect(saturn.children.map((child) => child.name)).toEqual(expect.arrayContaining(["planet", "rings-front", "rings-back", "arena-ring-front", "arena-ring-back"]));
    expect(chomper.children.map((child) => child.name)).toEqual(expect.arrayContaining(["body", "upper-jaw", "lower-jaw", "left-eye", "right-eye", "mouth-interior", "teeth", "spikes"]));
    expect(moon.children.map((child) => child.name)).toEqual(expect.arrayContaining(["sphere", "crater-a", "crater-b", "glow"]));
    expect(mars.children.map((child) => child.name)).toEqual(expect.arrayContaining(["planet", "green-glow", "crater-a", "crater-b"]));
    expect(neptune.children.map((child) => child.name)).toEqual(expect.arrayContaining(["torso", "neck", "head", "crown", "mouth", "left-arm", "right-arm", "left-hand", "right-hand", "water-glow"]));
    expect(neptune.userData).toEqual(expect.objectContaining({
      head: expect.any(THREE.Object3D),
      mouth: expect.any(THREE.Object3D),
      leftArm: expect.any(THREE.Object3D),
      rightArm: expect.any(THREE.Object3D),
    }));
    expect(urchin.children.map((child) => child.name)).toEqual(expect.arrayContaining(["core", "spikes"]));
    expect(octopus.children.map((child) => child.name)).toEqual(expect.arrayContaining(["head", "arm-0", "arm-7"]));
    expect(giantShark.children.map((child) => child.name)).toEqual(expect.arrayContaining(["body", "head-wedge", "tail", "dorsal-fin"]));
    expect(clownFish.children.map((child) => child.name)).toEqual(expect.arrayContaining(["body", "tail", "stripe-0", "left-eye"]));

    for (const group of [shark, saturn, chomper, moon, mars, neptune, urchin, octopus, giantShark, clownFish]) {
      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.children.length).toBeGreaterThanOrEqual(4);
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) {
          expect((child.material as THREE.MeshStandardMaterial).flatShading ?? true).toBe(true);
        }
      }
    }
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
      className: "game-3d-layer game-3d-layer--background",
      rendererFactory: () => renderer,
    });

    expect(parent.querySelector(".game-3d-layer--background")).toBe(renderer.domElement);
    expect(renderer.domElement.className).toContain("game-3d-layer");
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

  it("syncs real 3D event actors from existing 2D event snapshots and cleans stale actors", () => {
    const parent = document.createElement("main");
    const renderer: Render3DRendererAdapter = {
      domElement: document.createElement("canvas"),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const layer = new ThreeLayer({
      parent,
      enabled: true,
      demoEnabled: false,
      rendererFactory: () => renderer,
    });
    const frame = {
      deltaSeconds: 0.25,
      timeSeconds: 2,
      camera: { x: 80, y: 20 },
      viewport: { width: 1280, height: 720 },
    };

    layer.update({
      ...frame,
      events: {
        jupiterSharks: [
          { id: "shark-a", x: 700, y: 260, width: 72, height: 46, vx: 220, vy: -80, age: 1.2, biteCooldown: 0 },
        ],
        uranusEvents: [
          {
            id: "uranus-a",
            age: 4,
            phase: "active",
            fallProgress: 1,
            ringScroll: 120,
            flashAlpha: 0,
            chomper: { x: 230, y: 304, radius: 112, mouthOpen: 0.8, mouthAngle: 0.7 },
          },
        ],
        moonEvents: [
          {
            id: "moon-a",
            age: 2,
            moonVisualPhase: "holding",
            moonRiseProgress: 1,
            moonDescendProgress: 0,
            moonRadius: 74,
          },
        ],
        marsEvents: [
          {
            id: "mars-a",
            age: 1.5,
            phase: "beaming",
            riseProgress: 1,
            descendProgress: 0,
            radius: 172,
            spin: 0.5,
          },
        ],
        neptuneEvents: [
          {
            id: "neptune-a",
            age: 5,
            phase: "active",
            timer: 54,
            riseProgress: 1,
            descendProgress: 0,
            roarAlpha: 0,
            body: { x: 640, y: 260, radius: 260 },
            leftHand: { x: 360, y: 430, radius: 120, warningAlpha: 0 },
            rightHand: { x: 920, y: 430, radius: 120, warningAlpha: 0 },
            currentAttack: "rain",
            flood: { active: false, level: 0, alpha: 0, suck: 0 },
            tilt: { active: false, direction: 1, amount: 0, warningAlpha: 0 },
            laser: { active: true, warningAlpha: 1, firing: false, fromX: 640, fromY: 160, leftFromX: 592, leftFromY: 160, rightFromX: 688, rightFromY: 160, toX: 740, toY: 420, width: 24 },
          },
        ],
        neptuneCreatures: [
          { id: "urchin-a", kind: "urchin", x: 650, y: 540, vx: 120, vy: 0, width: 58, height: 58, age: 1.2, hp: 24, maxHp: 24, spawnProgress: 1, spawnX: 650, spawnY: 598 },
        ],
      },
    });

    expect(layer.status).toMatchObject({
      available: true,
      actorCount: 7,
      modelCounts: {
        jupiterSharks: 1,
        uranusPlanets: 1,
        ringChompers: 1,
        moons: 1,
        marsPlanets: 1,
        neptuneBosses: 1,
        neptuneCreatures: 1,
      },
    });
    expect(layer.getActorObject("jupiter-shark:shark-a")).toBeInstanceOf(THREE.Group);
    expect(layer.getActorObject("uranus-planet:uranus-a")).toBeInstanceOf(THREE.Group);
    expect(layer.getActorObject("uranus-chomper:uranus-a")).toBeInstanceOf(THREE.Group);
    expect(layer.getActorObject("moon:moon-a")).toBeInstanceOf(THREE.Group);
    expect(layer.getActorObject("mars-planet:mars-a")).toBeInstanceOf(THREE.Group);
    expect(layer.getActorObject("neptune-boss:neptune-a")).toBeInstanceOf(THREE.Group);
    expect(layer.getActorObject("neptune-creature:urchin-a")).toBeInstanceOf(THREE.Group);
    const neptuneBoss = layer.getActorObject("neptune-boss:neptune-a")!;
    expect(neptuneBoss.position.z).toBeLessThan(-12);
    expect(neptuneBoss.scale.x).toBeLessThanOrEqual(3.15);
    const uranus = layer.getActorObject("uranus-planet:uranus-a")!;
    expect(uranus.position.x).toBeCloseTo(0, 1);
    expect(uranus.scale.x).toBeLessThanOrEqual(3.35);

    const shark = layer.getActorObject("jupiter-shark:shark-a")!;
    const sharkX = shark.position.x;
    layer.update({
      ...frame,
      timeSeconds: 2.25,
      events: {
        jupiterSharks: [
          { id: "shark-a", x: 780, y: 260, width: 72, height: 46, vx: -120, vy: 30, age: 1.45, biteCooldown: 0.1 },
        ],
        uranusEvents: [],
        moonEvents: [],
        marsEvents: [],
        neptuneEvents: [],
        neptuneCreatures: [],
      },
    });

    expect(layer.status.modelCounts).toMatchObject({
      jupiterSharks: 1,
      uranusPlanets: 0,
      ringChompers: 0,
      moons: 0,
      marsPlanets: 0,
      neptuneBosses: 0,
      neptuneCreatures: 0,
    });
    expect(layer.getActorObject("jupiter-shark:shark-a")?.position.x).toBeGreaterThan(sharkX);
    expect(layer.getActorObject("uranus-planet:uranus-a")).toBeUndefined();
    expect(layer.getActorObject("uranus-chomper:uranus-a")).toBeUndefined();
    expect(layer.getActorObject("moon:moon-a")).toBeUndefined();
    expect(layer.getActorObject("mars-planet:mars-a")).toBeUndefined();
    expect(layer.getActorObject("neptune-boss:neptune-a")).toBeUndefined();
    expect(layer.getActorObject("neptune-creature:urchin-a")).toBeUndefined();

    layer.update({ ...frame, events: { jupiterSharks: [], uranusEvents: [], moonEvents: [], marsEvents: [], neptuneEvents: [], neptuneCreatures: [] } });
    expect(layer.status.actorCount).toBe(0);
  });

  it("renders the Uranus intro as a growing centered planet before switching to the active ring stage", () => {
    const parent = document.createElement("main");
    const renderer: Render3DRendererAdapter = {
      domElement: document.createElement("canvas"),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const layer = new ThreeLayer({
      parent,
      enabled: true,
      demoEnabled: false,
      rendererFactory: () => renderer,
    });
    const frame = {
      deltaSeconds: 0.16,
      timeSeconds: 1,
      camera: { x: 0, y: 0 },
      viewport: { width: 1280, height: 720 },
    };

    layer.update({
      ...frame,
      events: {
        jupiterSharks: [],
        uranusEvents: [
          {
            id: "uranus-intro",
            age: 0.7,
            phase: "falling",
            fallProgress: 0.5,
            ringScroll: 0,
            flashAlpha: 0,
            chomper: { x: -240, y: 304, radius: 112, mouthOpen: 0, mouthAngle: 0 },
          },
        ],
        moonEvents: [],
        marsEvents: [],
        neptuneEvents: [],
        neptuneCreatures: [],
      },
    });

    const intro = layer.getActorObject("uranus-intro:uranus-intro");
    expect(intro).toBeInstanceOf(THREE.Group);
    expect(intro!.scale.x).toBeGreaterThan(1);
    expect(intro!.position.x).toBeLessThan(0);

    layer.update({
      ...frame,
      timeSeconds: 3,
      events: {
        jupiterSharks: [],
        uranusEvents: [
          {
            id: "uranus-intro",
            age: 3,
            phase: "active",
            fallProgress: 1,
            ringScroll: 180,
            flashAlpha: 0,
            chomper: { x: -180, y: 304, radius: 112, mouthOpen: 0.8, mouthAngle: 0.7 },
          },
        ],
        moonEvents: [],
        marsEvents: [],
        neptuneEvents: [],
        neptuneCreatures: [],
      },
    });

    expect(layer.getActorObject("uranus-intro:uranus-intro")).toBeUndefined();
    const active = layer.getActorObject("uranus-planet:uranus-intro");
    expect(active).toBeInstanceOf(THREE.Group);
    expect(active!.position.x).toBeCloseTo(0, 1);
    expect(active!.scale.x).toBeLessThanOrEqual(3.35);
  });

  it("does not create event actors when the 3D layer is disabled", () => {
    const parent = document.createElement("main");
    const layer = new ThreeLayer({
      parent,
      enabled: false,
      demoEnabled: false,
    });

    expect(() => layer.update({
      deltaSeconds: 0.1,
      timeSeconds: 1,
      camera: { x: 0, y: 0 },
      viewport: { width: 800, height: 600 },
      events: {
        jupiterSharks: [
          { id: "disabled-shark", x: 0, y: 0, width: 72, height: 46, vx: 1, vy: 0, age: 0, biteCooldown: 0 },
        ],
        uranusEvents: [],
        moonEvents: [],
        marsEvents: [],
        neptuneEvents: [],
        neptuneCreatures: [],
      },
    })).not.toThrow();
    expect(layer.status).toMatchObject({ enabled: false, available: false, actorCount: 0 });
  });
});

function fakeStorage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem: (key: string) => values[key] ?? null,
  };
}
