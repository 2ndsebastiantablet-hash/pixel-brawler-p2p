import { describe, expect, it } from "vitest";
import {
  AFK_KICK_MS,
  AFK_WARNING_MS,
  MAX_ROOM_PLAYERS,
  decodePlayerStatePacket,
  encodePlayerStatePacket,
  interpolateRemoteState,
  isSignalDataMessage,
  type CombatEventPacket,
  type PlayerNetState,
} from "../src/net/NetTypes";
import { resolveSignalingBaseUrl, toWsBase } from "../src/net/SignalingClient";

describe("network player packets", () => {
  it("uses ten player rooms for public and private sessions", () => {
    expect(MAX_ROOM_PLAYERS).toBe(10);
    expect(AFK_WARNING_MS).toBe(5 * 60 * 1000);
    expect(AFK_KICK_MS).toBe(6 * 60 * 1000);
  });

  it("uses the deployed Worker URL on Pages when no env override is configured", () => {
    expect(resolveSignalingBaseUrl(undefined, "https://pixel-brawler-p2p.pages.dev")).toBe("https://pixel-brawler-p2p-signaling.2ndsebastiantablet.workers.dev");
    expect(resolveSignalingBaseUrl(undefined, "http://127.0.0.1:5173")).toBe("http://localhost:8787");
    expect(resolveSignalingBaseUrl("https://example.com/", "https://pixel-brawler-p2p.pages.dev")).toBe("https://example.com");
    expect(toWsBase("https://pixel-brawler-p2p-signaling.2ndsebastiantablet.workers.dev")).toBe("wss://pixel-brawler-p2p-signaling.2ndsebastiantablet.workers.dev");
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
      weaponId: "chainsaw",
      hp: 64,
      maxHp: 180,
      statuses: ["marked", "legShotSlow", "poison", "spikePoison", "spikeMode"],
      respawnTimer: 0,
      invulnerable: 1.95,
      chargeWeaponId: "lightning-rod",
      chargeHeldMs: 1850,
      aimX: 0.03,
      aimY: -1,
      deathAuraActive: true,
      deathAuraPower: 0.72,
      rocketActive: true,
      rocketLit: false,
      van: {
        id: "van-peer-a",
        ownerId: "peer-a",
        x: 220,
        y: 468,
        velocityX: 112,
        velocityY: 0,
        facing: 1,
        state: "active",
        health: 140,
        maxHealth: 180,
        gas: 62,
        maxGas: 100,
        speedLevel: 3,
        occupantId: "peer-a",
        honkCooldown: 1.2,
      },
      loadout: {
        leftHand: "pistol",
        rightHand: "knife",
        frontStrap: "spikes",
        backStrap: "death-aura",
        attachment: "chainsaw",
        legs: "super-legs",
      },
    };

    const packet = encodePlayerStatePacket(state);
    expect(packet.w).toBe("chainsaw");
    expect(packet.hp).toBe(64);
    expect(packet.mh).toBe(180);
    expect(packet.st).toEqual(["marked", "legShotSlow", "poison", "spikePoison", "spikeMode"]);
    expect(packet.iv).toBe(1.95);
    expect(packet.cw).toBe("lightning-rod");
    expect(packet.ch).toBe(1850);
    expect(packet.ax).toBe(0.03);
    expect(packet.ay).toBe(-1);
    expect(packet.da).toBe(1);
    expect(packet.dp).toBe(0.72);
    expect(packet.ra).toBe(1);
    expect(packet.rl).toBe(0);
    expect(packet.vn).toBe("van-peer-a");
    expect(packet.vs).toBe("active");
    expect(packet.vo).toBe("peer-a");
    expect(packet.vhp).toBe(140);
    expect(packet.vg).toBe(62);
    expect(packet.vl).toBe(3);
    expect(packet.lh).toBe("pistol");
    expect(packet.rh).toBe("knife");
    expect(packet.fs).toBe("spikes");
    expect(packet.bs).toBe("death-aura");
    expect(packet.at).toBe("chainsaw");
    expect(packet.lg).toBe("super-legs");
    expect(decodePlayerStatePacket(packet)).toEqual(state);
  });

  it("does not invent loadout slots when an empty loadout is broadcast", () => {
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
      sequence: 44,
      sentAt: 1020,
      loadout: {},
    };

    const packet = encodePlayerStatePacket(state);
    expect(packet.lh).toBeUndefined();
    expect(packet.rh).toBeUndefined();
    expect(packet.fs).toBeUndefined();
    expect(packet.bs).toBeUndefined();
    expect(packet.at).toBeUndefined();
    expect(packet.lg).toBeUndefined();
    expect(decodePlayerStatePacket(packet).loadout).toBeUndefined();
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
      hitLocation: "head",
    };

    expect(isSignalDataMessage({ type: "data", from: "peer-a", packet: hit })).toBe(true);
    expect(isSignalDataMessage({ type: "data", from: "peer-a", packet: { ...hit, targetId: 42 } })).toBe(false);
    expect(isSignalDataMessage({ type: "data", from: "peer-a", packet: { ...hit, hitLocation: "wing" } })).toBe(false);
  });

  it("accepts AFK warning and activity signal messages", () => {
    expect(isSignalDataMessage({
      type: "data",
      from: "peer-a",
      packet: {
        t: "s",
        id: "peer-a",
        cid: "client-a",
        n: "Azure",
        c: "#00d8ff",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        f: 1,
        g: 1,
        sl: 0,
        a: "idle",
        seq: 1,
        ts: 1000,
        act: 1000,
      },
    })).toBe(true);
  });
});
