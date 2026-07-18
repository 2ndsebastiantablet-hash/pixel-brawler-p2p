import * as THREE from "three";
import type { Render3DFrame, Vec3 } from "./Render3DTypes";

export interface ModelActor {
  id: string;
  object: THREE.Object3D;
  update?: (actor: ModelActor, frame: Render3DFrame) => void;
  dispose?: (actor: ModelActor) => void;
}

export interface ModelActorInput {
  id: string;
  object: THREE.Object3D;
  position?: Vec3;
  update?: (actor: ModelActor, frame: Render3DFrame) => void;
  dispose?: (actor: ModelActor) => void;
}

export interface ModelActorContext {
  id: string;
  position?: Vec3;
}

export type ModelActorFactory = (context: ModelActorContext) => ModelActor;

export function createModelActor(input: ModelActorInput): ModelActor {
  input.object.name = input.id;
  if (input.position) {
    input.object.position.set(input.position.x, input.position.y, input.position.z);
  }
  return {
    id: input.id,
    object: input.object,
    update: input.update,
    dispose: input.dispose,
  };
}

export class ModelRegistry {
  private readonly factories = new Map<string, ModelActorFactory>();
  private readonly actors = new Map<string, ModelActor>();

  get actorCount(): number {
    return this.actors.size;
  }

  register(kind: string, factory: ModelActorFactory): void {
    this.factories.set(kind, factory);
  }

  create(kind: string, context: ModelActorContext): ModelActor {
    const factory = this.factories.get(kind);
    if (!factory) {
      throw new Error(`Unknown 3D model actor kind: ${kind}`);
    }
    const actor = factory(context);
    this.actors.set(actor.id, actor);
    return actor;
  }

  addToScene(scene: THREE.Scene, actor: ModelActor): void {
    if (!scene.children.includes(actor.object)) {
      scene.add(actor.object);
    }
    this.actors.set(actor.id, actor);
  }

  get(id: string): ModelActor | undefined {
    return this.actors.get(id);
  }

  updateAll(frame: Render3DFrame): void {
    for (const actor of this.actors.values()) {
      actor.update?.(actor, frame);
    }
  }

  disposeAll(scene?: THREE.Scene): void {
    for (const actor of this.actors.values()) {
      scene?.remove(actor.object);
      actor.dispose?.(actor);
      disposeObjectTree(actor.object);
    }
    this.actors.clear();
  }
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const material of materials) {
      material.dispose();
    }
  });
}
