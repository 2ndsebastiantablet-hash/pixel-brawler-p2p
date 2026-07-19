import type { Facing, PlayerAction } from "../game/Physics";
import type { HitLocation } from "../game/combat/Damage";
import type { StatusEffectId } from "../game/combat/StatusEffects";
import type { WeaponId } from "../game/combat/Weapon";
import type { LoadoutState } from "../game/loadout/Loadout";
import { AFK_KICK_MS, AFK_WARNING_MS, MAX_ROOM_PLAYERS } from "./RoomConfig";

export { AFK_KICK_MS, AFK_WARNING_MS, MAX_ROOM_PLAYERS };

export interface PlayerNetState {
  id: string;
  clientId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: Facing;
  grounded: boolean;
  sliding: boolean;
  action: PlayerAction;
  sequence: number;
  sentAt: number;
  weaponId?: WeaponId;
  hp?: number;
  maxHp?: number;
  statuses?: StatusEffectId[];
  respawnTimer?: number;
  invulnerable?: number;
  chargeWeaponId?: WeaponId;
  chargeHeldMs?: number;
  aimX?: number;
  aimY?: number;
  deathAuraActive?: boolean;
  deathAuraPower?: number;
  rocketActive?: boolean;
  rocketLit?: boolean;
  van?: VanNetState;
  loadout?: LoadoutState;
  lastActivityAt?: number;
}

export interface VanNetState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: Facing;
  state: "stored" | "emerging" | "active" | "absorbing" | "destroyed";
  health: number;
  maxHealth: number;
  gas: number;
  maxGas: number;
  speedLevel: number;
  occupantId?: string;
  honkCooldown: number;
}

export interface PlayerStatePacket {
  t: "s";
  id: string;
  cid: string;
  n: string;
  c: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: Facing;
  g: 0 | 1;
  sl: 0 | 1;
  a: PlayerAction;
  seq: number;
  ts: number;
  w?: WeaponId;
  hp?: number;
  mh?: number;
  st?: StatusEffectId[];
  ko?: number;
  iv?: number;
  cw?: WeaponId;
  ch?: number;
  ax?: number;
  ay?: number;
  da?: 0 | 1;
  dp?: number;
  ra?: 0 | 1;
  rl?: 0 | 1;
  vn?: string;
  vo?: string;
  vxv?: number;
  vyv?: number;
  vvx?: number;
  vvy?: number;
  vf?: Facing;
  vs?: VanNetState["state"];
  vhp?: number;
  vmh?: number;
  vg?: number;
  vmg?: number;
  vl?: number;
  voc?: string;
  vhc?: number;
  lh?: WeaponId;
  rh?: WeaponId;
  fs?: WeaponId;
  bs?: WeaponId;
  at?: WeaponId;
  gb?: WeaponId;
  lg?: WeaponId;
  act?: number;
}

export interface CombatEventPacket {
  t: "c";
  id: string;
  ownerId: string;
  weaponId: string;
  action: "primary" | "secondary" | "throw" | "reload" | "hit" | "equip";
  x: number;
  y: number;
  ax: number;
  ay: number;
  label: string;
  ts: number;
  targetId?: string;
  damage?: number;
  kx?: number;
  ky?: number;
  stun?: number;
  status?: string;
  hitLocation?: HitLocation;
  range?: number;
}

export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from?: string; targetPeerId?: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from?: string; targetPeerId?: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; from?: string; targetPeerId?: string }
  | { type: "data"; from?: string; targetPeerId?: string; packet: PlayerStatePacket | CombatEventPacket }
  | { type: "lobby"; roomCode: string; visibility: "private" | "public"; serverName: string; hostName: string; hostClientId: string; peers: PeerInfo[] }
  | { type: "peer-left"; peerId: string }
  | { type: "kick"; targetPeerId?: string; targetClientId?: string; reason?: string }
  | { type: "ban"; targetPeerId?: string; targetClientId?: string; reason?: string }
  | { type: "server-closed"; reason?: string }
  | { type: "afk-warning"; message: string }
  | { type: "error"; message: string };

export interface PeerInfo {
  peerId: string;
  clientId: string;
  name: string;
  color: string;
  isHost: boolean;
}

export interface RoomSummary {
  code: string;
  visibility: "public";
  serverName: string;
  hostName: string;
  createdAt: number;
  peers: number;
  maxPeers?: number;
}

export function encodePlayerStatePacket(state: PlayerNetState): PlayerStatePacket {
  return {
    t: "s",
    id: state.id,
    cid: state.clientId,
    n: state.name,
    c: state.color,
    x: round(state.x, 2),
    y: round(state.y, 2),
    vx: round(state.velocityX, 1),
    vy: round(state.velocityY, 1),
    f: state.facing,
    g: state.grounded ? 1 : 0,
    sl: state.sliding ? 1 : 0,
    a: state.action,
    seq: state.sequence,
    ts: state.sentAt,
    ...(state.weaponId ? { w: state.weaponId } : {}),
    ...(typeof state.hp === "number" ? { hp: round(state.hp, 1) } : {}),
    ...(typeof state.maxHp === "number" ? { mh: round(state.maxHp, 1) } : {}),
    ...(state.statuses ? { st: state.statuses } : {}),
    ...(typeof state.respawnTimer === "number" ? { ko: round(state.respawnTimer, 2) } : {}),
    ...(typeof state.invulnerable === "number" ? { iv: round(state.invulnerable, 2) } : {}),
    ...(state.chargeWeaponId ? { cw: state.chargeWeaponId } : {}),
    ...(typeof state.chargeHeldMs === "number" ? { ch: Math.round(state.chargeHeldMs) } : {}),
    ...(typeof state.aimX === "number" ? { ax: round(state.aimX, 2) } : {}),
    ...(typeof state.aimY === "number" ? { ay: round(state.aimY, 2) } : {}),
    ...(typeof state.deathAuraActive === "boolean" ? { da: state.deathAuraActive ? 1 : 0 } : {}),
    ...(typeof state.deathAuraPower === "number" ? { dp: round(state.deathAuraPower, 2) } : {}),
    ...(typeof state.rocketActive === "boolean" ? { ra: state.rocketActive ? 1 : 0 } : {}),
    ...(typeof state.rocketLit === "boolean" ? { rl: state.rocketLit ? 1 : 0 } : {}),
    ...(state.van ? {
      vn: state.van.id,
      vo: state.van.ownerId,
      vxv: round(state.van.x, 2),
      vyv: round(state.van.y, 2),
      vvx: round(state.van.velocityX, 1),
      vvy: round(state.van.velocityY, 1),
      vf: state.van.facing,
      vs: state.van.state,
      vhp: round(state.van.health, 1),
      vmh: round(state.van.maxHealth, 1),
      vg: round(state.van.gas, 1),
      vmg: round(state.van.maxGas, 1),
      vl: state.van.speedLevel,
      ...(state.van.occupantId ? { voc: state.van.occupantId } : {}),
      vhc: round(state.van.honkCooldown, 2),
    } : {}),
    ...(state.loadout?.leftHand ? { lh: state.loadout.leftHand } : {}),
    ...(state.loadout?.rightHand ? { rh: state.loadout.rightHand } : {}),
    ...(state.loadout?.frontStrap ? { fs: state.loadout.frontStrap } : {}),
    ...(state.loadout?.backStrap ? { bs: state.loadout.backStrap } : {}),
    ...(state.loadout?.attachment ? { at: state.loadout.attachment } : {}),
    ...(state.loadout?.grabber ? { gb: state.loadout.grabber } : {}),
    ...(state.loadout?.legs ? { lg: state.loadout.legs } : {}),
    ...(typeof state.lastActivityAt === "number" ? { act: Math.round(state.lastActivityAt) } : {}),
  };
}

export function decodePlayerStatePacket(packet: unknown): PlayerNetState {
  if (!isStatePacket(packet)) {
    throw new Error("Invalid player state packet");
  }

  return {
    id: packet.id,
    clientId: packet.cid,
    name: packet.n,
    color: packet.c,
    x: packet.x,
    y: packet.y,
    velocityX: packet.vx,
    velocityY: packet.vy,
    facing: packet.f,
    grounded: packet.g === 1,
    sliding: packet.sl === 1,
    action: packet.a,
    sequence: packet.seq,
    sentAt: packet.ts,
    ...(packet.w ? { weaponId: packet.w } : {}),
    ...(typeof packet.hp === "number" ? { hp: packet.hp } : {}),
    ...(typeof packet.mh === "number" ? { maxHp: packet.mh } : {}),
    ...(packet.st ? { statuses: packet.st } : {}),
    ...(typeof packet.ko === "number" ? { respawnTimer: packet.ko } : {}),
    ...(typeof packet.iv === "number" ? { invulnerable: packet.iv } : {}),
    ...(packet.cw ? { chargeWeaponId: packet.cw } : {}),
    ...(typeof packet.ch === "number" ? { chargeHeldMs: packet.ch } : {}),
    ...(typeof packet.ax === "number" ? { aimX: packet.ax } : {}),
    ...(typeof packet.ay === "number" ? { aimY: packet.ay } : {}),
    ...(packet.da !== undefined ? { deathAuraActive: packet.da === 1 } : {}),
    ...(typeof packet.dp === "number" ? { deathAuraPower: packet.dp } : {}),
    ...(packet.ra !== undefined ? { rocketActive: packet.ra === 1 } : {}),
    ...(packet.rl !== undefined ? { rocketLit: packet.rl === 1 } : {}),
    ...(packet.vn && packet.vo && typeof packet.vxv === "number" && typeof packet.vyv === "number" && typeof packet.vvx === "number" && typeof packet.vvy === "number" && (packet.vf === -1 || packet.vf === 1) && packet.vs ? {
      van: {
        id: packet.vn,
        ownerId: packet.vo,
        x: packet.vxv,
        y: packet.vyv,
        velocityX: packet.vvx,
        velocityY: packet.vvy,
        facing: packet.vf,
        state: packet.vs,
        health: packet.vhp ?? 0,
        maxHealth: packet.vmh ?? 1,
        gas: packet.vg ?? 0,
        maxGas: packet.vmg ?? 1,
        speedLevel: packet.vl ?? 0,
        ...(packet.voc ? { occupantId: packet.voc } : {}),
        honkCooldown: packet.vhc ?? 0,
      },
    } : {}),
    ...(packet.lh || packet.rh || packet.fs || packet.bs || packet.at || packet.gb || packet.lg ? {
      loadout: {
        ...(packet.lh ? { leftHand: packet.lh } : {}),
        ...(packet.rh ? { rightHand: packet.rh } : {}),
        ...(packet.fs ? { frontStrap: packet.fs } : {}),
        ...(packet.bs ? { backStrap: packet.bs } : {}),
        ...(packet.at ? { attachment: packet.at } : {}),
        ...(packet.gb ? { grabber: packet.gb } : {}),
        ...(packet.lg ? { legs: packet.lg } : {}),
      },
    } : {}),
    ...(typeof packet.act === "number" ? { lastActivityAt: packet.act } : {}),
  };
}

export function isStatePacket(packet: unknown): packet is PlayerStatePacket {
  if (!packet || typeof packet !== "object") {
    return false;
  }
  const value = packet as Partial<PlayerStatePacket>;
  return (
    value.t === "s" &&
    typeof value.id === "string" &&
    typeof value.cid === "string" &&
    typeof value.n === "string" &&
    typeof value.c === "string" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.vx === "number" &&
    typeof value.vy === "number" &&
    (value.f === -1 || value.f === 1) &&
    (value.g === 0 || value.g === 1) &&
    (value.sl === 0 || value.sl === 1) &&
    isPlayerAction(value.a) &&
    typeof value.seq === "number" &&
    typeof value.ts === "number" &&
    (value.w === undefined || typeof value.w === "string") &&
    (value.hp === undefined || typeof value.hp === "number") &&
    (value.mh === undefined || typeof value.mh === "number") &&
    (value.st === undefined || (Array.isArray(value.st) && value.st.every((item) => typeof item === "string"))) &&
    (value.ko === undefined || typeof value.ko === "number") &&
    (value.iv === undefined || typeof value.iv === "number") &&
    (value.cw === undefined || typeof value.cw === "string") &&
    (value.ch === undefined || typeof value.ch === "number") &&
    (value.ax === undefined || typeof value.ax === "number") &&
    (value.ay === undefined || typeof value.ay === "number") &&
    (value.da === undefined || value.da === 0 || value.da === 1) &&
    (value.dp === undefined || typeof value.dp === "number") &&
    (value.ra === undefined || value.ra === 0 || value.ra === 1) &&
    (value.rl === undefined || value.rl === 0 || value.rl === 1) &&
    (value.vn === undefined || typeof value.vn === "string") &&
    (value.vo === undefined || typeof value.vo === "string") &&
    (value.vxv === undefined || typeof value.vxv === "number") &&
    (value.vyv === undefined || typeof value.vyv === "number") &&
    (value.vvx === undefined || typeof value.vvx === "number") &&
    (value.vvy === undefined || typeof value.vvy === "number") &&
    (value.vf === undefined || value.vf === -1 || value.vf === 1) &&
    (value.vs === undefined || value.vs === "stored" || value.vs === "emerging" || value.vs === "active" || value.vs === "absorbing" || value.vs === "destroyed") &&
    (value.vhp === undefined || typeof value.vhp === "number") &&
    (value.vmh === undefined || typeof value.vmh === "number") &&
    (value.vg === undefined || typeof value.vg === "number") &&
    (value.vmg === undefined || typeof value.vmg === "number") &&
    (value.vl === undefined || typeof value.vl === "number") &&
    (value.voc === undefined || typeof value.voc === "string") &&
    (value.vhc === undefined || typeof value.vhc === "number") &&
    (value.lh === undefined || typeof value.lh === "string") &&
    (value.rh === undefined || typeof value.rh === "string") &&
    (value.fs === undefined || typeof value.fs === "string") &&
    (value.bs === undefined || typeof value.bs === "string") &&
    (value.at === undefined || typeof value.at === "string") &&
    (value.lg === undefined || typeof value.lg === "string") &&
    (value.act === undefined || typeof value.act === "number")
  );
}

export function isCombatEventPacket(packet: unknown): packet is CombatEventPacket {
  if (!packet || typeof packet !== "object") {
    return false;
  }
  const value = packet as Partial<CombatEventPacket>;
  return (
    value.t === "c" &&
    typeof value.id === "string" &&
    typeof value.ownerId === "string" &&
    typeof value.weaponId === "string" &&
    (value.action === "primary" ||
      value.action === "secondary" ||
      value.action === "throw" ||
      value.action === "reload" ||
      value.action === "hit" ||
      value.action === "equip") &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.ax === "number" &&
    typeof value.ay === "number" &&
    typeof value.label === "string" &&
    typeof value.ts === "number" &&
    (value.targetId === undefined || typeof value.targetId === "string") &&
    (value.damage === undefined || typeof value.damage === "number") &&
    (value.kx === undefined || typeof value.kx === "number") &&
    (value.ky === undefined || typeof value.ky === "number") &&
    (value.stun === undefined || typeof value.stun === "number") &&
    (value.status === undefined || typeof value.status === "string") &&
    (value.hitLocation === undefined || value.hitLocation === "head" || value.hitLocation === "body" || value.hitLocation === "leg") &&
    (value.range === undefined || typeof value.range === "number")
  );
}

export function isSignalDataMessage(message: unknown): message is Extract<SignalMessage, { type: "data" }> {
  if (!message || typeof message !== "object") {
    return false;
  }
  const value = message as Partial<Extract<SignalMessage, { type: "data" }>>;
  return value.type === "data" && (isStatePacket(value.packet) || isCombatEventPacket(value.packet));
}

export function interpolateRemoteState(
  current: PlayerNetState,
  target: PlayerNetState,
  alpha: number,
): PlayerNetState {
  const clamped = Math.min(Math.max(alpha, 0), 1);
  return {
    ...target,
    x: lerp(current.x, target.x, clamped),
    y: lerp(current.y, target.y, clamped),
    velocityX: lerp(current.velocityX, target.velocityX, clamped),
    velocityY: lerp(current.velocityY, target.velocityY, clamped),
  };
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function isPlayerAction(value: unknown): value is PlayerAction {
  return (
    value === "idle" ||
    value === "run" ||
    value === "jump" ||
    value === "doubleJump" ||
    value === "slide" ||
    value === "lowSlide" ||
    value === "airDive" ||
    value === "duck" ||
    value === "groundSlam" ||
    value === "slamLanding"
  );
}
