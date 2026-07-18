import * as THREE from "three";
import { createLowPolyCube, createLowPolyPlanetPlaceholder, createLowPolySharkPlaceholder } from "./LowPolyFactory";
import { ModelRegistry, createModelActor } from "./ModelRegistry";
import type { Render3DCamera2D, Render3DConfig, Render3DFrame, Render3DViewport } from "./Render3DTypes";
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
  error?: string;
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
    };

    if (this.statusSnapshot.enabled) {
      this.initialize();
    }
  }

  get status(): ThreeLayerStatus {
    return {
      ...this.statusSnapshot,
      actorCount: this.registry.actorCount,
    };
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
      };
    } catch (error) {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.statusSnapshot = {
        enabled: true,
        available: false,
        actorCount: 0,
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
