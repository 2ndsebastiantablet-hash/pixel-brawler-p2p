import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADOUT,
  assignLoadoutItem,
  isSlotCompatible,
  normalizeLoadout,
} from "../src/game/loadout/Loadout";

describe("loadout equipment slots", () => {
  it("starts with pistol, knife, Wings, Death Aura, and Virgin Blood equipped", () => {
    expect(DEFAULT_LOADOUT).toEqual({
      leftHand: "pistol",
      rightHand: "knife",
      frontStrap: "wings",
      backStrap: "death-aura",
      attachment: "virgin-blood",
    });
  });

  it("normalizes missing or incompatible saved slots back to legal defaults", () => {
    expect(normalizeLoadout({
      leftHand: "rocket",
      rightHand: "knife",
      frontStrap: "pistol",
      backStrap: "death-aura",
      attachment: "axe",
    })).toEqual({
      leftHand: "rocket",
      rightHand: "rocket",
      frontStrap: "wings",
      backStrap: "death-aura",
      attachment: "virgin-blood",
    });
  });

  it("enforces slot compatibility and two-handed hand occupancy", () => {
    expect(isSlotCompatible("wings", "frontStrap")).toBe(true);
    expect(isSlotCompatible("wings", "leftHand")).toBe(false);
    expect(isSlotCompatible("pistol", "attachment")).toBe(false);
    expect(isSlotCompatible("virgin-blood", "attachment")).toBe(true);

    const withAxe = assignLoadoutItem(DEFAULT_LOADOUT, "leftHand", "axe");
    expect(withAxe.leftHand).toBe("axe");
    expect(withAxe.rightHand).toBe("axe");

    const withKnife = assignLoadoutItem(withAxe, "rightHand", "knife");
    expect(withKnife.leftHand).toBeUndefined();
    expect(withKnife.rightHand).toBe("knife");
  });
});
