import type { Facing, PlayerAction } from "../game/Physics";

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
}

export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; from?: string }
  | { type: "lobby"; roomCode: string; visibility: "private" | "public"; serverName: string; hostName: string; hostClientId: string; peers: PeerInfo[] }
  | { type: "peer-left"; peerId: string }
  | { type: "kick"; targetPeerId?: string; targetClientId?: string; reason?: string }
  | { type: "ban"; targetPeerId?: string; targetClientId?: string; reason?: string }
  | { type: "server-closed"; reason?: string }
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
    typeof value.ts === "number"
  );
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
