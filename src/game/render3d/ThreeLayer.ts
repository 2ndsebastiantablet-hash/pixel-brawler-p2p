import * as THREE from "three";
import {
  createLowPolyCube,
  createLowPolyPlanetPlaceholder,
  createLowPolySharkPlaceholder,
  createMoonSphere,
  createRingChomper,
  createSaturnPlanet,
} from "./LowPolyFactory";
import { ModelRegistry, type ModelActor, createModelActor } from "./ModelRegistry";
import type { Render3DCamera2D, Render3DConfig, Render3DEventVisuals, Render3DFrame, Render3DJupiterSharkVisual, Render3DMoonVisual, Render3DUranusVisual, Render3DViewport } from "./Render3DTypes";
import { DEFAULT_RENDER3D_DEPTH, DEFAULT_RENDER3D_PIXELS_PER_UNIT, worldToThreePosition } from "./Render3DTypes";

export interface Render3DRendererAdapter {
  domElement: HTMLCanvasElement;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
  setPixelRatio?: (ratio: number) => void;
  setClearColor?: (color: THREE.ColorRepresentation, alpha?: number) => void;
}

export interface ThreeLayerOptions extends Partial<Render3DConfig> {
  parent: HTMLElement;
  rendererFactory?: () => Render3DRendererAdapter;
}

export interface ThreeLayerStatus {
  enabled: boolean;
  available: boolean;
  actorCount: number;
  modelCounts: Render3DModelCounts;
  error?: string;
}

export interface Render3DModelCounts {
  jupiterSharks: number;
  uranusPlanets: number;
  ringChompers: number;
  moons: number;
}

export class ThreeLayer {
  private readonly registry = new ModelRegistry();
  private readonly pixelsPerUnit: number;
  private readonly defaultDepth: number;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: Render3DRendererAdapter | null = null;
  private lastViewport: Render3DViewport = { width: 960, height: 540 };
  private statusSnapshot: ThreeLayerStatus;

  constructor(private readonly options: ThreeLayerOptions) {
    this.pixelsPerUnit = options.pixelsPerUnit ?? DEFAULT_RENDER3D_PIXELS_PER_UNIT;
    this.defaultDepth = options.defaultDepth ?? DEFAULT_RENDER3D_DEPTH;
    this.statusSnapshot = {
      enabled: options.enabled ?? true,
      available: false,
      actorCount: 0,
      modelCounts: emptyModelCounts(),
    };

    if (this.statusSnapshot.enabled) {
      this.initialize();
    }
  }

  get status(): ThreeLayerStatus {
    return {
      ...this.statusSnapshot,
      actorCount: this.registry.actorCount,
      modelCounts: this.countEventModels(),
    };
  }

  getActorObject(id: string): THREE.Object3D | undefined {
    return this.registry.get(id)?.object;
  }

  resize(width: number, height: number): void {
    this.lastViewport = { width, height };
    if (!this.renderer || !this.camera) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(frame: Render3DFrame): void {
    if (!this.scene || !this.camera || !this.renderer) {
      return;
    }
    this.lastViewport = frame.viewport;
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, this.defaultDepth);
    if (frame.events) {
      this.syncEventModels(frame.events, frame);
    }
    this.registry.updateAll(frame);
  }

  render(): void {
    if (!this.scene || !this.camera || !this.renderer) {
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.registry.disposeAll(this.scene ?? undefined);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.statusSnapshot = {
      ...this.statusSnapshot,
      available: false,
      actorCount: 0,
      modelCounts: emptyModelCounts(),
    };
  }

  private initialize(): void {
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, this.lastViewport.width / this.lastViewport.height, 0.1, 200);
      const renderer = this.createRenderer();
      renderer.domElement.className = "game-3d-layer";
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor?.(0x000000, 0);
      this.options.parent.append(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xd6f2ff, 0x161923, 2.2));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.75);
      keyLight.position.set(3, 4, 8);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x6dd7ff, 0.9);
      rimLight.position.set(-4, 2, 5);
      scene.add(rimLight);

      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.installDefaultFactories();
      if (this.options.demoEnabled) {
        this.addDemoActor(scene);
      }
      this.resize(this.lastViewport.width, this.lastViewport.height);
      this.statusSnapshot = {
        enabled: true,
        available: true,
        actorCount: this.registry.actorCount,
        modelCounts: this.countEventModels(),
      };
    } catch (error) {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.statusSnapshot = {
        enabled: true,
        available: false,
        actorCount: 0,
        modelCounts: emptyModelCounts(),
        error: error instanceof Error ? error.message : String(error),
      };
      console.warn("3D render layer disabled; falling back to 2D canvas", error);
    }
  }

  private createRenderer(): Render3DRendererAdapter {
    if (this.options.rendererFactory) {
      return this.options.rendererFactory();
    }
    return new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
  }

  private installDefaultFactories(): void {
    this.registry.register("low-poly-cube", ({ id, position }) => createModelActor({
      id,
      object: createLowPolyCube(id, { color: 0x44ccff }),
      position,
      update: rotateDemoActor,
    }));
    this.registry.register("low-poly-planet", ({ id, position }) => createModelActor({
      id,
      object: createLowPolyPlanetPlaceholder(id),
      position,
      update: rotateDemoActor,
    }));
    this.registry.register("low-poly-shark", ({ id, position }) => createModelActor({
      id,
      object: createLowPolySharkPlaceholder(id),
      position,
      update: rotateDemoActor,
    }));
    this.registry.register("saturn-planet", ({ id, position }) => createModelActor({
      id,
      object: createSaturnPlanet(id, { scale: 1 }),
      position,
    }));
    this.registry.register("ring-chomper", ({ id, position }) => createModelActor({
      id,
      object: createRingChomper(id, { scale: 1 }),
      position,
    }));
    this.registry.register("moon-sphere", ({ id, position }) => createModelActor({
      id,
      object: createMoonSphere(id, { scale: 1 }),
      position,
    }));
  }

  private addDemoActor(scene: THREE.Scene): void {
    const actor = this.registry.create("low-poly-cube", {
      id: "render3d-demo-cube",
      position: { x: 0, y: 2.7, z: this.defaultDepth },
    });
    actor.object.scale.setScalar(0.62);
    actor.update = (current, frame) => {
      const anchor = {
        x: frame.camera.x + frame.viewport.width * 0.5,
        y: frame.camera.y + 92,
      };
      const mapped = worldToThreePosition(anchor, frame.camera, frame.viewport, {
        pixelsPerUnit: this.pixelsPerUnit,
        depth: this.defaultDepth,
      });
      current.object.position.set(mapped.x, mapped.y + Math.sin(frame.timeSeconds * 2.2) * 0.1, mapped.z);
      rotateDemoActor(current, frame);
    };
    this.registry.addToScene(scene, actor);
  }

  private syncEventModels(events: Render3DEventVisuals, frame: Render3DFrame): void {
    if (!this.scene) {
      return;
    }
    this.syncJupiterSharks(events.jupiterSharks, frame);
    this.syncUranusEvents(events.uranusEvents, frame);
    this.syncMoonEvents(events.moonEvents, frame);
  }

  private syncJupiterSharks(sharks: Render3DJupiterSharkVisual[], frame: Render3DFrame): void {
    const liveIds = new Set<string>();
    for (const shark of sharks) {
      const actorId = `jupiter-shark:${shark.id}`;
      liveIds.add(actorId);
      const actor = this.ensureActor("low-poly-shark", actorId);
      const center = { x: shark.x + shark.width / 2, y: shark.y + shark.height / 2 };
      const position = worldToThreePosition(center, frame.camera, frame.viewport, {
        pixelsPerUnit: this.pixelsPerUnit,
        depth: -3.3,
      });
      actor.object.position.set(position.x, position.y, position.z);
      actor.object.scale.setScalar(0.86 + Math.sin(shark.age * 7) * 0.03);
      actor.object.rotation.z = Math.atan2(-shark.vy, shark.vx || 1);
      actor.object.rotation.y = Math.sin(shark.age * 5.4) * 0.18;
      actor.object.rotation.x = Math.sin(shark.age * 3.2) * 0.08;
      const tail = actor.object.userData.tail as THREE.Object3D | undefined;
      if (tail) {
        tail.rotation.y = Math.sin(shark.age * 13) * 0.58;
      }
      const mouth = actor.object.userData.mouth as THREE.Object3D | undefined;
      if (mouth) {
        const biteOpen = shark.biteCooldown > 0 ? 0.48 : 0.16 + Math.max(0, Math.sin(shark.age * 9)) * 0.18;
        mouth.scale.y = biteOpen;
      }
    }
    this.removeStaleActors("jupiter-shark:", liveIds);
  }

  private syncUranusEvents(events: Render3DUranusVisual[], frame: Render3DFrame): void {
    const livePlanets = new Set<string>();
    const liveChompers = new Set<string>();
    for (const event of events) {
      if (event.phase === "active") {
        const planetId = `uranus-planet:${event.id}`;
        livePlanets.add(planetId);
        const planet = this.ensureActor("saturn-planet", planetId);
        setObjectOpacity(planet.object, 0.46);
        const anchor = {
          x: frame.camera.x + frame.viewport.width * 0.78,
          y: frame.camera.y + Math.max(96, frame.viewport.height * 0.22),
        };
        const position = worldToThreePosition(anchor, frame.camera, frame.viewport, {
          pixelsPerUnit: this.pixelsPerUnit,
          depth: -11,
        });
        planet.object.position.set(position.x, position.y, position.z);
        planet.object.scale.setScalar(Math.max(2.9, Math.min(4.15, frame.viewport.width / 340)));
        planet.object.rotation.y = event.age * 0.22;
        planet.object.rotation.z = -0.16 + Math.sin(event.age * 0.3) * 0.04;
        const ringsFront = planet.object.userData.ringsFront as THREE.Object3D | undefined;
        const ringsBack = planet.object.userData.ringsBack as THREE.Object3D | undefined;
        if (ringsFront && ringsBack) {
          ringsFront.rotation.z = -0.18 + event.ringScroll * 0.002;
          ringsBack.rotation.z = -0.18 + event.ringScroll * 0.002;
        }

        const chomperId = `uranus-chomper:${event.id}`;
        liveChompers.add(chomperId);
        const chomper = this.ensureActor("ring-chomper", chomperId);
        const chomperPosition = worldToThreePosition(event.chomper, frame.camera, frame.viewport, {
          pixelsPerUnit: this.pixelsPerUnit,
          depth: -2.9,
        });
        chomper.object.position.set(chomperPosition.x, chomperPosition.y, chomperPosition.z);
        chomper.object.scale.setScalar(Math.max(1.15, event.chomper.radius / 76));
        chomper.object.rotation.y = Math.sin(event.age * 1.7) * 0.18;
        chomper.object.rotation.z = Math.sin(event.age * 2.2) * 0.08;
        const upperJaw = chomper.object.userData.upperJaw as THREE.Object3D | undefined;
        const lowerJaw = chomper.object.userData.lowerJaw as THREE.Object3D | undefined;
        const jawOpen = 0.34 + event.chomper.mouthOpen * 0.55;
        if (upperJaw && lowerJaw) {
          upperJaw.rotation.z = -Math.PI / 2 - jawOpen;
          lowerJaw.rotation.z = -Math.PI / 2 + jawOpen;
        }
      }
    }
    this.removeStaleActors("uranus-planet:", livePlanets);
    this.removeStaleActors("uranus-chomper:", liveChompers);
  }

  private syncMoonEvents(events: Render3DMoonVisual[], frame: Render3DFrame): void {
    const liveIds = new Set<string>();
    for (const event of events) {
      const actorId = `moon:${event.id}`;
      liveIds.add(actorId);
      const actor = this.ensureActor("moon-sphere", actorId);
      setObjectOpacity(actor.object, 0.84);
      const rise = easeOutCubic(event.moonRiseProgress);
      const descend = easeInCubic(event.moonDescendProgress);
      const hiddenY = frame.camera.y + frame.viewport.height + event.moonRadius + 112;
      const centerY = frame.camera.y + frame.viewport.height * 0.43;
      const y = event.moonVisualPhase === "descending"
        ? lerp(centerY, hiddenY, descend)
        : lerp(hiddenY, centerY, rise);
      const position = worldToThreePosition({ x: frame.camera.x + frame.viewport.width / 2, y }, frame.camera, frame.viewport, {
        pixelsPerUnit: this.pixelsPerUnit,
        depth: -7.5,
      });
      actor.object.position.set(position.x, position.y, position.z);
      actor.object.scale.setScalar(Math.max(1.1, event.moonRadius / 34));
      actor.object.rotation.y = event.age * 0.18;
      actor.object.rotation.x = Math.sin(event.age * 0.5) * 0.08;
    }
    this.removeStaleActors("moon:", liveIds);
  }

  private ensureActor(kind: string, id: string): ModelActor {
    const existing = this.registry.get(id);
    if (existing) {
      return existing;
    }
    const actor = this.registry.create(kind, { id });
    if (this.scene) {
      this.registry.addToScene(this.scene, actor);
    }
    return actor;
  }

  private removeStaleActors(prefix: string, liveIds: Set<string>): void {
    for (const id of this.registry.idsWithPrefix(prefix)) {
      if (!liveIds.has(id)) {
        this.registry.remove(id, this.scene ?? undefined);
      }
    }
  }

  private countEventModels(): Render3DModelCounts {
    return {
      jupiterSharks: this.registry.idsWithPrefix("jupiter-shark:").length,
      uranusPlanets: this.registry.idsWithPrefix("uranus-planet:").length,
      ringChompers: this.registry.idsWithPrefix("uranus-chomper:").length,
      moons: this.registry.idsWithPrefix("moon:").length,
    };
  }
}

function rotateDemoActor(actor: { object: THREE.Object3D }, frame: Pick<Render3DFrame, "deltaSeconds" | "timeSeconds">): void {
  actor.object.rotation.x += frame.deltaSeconds * 0.7;
  actor.object.rotation.y = frame.timeSeconds * 1.1;
}

export function createRender3DFrame(
  deltaSeconds: number,
  timeSeconds: number,
  camera: Render3DCamera2D,
  viewport: Render3DViewport,
): Render3DFrame {
  return { deltaSeconds, timeSeconds, camera, viewport };
}

function emptyModelCounts(): Render3DModelCounts {
  return {
    jupiterSharks: 0,
    uranusPlanets: 0,
    ringChompers: 0,
    moons: 0,
  };
}

function easeOutCubic(value: number): number {
  const t = Math.min(Math.max(value, 0), 1);
  return 1 - (1 - t) ** 3;
}

function easeInCubic(value: number): number {
  const t = Math.min(Math.max(value, 0), 1);
  return t ** 3;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * Math.min(Math.max(amount, 0), 1);
}

function setObjectOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const materials = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const material of materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.needsUpdate = true;
    }
  });
}
