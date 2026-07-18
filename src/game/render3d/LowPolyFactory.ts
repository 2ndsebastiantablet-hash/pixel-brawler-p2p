import * as THREE from "three";

export interface LowPolyMeshOptions {
  color?: THREE.ColorRepresentation;
  scale?: number;
}

export function createLowPolyCube(name: string, options: LowPolyMeshOptions = {}): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(options.scale ?? 1, options.scale ?? 1, options.scale ?? 1, 1, 1, 1),
    createLowPolyMaterial(options.color ?? 0x44ccff),
  );
  mesh.name = name;
  return mesh;
}

export function createLowPolyPlanetPlaceholder(
  name: string,
  options: LowPolyMeshOptions = {},
): THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(options.scale ?? 1.35, 2),
    createLowPolyMaterial(options.color ?? 0xffd86a),
  );
  mesh.name = name;
  return mesh;
}

export function createLowPolySharkPlaceholder(name: string, options: LowPolyMeshOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const scale = options.scale ?? 1;
  const bodyMaterial = createLowPolyMaterial(options.color ?? 0x6dd7ff);
  const bellyMaterial = createLowPolyMaterial(0xd6f7ff);
  const finMaterial = createLowPolyMaterial(0x2f7ca8);

  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68 * scale, 0), bodyMaterial);
  body.name = "body";
  body.scale.set(1.55, 0.48, 0.54);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.46 * scale, 0.72 * scale, 5, 1, false), bodyMaterial);
  head.name = "head";
  head.rotation.z = -Math.PI / 2;
  head.position.x = 1.08 * scale;

  const belly = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 * scale, 0), bellyMaterial);
  belly.name = "belly";
  belly.scale.set(1.35, 0.18, 0.3);
  belly.position.y = -0.28 * scale;

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35 * scale, 0.76 * scale, 3, 1, false), finMaterial);
  tail.name = "tail";
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -1.14 * scale;

  const topFin = new THREE.Mesh(new THREE.ConeGeometry(0.24 * scale, 0.62 * scale, 3, 1, false), finMaterial);
  topFin.name = "top-fin";
  topFin.rotation.x = Math.PI;
  topFin.position.set(-0.18 * scale, 0.58 * scale, 0);

  const leftFin = new THREE.Mesh(new THREE.ConeGeometry(0.22 * scale, 0.55 * scale, 3, 1, false), finMaterial);
  leftFin.name = "left-fin";
  leftFin.rotation.set(0, 0, -Math.PI * 0.42);
  leftFin.position.set(0.02 * scale, -0.08 * scale, 0.52 * scale);

  const rightFin = leftFin.clone();
  rightFin.name = "right-fin";
  rightFin.rotation.z = Math.PI * 0.42;
  rightFin.position.z = -0.52 * scale;

  group.add(body, belly, head, tail, topFin, leftFin, rightFin);
  return group;
}

function createLowPolyMaterial(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.84,
    metalness: 0.02,
    flatShading: true,
  });
}
