export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface World2DPoint {
  x: number;
  y: number;
}

export interface Render3DCamera2D {
  x: number;
  y: number;
}

export interface Render3DViewport {
  width: number;
  height: number;
}

export interface Render3DFrame {
  deltaSeconds: number;
  timeSeconds: number;
  camera: Render3DCamera2D;
  viewport: Render3DViewport;
}

export interface Render3DConfig {
  enabled: boolean;
  demoEnabled: boolean;
  pixelsPerUnit: number;
  defaultDepth: number;
}

export interface Render3DConfigInput {
  search?: string;
  storage?: Pick<Storage, "getItem"> | null;
}

export interface WorldToThreeOptions {
  pixelsPerUnit?: number;
  depth?: number;
}

export const RENDER3D_DISABLED_STORAGE_KEY = "pixel-brawler-p2p.render3d.disabled";
export const RENDER3D_DEMO_STORAGE_KEY = "pixel-brawler-p2p.render3d.demo";
export const DEFAULT_RENDER3D_PIXELS_PER_UNIT = 64;
export const DEFAULT_RENDER3D_DEPTH = -5;

export function worldToThreePosition(
  point: World2DPoint,
  camera: Render3DCamera2D,
  viewport: Render3DViewport,
  options: WorldToThreeOptions = {},
): Vec3 {
  const pixelsPerUnit = options.pixelsPerUnit ?? DEFAULT_RENDER3D_PIXELS_PER_UNIT;
  const screenX = point.x - camera.x;
  const screenY = point.y - camera.y;
  return {
    x: (screenX - viewport.width / 2) / pixelsPerUnit,
    y: -(screenY - viewport.height / 2) / pixelsPerUnit,
    z: options.depth ?? DEFAULT_RENDER3D_DEPTH,
  };
}

export function resolveRender3DConfig(input: Render3DConfigInput = {}): Render3DConfig {
  const params = new URLSearchParams(input.search ?? defaultSearch());
  const storage = input.storage ?? defaultStorage();
  const queryEnabled = booleanQuery(params.get("render3d"));
  const queryDemo = booleanQuery(params.get("render3dDemo"));
  const storageDisabled = readStorageBoolean(storage, RENDER3D_DISABLED_STORAGE_KEY);
  const storageDemo = readStorageBoolean(storage, RENDER3D_DEMO_STORAGE_KEY);

  return {
    enabled: queryEnabled ?? !storageDisabled,
    demoEnabled: queryDemo ?? storageDemo,
    pixelsPerUnit: DEFAULT_RENDER3D_PIXELS_PER_UNIT,
    defaultDepth: DEFAULT_RENDER3D_DEPTH,
  };
}

function booleanQuery(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "disabled") {
    return false;
  }
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "enabled") {
    return true;
  }
  return undefined;
}

function readStorageBoolean(storage: Pick<Storage, "getItem"> | null, key: string): boolean {
  if (!storage) {
    return false;
  }
  try {
    const value = storage.getItem(key);
    return value === "1" || value === "true" || value === "on";
  } catch {
    return false;
  }
}

function defaultSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

function defaultStorage(): Pick<Storage, "getItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
