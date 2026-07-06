import { describe, expect, it } from "vitest";
import {
  MAX_ROOM_PLAYERS,
  decodePlayerStatePacket,
  encodePlayerStatePacket,
  interpolateRemoteState,
  isSignalDataMessage,
  type CombatEventPacket,
  type PlayerNetState,
} from "../src/net/NetTypes";

describe("network player packets", () => {
  it("uses ten player rooms for public and private sessions", () => {
    expect(MAX_ROOM_PLAYERS).toBe(10);
  });

  it("round-trips compact player state packets", () => {
    const state: PlayerNetState = {
      id: "peer-a",
      clientId: "client-a",
      name: "Azure",
      color: "#00d8ff",
      x: 12.345,
      y: 87.654,
      velocityX: 456.7,
      velocityY: -321.4,
      facing: -1,
      grounded: false,
      sliding: true,
      action: "airDive",
      sequence: 42,
      sentAt: 1000,
    };

    const packet = encodePlayerStatePacket(state);
    expect(packet.t).toBe("s");
    expect(Object.keys(packet).sort()).toEqual([
      "a",
      "c",
      "cid",
      "f",
      "g",
      "id",
      "n",
      "seq",
      "sl",
      "t",
      "ts",
      "vx",
      "vy",
      "x",
      "y",
    ]);

    expect(decodePlayerStatePacket(packet)).toEqual({
      ...state,
      x: 12.35,
      y: 87.65,
      velocityX: 456.7,
      velocityY: -321.4,
    });
  });

  it("round-trips optional combat state on player packets", () => {
    const state: PlayerNetState = {
      id: "peer-a",
      clientId: "client-a",
      name: "Azure",
      color: "#00d8ff",
      x: 12,
      y: 88,
      velocityX: 0,
      velocityY: 0,
      facing: 1,
      grounded: true,
      sliding: false,
      action: "idle",
      sequence: 43,
      sentAt: 1010,
      weaponId: "sniper",
      hp: 64,
      statuses: ["marked", "legShotSlow"],
      respawnTimer: 0,
    };

    const packet = encodePlayerStatePacket(state);
    expect(packet.w).toBe("sniper");
    expect(packet.hp).toBe(64);
    expect(packet.st).toEqual(["marked", "legShotSlow"]);
    expect(decodePlayerStatePacket(packet)).toEqual(state);
  });

  it("interpolates remote state toward the newest packet", () => {
    const current: PlayerNetState = {
      id: "peer-a",
      clientId: "client-a",
      name: "Azure",
      color: "#00d8ff",
      x: 0,
      y: 10,
      velocityX: 0,
      velocityY: 0,
      facing: 1,
      grounded: true,
      sliding: false,
      action: "idle",
      sequence: 1,
      sentAt: 1000,
    };
    const target = { ...current, x: 100, y: 30, velocityX: 500, sequence: 2, sentAt: 1016 };

    expect(interpolateRemoteState(current, target, 0.25)).toEqual({
      ...target,
      x: 25,
      y: 15,
      velocityX: 125,
      velocityY: 0,
    });
  });

  it("accepts room-broadcast combat hit packets with target damage details", () => {
    const hit: CombatEventPacket = {
      t: "c",
      id: "hit-1",
      ownerId: "peer-a",
      weaponId: "pistol",
      action: "hit",
      x: 40,
      y: 50,
      ax: 1,
      ay: 0,
      label: "Pistol",
      ts: 1234,
      targetId: "peer-b",
      damage: 10,
      kx: 240,
      ky: -80,
      stun: 0.2,
      status: "daze",
    };

    expect(isSignalDataMessage({ type: "data", from: "peer-a", packet: hit })).toBe(true);
    expect(isSignalDataMessage({ type: "data", from: "peer-a", packet: { ...hit, targetId: 42 } })).toBe(false);
  });
});
