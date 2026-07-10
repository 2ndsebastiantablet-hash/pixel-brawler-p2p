import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADOUT,
  STARTER_LOADOUT,
  assignLoadoutItem,
  assignHeldLoadoutItem,
  clearLoadoutSlot,
  isSlotCompatible,
  loadoutHasWeapon,
  normalizeLoadout,
  swapAttachmentWithHand,
} from "../src/game/loadout/Loadout";

describe("loadout equipment slots", () => {
  it("starts fresh players with empty equipment slots and keeps the starter preset explicit", () => {
    expect(DEFAULT_LOADOUT).toEqual({});
    expect(normalizeLoadout({})).toEqual({});
    expect(STARTER_LOADOUT).toEqual({
      leftHand: "pistol",
      rightHand: "knife",
      frontStrap: "wings",
      backStrap: "death-aura",
      attachment: "virgin-blood",
    });
  });

  it("normalizes incompatible saved slots by clearing them instead of auto-filling defaults", () => {
    expect(normalizeLoadout({
      leftHand: "rocket",
      rightHand: "knife",
      frontStrap: "pistol",
      backStrap: "death-aura",
      attachment: "axe",
      legs: "rocket",
    })).toEqual({
      leftHand: "rocket",
      rightHand: "rocket",
      backStrap: "death-aura",
      attachment: "axe",
    });
  });

  it("enforces slot compatibility, two-handed hand occupancy, and the leg slot", () => {
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
    expect(isSlotCompatible("super-legs", "legs")).toBe(true);
    expect(isSlotCompatible("super-legs", "leftHand")).toBe(false);
    expect(isSlotCompatible("super-legs", "frontStrap")).toBe(false);
    expect(isSlotCompatible("super-legs", "attachment")).toBe(false);
    expect(isSlotCompatible("holy-bazooka", "rightHand")).toBe(true);
    expect(isSlotCompatible("holy-bazooka", "leftHand")).toBe(true);
    expect(isSlotCompatible("holy-bazooka", "attachment")).toBe(false);
    expect(isSlotCompatible("holy-bazooka", "frontStrap")).toBe(false);
    expect(isSlotCompatible("holy-bazooka", "legs")).toBe(false);
    expect(isSlotCompatible("rocket", "legs")).toBe(false);
    expect(isSlotCompatible("grappling-hook", "rightHand")).toBe(true);
    expect(isSlotCompatible("grappling-hook", "leftHand")).toBe(true);
    expect(isSlotCompatible("grappling-hook", "attachment")).toBe(true);
    expect(isSlotCompatible("grappling-hook", "frontStrap")).toBe(false);
    expect(isSlotCompatible("grappling-hook", "backStrap")).toBe(false);
    expect(isSlotCompatible("grappling-hook", "legs")).toBe(false);

    const withAxe = assignLoadoutItem(DEFAULT_LOADOUT, "leftHand", "axe");
    expect(withAxe.leftHand).toBe("axe");
    expect(withAxe.rightHand).toBe("axe");

    const withKnife = assignLoadoutItem(withAxe, "rightHand", "knife");
    expect(withKnife.leftHand).toBeUndefined();
    expect(withKnife.rightHand).toBe("knife");

    const withBlood = assignLoadoutItem(DEFAULT_LOADOUT, "rightHand", "virgin-blood");
    expect(withBlood.rightHand).toBe("virgin-blood");

    const withLegs = assignLoadoutItem(DEFAULT_LOADOUT, "legs", "super-legs");
    expect(withLegs.legs).toBe("super-legs");
    expect(loadoutHasWeapon(withLegs, "super-legs")).toBe(true);
  });

  it("treats the editor hand target as one held item for mouse primary/secondary controls", () => {
    const withKnife = assignHeldLoadoutItem(DEFAULT_LOADOUT, "knife");
    expect(withKnife.leftHand).toBe("knife");
    expect(withKnife.rightHand).toBe("knife");

    const withAxe = assignHeldLoadoutItem(DEFAULT_LOADOUT, "axe");
    expect(withAxe.leftHand).toBe("axe");
    expect(withAxe.rightHand).toBe("axe");
  });

  it("clears individual equipment slots without restoring old defaults", () => {
    const withKnife = assignHeldLoadoutItem(DEFAULT_LOADOUT, "knife");
    expect(clearLoadoutSlot(withKnife, "rightHand")).toEqual({});

    const withStrapAndLegs = normalizeLoadout({
      frontStrap: "wings",
      backStrap: "death-aura",
      legs: "super-legs",
    });
    expect(clearLoadoutSlot(withStrapAndLegs, "frontStrap")).toEqual({
      backStrap: "death-aura",
      legs: "super-legs",
    });
    expect(clearLoadoutSlot(withStrapAndLegs, "legs")).toEqual({
      frontStrap: "wings",
      backStrap: "death-aura",
    });
  });

  it("swaps the attachment string with the active hand item without deleting or using either item", () => {
    const emptySwap = swapAttachmentWithHand(DEFAULT_LOADOUT, "rightHand");
    expect(emptySwap).toMatchObject({ swapped: false, reason: "Nothing to swap", loadout: {} });

    const attachmentToEmptyHand = swapAttachmentWithHand({ attachment: "pistol" }, "rightHand");
    expect(attachmentToEmptyHand).toMatchObject({
      swapped: true,
      loadout: { rightHand: "pistol" },
    });
    expect(attachmentToEmptyHand.loadout.attachment).toBeUndefined();

    const handToEmptyAttachment = swapAttachmentWithHand({ rightHand: "knife" }, "rightHand");
    expect(handToEmptyAttachment).toMatchObject({
      swapped: true,
      loadout: { attachment: "knife" },
    });
    expect(handToEmptyAttachment.loadout.rightHand).toBeUndefined();

    const defaultSwap = swapAttachmentWithHand(STARTER_LOADOUT, "rightHand");
    expect(defaultSwap.swapped).toBe(true);
    expect(defaultSwap.loadout.leftHand).toBe("pistol");
    expect(defaultSwap.loadout.rightHand).toBe("virgin-blood");
    expect(defaultSwap.loadout.attachment).toBe("knife");

    const repeatedStart = { rightHand: "knife" as const, attachment: "pistol" as const };
    const repeatedFirst = swapAttachmentWithHand(repeatedStart, "rightHand");
    expect(repeatedFirst.loadout.rightHand).toBe("pistol");
    expect(repeatedFirst.loadout.attachment).toBe("knife");
    const repeatedSecond = swapAttachmentWithHand(repeatedFirst.loadout, "rightHand");
    expect(repeatedSecond.loadout.rightHand).toBe("knife");
    expect(repeatedSecond.loadout.attachment).toBe("pistol");

    const pairedSwap = swapAttachmentWithHand({
      ...STARTER_LOADOUT,
      leftHand: "knife",
      rightHand: "knife",
      attachment: "pistol",
    }, "rightHand");
    expect(pairedSwap.swapped).toBe(true);
    expect(pairedSwap.loadout.leftHand).toBe("pistol");
    expect(pairedSwap.loadout.rightHand).toBe("pistol");
    expect(pairedSwap.loadout.attachment).toBe("knife");

    const blockedSwap = swapAttachmentWithHand({
      ...STARTER_LOADOUT,
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

    const incompatibleHandToAttachment = swapAttachmentWithHand({
      leftHand: "holy-bazooka",
      rightHand: "holy-bazooka",
    }, "rightHand");
    expect(incompatibleHandToAttachment.swapped).toBe(false);
    expect(incompatibleHandToAttachment.reason).toContain("Holy Bazooka cannot attach");
  });
});
