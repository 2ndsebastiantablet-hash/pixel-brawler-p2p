import type { Facing } from "../game/Physics";

export interface PlayerNetState {
  id: string;
  label: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: Facing;
  grounded: boolean;
  sliding: boolean;
  sequence: number;
  sentAt: number;
}

export interface PlayerStatePacket {
  t: "s";
  id: string;
  l: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: Facing;
  g: 0 | 1;
  sl: 0 | 1;
  seq: number;
  ts: number;
}

export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; from?: string }
  | { type: "lobby"; roomCode: string; peers: string[] }
  | { type: "peer-left"; peerId: string }
  | { type: "error"; message: string };

export interface RoomSummary {
  code: string;
  visibility: "public";
  createdAt: number;
  peers: number;
}

export function encodePlayerStatePacket(state: PlayerNetState): PlayerStatePacket {
  return {
    t: "s",
    id: state.id,
    l: state.label,
    x: round(state.x, 2),
    y: round(state.y, 2),
    vx: round(state.velocityX, 1),
    vy: round(state.velocityY, 1),
    f: state.facing,
    g: state.grounded ? 1 : 0,
    sl: state.sliding ? 1 : 0,
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
    label: packet.l,
    x: packet.x,
    y: packet.y,
    velocityX: packet.vx,
    velocityY: packet.vy,
    facing: packet.f,
    grounded: packet.g === 1,
    sliding: packet.sl === 1,
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
    typeof value.l === "string" &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.vx === "number" &&
    typeof value.vy === "number" &&
    (value.f === -1 || value.f === 1) &&
    (value.g === 0 || value.g === 1) &&
    (value.sl === 0 || value.sl === 1) &&
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
