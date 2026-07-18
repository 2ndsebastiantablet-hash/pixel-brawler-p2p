import * as THREE from "three";

export interface LowPolyMeshOptions {
  color?: THREE.ColorRepresentation;
  scale?: number;
}

export interface RingChomperOptions extends LowPolyMeshOptions {
  mouthOpen?: number;
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
  const bodyMaterial = createLowPolyMaterial(options.color ?? 0x7f959c);
  const headMaterial = createLowPolyMaterial(0x9fb4b9);
  const finMaterial = createLowPolyMaterial(0x2f6f45);
  const eyeMaterial = createLowPolyMaterial(0x05060a);

  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72 * scale, 0), bodyMaterial);
  body.name = "body";
  body.scale.set(1.72, 0.48, 0.56);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.5 * scale, 0.74 * scale, 4, 1, false), headMaterial);
  head.name = "head-wedge";
  head.rotation.z = -Math.PI / 2;
  head.position.x = 1.16 * scale;

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.1 * scale, 0.2 * scale), eyeMaterial);
  mouth.name = "mouth";
  mouth.position.set(1.54 * scale, -0.13 * scale, 0);

  const tail = new THREE.Group();
  tail.name = "tail";
  tail.position.x = -1.18 * scale;
  const tailTop = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale, 0.62 * scale, 3, 1, false), finMaterial);
  tailTop.name = "tail-top";
  tailTop.rotation.set(0, 0, Math.PI * 0.55);
  tailTop.position.set(-0.16 * scale, 0.24 * scale, 0);
  const tailBottom = tailTop.clone();
  tailBottom.name = "tail-bottom";
  tailBottom.rotation.z = Math.PI * 0.45;
  tailBottom.position.y = -0.24 * scale;
  tail.add(tailTop, tailBottom);

  const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.23 * scale, 0.64 * scale, 3, 1, false), finMaterial);
  dorsalFin.name = "dorsal-fin";
  dorsalFin.rotation.x = Math.PI;
  dorsalFin.position.set(-0.18 * scale, 0.6 * scale, 0);

  const lowerFin = new THREE.Mesh(new THREE.ConeGeometry(0.18 * scale, 0.44 * scale, 3, 1, false), finMaterial);
  lowerFin.name = "lower-fin";
  lowerFin.position.set(0.16 * scale, -0.48 * scale, 0);

  const leftFin = new THREE.Mesh(new THREE.ConeGeometry(0.22 * scale, 0.55 * scale, 3, 1, false), finMaterial);
  leftFin.name = "left-fin";
  leftFin.rotation.set(0, 0, -Math.PI * 0.42);
  leftFin.position.set(0.02 * scale, -0.08 * scale, 0.52 * scale);

  const rightFin = leftFin.clone();
  rightFin.name = "right-fin";
  rightFin.rotation.z = Math.PI * 0.42;
  rightFin.position.z = -0.52 * scale;

  const leftEye = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 * scale, 0), eyeMaterial);
  leftEye.name = "left-eye";
  leftEye.position.set(1.4 * scale, 0.12 * scale, 0.26 * scale);
  const rightEye = leftEye.clone();
  rightEye.name = "right-eye";
  rightEye.position.z = -0.26 * scale;

  group.add(body, head, tail, dorsalFin, lowerFin, leftFin, rightFin, leftEye, rightEye, mouth);
  group.userData.tail = tail;
  group.userData.mouth = mouth;
  return group;
}

export function createSaturnPlanet(name: string, options: LowPolyMeshOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const scale = options.scale ?? 1;
  const planet = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.45 * scale, 3),
    createLowPolyMaterial(options.color ?? 0xf2c46d),
  );
  planet.name = "planet";
  const bandMaterial = createLowPolyMaterial(0xc58b4c);
  for (let index = -2; index <= 2; index += 1) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.25 * scale, 0.08 * scale, 0.04 * scale), bandMaterial);
    band.name = `band-${index + 3}`;
    band.position.y = index * 0.32 * scale;
    band.position.z = 1.18 * scale;
    group.add(band);
  }
  const ringsBack = new THREE.Mesh(
    new THREE.TorusGeometry(2.65 * scale, 0.08 * scale, 6, 32),
    createLowPolyMaterial(0xd9b064),
  );
  ringsBack.name = "rings-back";
  ringsBack.rotation.x = Math.PI * 0.62;
  ringsBack.rotation.z = -0.18;
  ringsBack.position.z = -0.15 * scale;

  const ringsFront = new THREE.Mesh(
    new THREE.TorusGeometry(2.82 * scale, 0.11 * scale, 6, 32),
    createLowPolyMaterial(0xffe2a0),
  );
  ringsFront.name = "rings-front";
  ringsFront.rotation.copy(ringsBack.rotation);
  ringsFront.position.z = 0.16 * scale;
  const arenaRingBack = new THREE.Mesh(
    new THREE.TorusGeometry(3.34 * scale, 0.045 * scale, 4, 40),
    createLowPolyMaterial(0x9c8752),
  );
  arenaRingBack.name = "arena-ring-back";
  arenaRingBack.rotation.copy(ringsBack.rotation);
  arenaRingBack.position.z = -0.38 * scale;
  const arenaRingFront = new THREE.Mesh(
    new THREE.TorusGeometry(3.58 * scale, 0.06 * scale, 4, 40),
    createLowPolyMaterial(0xffd86a),
  );
  arenaRingFront.name = "arena-ring-front";
  arenaRingFront.rotation.copy(ringsBack.rotation);
  arenaRingFront.position.z = 0.36 * scale;
  group.add(arenaRingBack, ringsBack, planet, ringsFront, arenaRingFront);
  group.userData.planet = planet;
  group.userData.ringsFront = ringsFront;
  group.userData.ringsBack = ringsBack;
  group.userData.arenaRingFront = arenaRingFront;
  group.userData.arenaRingBack = arenaRingBack;
  return group;
}

export function createMarsPlanet(name: string, options: LowPolyMeshOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const scale = options.scale ?? 1;
  const planet = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18 * scale, 2),
    createLowPolyMaterial(options.color ?? 0xd94d2b),
  );
  planet.name = "planet";
  const darkMaterial = createLowPolyMaterial(0x6a251d);
  const craterA = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 0.04 * scale, 6), darkMaterial);
  craterA.name = "crater-a";
  craterA.position.set(-0.42 * scale, 0.28 * scale, 1.02 * scale);
  craterA.rotation.x = Math.PI / 2;
  const craterB = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.16 * scale, 0.04 * scale, 6), darkMaterial);
  craterB.name = "crater-b";
  craterB.position.set(0.38 * scale, -0.22 * scale, 1.04 * scale);
  craterB.rotation.x = Math.PI / 2;
  const polarCap = new THREE.Mesh(new THREE.BoxGeometry(0.82 * scale, 0.1 * scale, 0.06 * scale), createLowPolyMaterial(0xffb36b));
  polarCap.name = "orange-band";
  polarCap.position.set(0.05 * scale, 0.48 * scale, 1.04 * scale);
  const greenGlow = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.44 * scale, 1),
    new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  greenGlow.name = "green-glow";
  const energyRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.58 * scale, 0.035 * scale, 4, 28),
    new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.72, depthWrite: false }),
  );
  energyRing.name = "green-energy-ring";
  energyRing.rotation.x = Math.PI * 0.58;
  group.add(greenGlow, planet, craterA, craterB, polarCap, energyRing);
  group.userData.planet = planet;
  group.userData.greenGlow = greenGlow;
  group.userData.energyRing = energyRing;
  return group;
}

export function createRingChomper(name: string, options: RingChomperOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const scale = options.scale ?? 1;
  const bodyMaterial = createLowPolyMaterial(options.color ?? 0xffd84d);
  const jawMaterial = createLowPolyMaterial(0xf2b233);
  const eyeMaterial = createLowPolyMaterial(0x05060a);

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18 * scale, 1), bodyMaterial);
  body.name = "body";

  const upperJaw = new THREE.Mesh(new THREE.ConeGeometry(0.68 * scale, 1.08 * scale, 4, 1, false), jawMaterial);
  upperJaw.name = "upper-jaw";
  upperJaw.rotation.z = -Math.PI / 2 - (options.mouthOpen ?? 0.55) * 0.45;
  upperJaw.position.set(0.88 * scale, 0.36 * scale, 0);

  const lowerJaw = new THREE.Mesh(new THREE.ConeGeometry(0.68 * scale, 1.08 * scale, 4, 1, false), jawMaterial);
  lowerJaw.name = "lower-jaw";
  lowerJaw.rotation.z = -Math.PI / 2 + (options.mouthOpen ?? 0.55) * 0.45;
  lowerJaw.position.set(0.88 * scale, -0.36 * scale, 0);

  const leftEye = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * scale, 0), eyeMaterial);
  leftEye.name = "left-eye";
  leftEye.position.set(0.2 * scale, 0.52 * scale, 0.78 * scale);

  const rightEye = leftEye.clone();
  rightEye.name = "right-eye";
  rightEye.position.z = -0.78 * scale;

  const spikes = new THREE.Group();
  spikes.name = "spikes";
  const spikeMaterial = createLowPolyMaterial(0xffef8f);
  for (let index = 0; index < 5; index += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.15 * scale, 0.46 * scale, 3), spikeMaterial);
    spike.name = `spike-${index}`;
    spike.position.set(-0.52 * scale, (index - 2) * 0.3 * scale, index % 2 === 0 ? 0.88 * scale : -0.88 * scale);
    spike.rotation.x = Math.PI / 2;
    spikes.add(spike);
  }

  group.add(body, upperJaw, lowerJaw, leftEye, rightEye, spikes);
  group.userData.upperJaw = upperJaw;
  group.userData.lowerJaw = lowerJaw;
  return group;
}

export function createMoonSphere(name: string, options: LowPolyMeshOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const scale = options.scale ?? 1;
  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.2 * scale, 2),
    createLowPolyMaterial(options.color ?? 0xd6f2ff),
  );
  sphere.name = "sphere";
  const craterMaterial = createLowPolyMaterial(0x8fa0b4);
  const craters = [
    { name: "crater-a", x: -0.42, y: 0.34, z: 1.05, size: 0.23 },
    { name: "crater-b", x: 0.38, y: -0.08, z: 1.08, size: 0.3 },
    { name: "crater-c", x: -0.08, y: -0.46, z: 1.1, size: 0.17 },
  ];
  for (const crater of craters) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(crater.size * scale, crater.size * scale, 0.035 * scale, 7), craterMaterial);
    mesh.name = crater.name;
    mesh.position.set(crater.x * scale, crater.y * scale, crater.z * scale);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
  }
  const glow = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.42 * scale, 1),
    new THREE.MeshBasicMaterial({ color: 0xd6f2ff, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  glow.name = "glow";
  group.add(sphere, glow);
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
