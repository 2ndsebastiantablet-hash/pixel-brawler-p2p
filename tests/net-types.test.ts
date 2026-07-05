import { describe, expect, it } from "vitest";
import {
  decodePlayerStatePacket,
  encodePlayerStatePacket,
  interpolateRemoteState,
  type PlayerNetState,
} from "../src/net/NetTypes";

describe("network player packets", () => {
  it("round-trips compact player state packets", () => {
    const state: PlayerNetState = {
      id: "peer-a",
      label: "P2",
      x: 12.345,
      y: 87.654,
      velocityX: 456.7,
      velocityY: -321.4,
      facing: -1,
      grounded: false,
      sliding: true,
      sequence: 42,
      sentAt: 1000,
    };

    const packet = encodePlayerStatePacket(state);
    expect(packet.t).toBe("s");
    expect(Object.keys(packet).sort()).toEqual(["f", "g", "id", "l", "seq", "sl", "t", "ts", "vx", "vy", "x", "y"]);

    expect(decodePlayerStatePacket(packet)).toEqual({
      ...state,
      x: 12.35,
      y: 87.65,
      velocityX: 456.7,
      velocityY: -321.4,
    });
  });

  it("interpolates remote state toward the newest packet", () => {
    const current: PlayerNetState = {
      id: "peer-a",
      label: "P2",
      x: 0,
      y: 10,
      velocityX: 0,
      velocityY: 0,
      facing: 1,
      grounded: true,
      sliding: false,
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
});
