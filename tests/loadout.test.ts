import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADOUT,
  assignLoadoutItem,
  assignHeldLoadoutItem,
  isSlotCompatible,
  normalizeLoadout,
  swapAttachmentWithHand,
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
      attachment: "axe",
    });
  });

  it("enforces slot compatibility and two-handed hand occupancy", () => {
    expect(isSlotCompatible("wings", "frontStrap")).toBe(true);
    expect(isSlotCompatible("wings", "leftHand")).toBe(false);
    expect(isSlotCompatible("pistol", "attachment")).toBe(true);
    expect(isSlotCompatible("rocket", "attachment")).toBe(true);
    expect(isSlotCompatible("machete", "attachment")).toBe(true);
    expect(isSlotCompatible("slingshot", "attachment")).toBe(true);
    expect(isSlotCompatible("hands", "attachment")).toBe(false);
    expect(isSlotCompatible("death-aura", "attachment")).toBe(false);
    expect(isSlotCompatible("wings", "attachment")).toBe(false);
    expect(isSlotCompatible("hands", "backStrap")).toBe(true);
    expect(isSlotCompatible("virgin-blood", "attachment")).toBe(true);
    expect(isSlotCompatible("virgin-blood", "leftHand")).toBe(true);

    const withAxe = assignLoadoutItem(DEFAULT_LOADOUT, "leftHand", "axe");
    expect(withAxe.leftHand).toBe("axe");
    expect(withAxe.rightHand).toBe("axe");

    const withKnife = assignLoadoutItem(withAxe, "rightHand", "knife");
    expect(withKnife.leftHand).toBeUndefined();
    expect(withKnife.rightHand).toBe("knife");

    const withBlood = assignLoadoutItem(DEFAULT_LOADOUT, "rightHand", "virgin-blood");
    expect(withBlood.rightHand).toBe("virgin-blood");
  });

  it("treats the editor hand target as one held item for mouse primary/secondary controls", () => {
    const withKnife = assignHeldLoadoutItem(DEFAULT_LOADOUT, "knife");
    expect(withKnife.leftHand).toBe("knife");
    expect(withKnife.rightHand).toBe("knife");

    const withAxe = assignHeldLoadoutItem(DEFAULT_LOADOUT, "axe");
    expect(withAxe.leftHand).toBe("axe");
    expect(withAxe.rightHand).toBe("axe");
  });

  it("swaps the attachment string with the active hand item without deleting or using either item", () => {
    const defaultSwap = swapAttachmentWithHand(DEFAULT_LOADOUT, "rightHand");
    expect(defaultSwap.swapped).toBe(true);
    expect(defaultSwap.loadout.leftHand).toBe("pistol");
    expect(defaultSwap.loadout.rightHand).toBe("virgin-blood");
    expect(defaultSwap.loadout.attachment).toBe("knife");

    const pairedSwap = swapAttachmentWithHand({
      ...DEFAULT_LOADOUT,
      leftHand: "knife",
      rightHand: "knife",
      attachment: "pistol",
    }, "rightHand");
    expect(pairedSwap.swapped).toBe(true);
    expect(pairedSwap.loadout.leftHand).toBe("pistol");
    expect(pairedSwap.loadout.rightHand).toBe("pistol");
    expect(pairedSwap.loadout.attachment).toBe("knife");

    const blockedSwap = swapAttachmentWithHand({
      ...DEFAULT_LOADOUT,
      leftHand: "pistol",
      rightHand: "knife",
      attachment: "rocket",
    }, "rightHand");
    expect(blockedSwap.swapped).toBe(false);
    expect(blockedSwap.loadout).toMatchObject({
      leftHand: "pistol",
      rightHand: "knife",
      attachment: "rocket",
    });
  });
});
