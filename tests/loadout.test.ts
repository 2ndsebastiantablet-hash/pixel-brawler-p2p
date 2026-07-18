import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADOUT,
  STARTER_LOADOUT,
  LOADOUT_ITEMS,
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
    expect(normalizeLoadout({
      frontStrap: "spikes",
      rightHand: "spikes",
      attachment: "spikes",
      legs: "spikes",
    })).toEqual({
      frontStrap: "spikes",
    });
    expect(normalizeLoadout({
      backStrap: "van",
      rightHand: "van",
      attachment: "van",
      legs: "van",
    })).toEqual({
      backStrap: "van",
    });
    expect(normalizeLoadout({
      frontStrap: "spirit-fighter" as never,
      rightHand: "spirit-fighter" as never,
      attachment: "spirit-fighter" as never,
      legs: "spirit-fighter" as never,
    })).toEqual({
      frontStrap: "spirit-fighter",
    });
    expect(normalizeLoadout({
      backStrap: "moon" as never,
      rightHand: "moon" as never,
      attachment: "moon" as never,
      legs: "moon" as never,
    })).toEqual({
      backStrap: "moon",
    });
    expect(normalizeLoadout({
      frontStrap: "jupiter" as never,
      rightHand: "jupiter" as never,
      attachment: "jupiter" as never,
      legs: "jupiter" as never,
    })).toEqual({
      frontStrap: "jupiter",
    });
    expect(normalizeLoadout({
      backStrap: "uranus" as never,
      rightHand: "uranus" as never,
      attachment: "uranus" as never,
      legs: "uranus" as never,
    })).toEqual({
      backStrap: "uranus",
    });
    expect(normalizeLoadout({
      frontStrap: "mars" as never,
      rightHand: "mars" as never,
      attachment: "mars" as never,
      legs: "mars" as never,
    })).toEqual({
      frontStrap: "mars",
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
    expect(isSlotCompatible("holy-bazooka", "attachment")).toBe(true);
    expect(isSlotCompatible("holy-bazooka", "frontStrap")).toBe(false);
    expect(isSlotCompatible("holy-bazooka", "legs")).toBe(false);
    expect(isSlotCompatible("rocket", "legs")).toBe(false);
    expect(isSlotCompatible("grappling-hook", "rightHand")).toBe(true);
    expect(isSlotCompatible("grappling-hook", "leftHand")).toBe(true);
    expect(isSlotCompatible("grappling-hook", "attachment")).toBe(true);
    expect(isSlotCompatible("grappling-hook", "frontStrap")).toBe(false);
    expect(isSlotCompatible("grappling-hook", "backStrap")).toBe(false);
    expect(isSlotCompatible("grappling-hook", "legs")).toBe(false);
    expect(isSlotCompatible("chainsaw", "rightHand")).toBe(true);
    expect(isSlotCompatible("chainsaw", "leftHand")).toBe(true);
    expect(isSlotCompatible("chainsaw", "attachment")).toBe(true);
    expect(isSlotCompatible("chainsaw", "frontStrap")).toBe(false);
    expect(isSlotCompatible("chainsaw", "backStrap")).toBe(false);
    expect(isSlotCompatible("chainsaw", "legs")).toBe(false);
    expect(isSlotCompatible("spikes", "frontStrap")).toBe(true);
    expect(isSlotCompatible("spikes", "backStrap")).toBe(true);
    expect(isSlotCompatible("spikes", "leftHand")).toBe(false);
    expect(isSlotCompatible("spikes", "rightHand")).toBe(false);
    expect(isSlotCompatible("spikes", "attachment")).toBe(false);
    expect(isSlotCompatible("spikes", "legs")).toBe(false);
    expect(isSlotCompatible("van", "frontStrap")).toBe(true);
    expect(isSlotCompatible("van", "backStrap")).toBe(true);
    expect(isSlotCompatible("van", "leftHand")).toBe(false);
    expect(isSlotCompatible("van", "rightHand")).toBe(false);
    expect(isSlotCompatible("van", "attachment")).toBe(false);
    expect(isSlotCompatible("van", "legs")).toBe(false);
    expect(isSlotCompatible("spirit-fighter" as never, "frontStrap")).toBe(true);
    expect(isSlotCompatible("spirit-fighter" as never, "backStrap")).toBe(true);
    expect(isSlotCompatible("spirit-fighter" as never, "leftHand")).toBe(false);
    expect(isSlotCompatible("spirit-fighter" as never, "rightHand")).toBe(false);
    expect(isSlotCompatible("spirit-fighter" as never, "attachment")).toBe(false);
    expect(isSlotCompatible("spirit-fighter" as never, "legs")).toBe(false);
    expect(isSlotCompatible("cross" as never, "leftHand")).toBe(true);
    expect(isSlotCompatible("cross" as never, "rightHand")).toBe(true);
    expect(isSlotCompatible("cross" as never, "attachment")).toBe(true);
    expect(isSlotCompatible("cross" as never, "frontStrap")).toBe(false);
    expect(isSlotCompatible("cross" as never, "backStrap")).toBe(false);
    expect(isSlotCompatible("cross" as never, "legs")).toBe(false);
    expect(isSlotCompatible("moon" as never, "frontStrap")).toBe(true);
    expect(isSlotCompatible("moon" as never, "backStrap")).toBe(true);
    expect(isSlotCompatible("moon" as never, "leftHand")).toBe(false);
    expect(isSlotCompatible("moon" as never, "rightHand")).toBe(false);
    expect(isSlotCompatible("moon" as never, "attachment")).toBe(false);
    expect(isSlotCompatible("moon" as never, "legs")).toBe(false);
    expect(isSlotCompatible("jupiter" as never, "frontStrap")).toBe(true);
    expect(isSlotCompatible("jupiter" as never, "backStrap")).toBe(true);
    expect(isSlotCompatible("jupiter" as never, "leftHand")).toBe(false);
    expect(isSlotCompatible("jupiter" as never, "rightHand")).toBe(false);
    expect(isSlotCompatible("jupiter" as never, "attachment")).toBe(false);
    expect(isSlotCompatible("jupiter" as never, "legs")).toBe(false);
    expect(isSlotCompatible("uranus" as never, "frontStrap")).toBe(true);
    expect(isSlotCompatible("uranus" as never, "backStrap")).toBe(true);
    expect(isSlotCompatible("uranus" as never, "leftHand")).toBe(false);
    expect(isSlotCompatible("uranus" as never, "rightHand")).toBe(false);
    expect(isSlotCompatible("uranus" as never, "attachment")).toBe(false);
    expect(isSlotCompatible("uranus" as never, "legs")).toBe(false);
    expect(isSlotCompatible("mars" as never, "frontStrap")).toBe(true);
    expect(isSlotCompatible("mars" as never, "backStrap")).toBe(true);
    expect(isSlotCompatible("mars" as never, "leftHand")).toBe(false);
    expect(isSlotCompatible("mars" as never, "rightHand")).toBe(false);
    expect(isSlotCompatible("mars" as never, "attachment")).toBe(false);
    expect(isSlotCompatible("mars" as never, "legs")).toBe(false);

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

    const withSpikes = assignLoadoutItem(DEFAULT_LOADOUT, "frontStrap", "spikes");
    expect(withSpikes.frontStrap).toBe("spikes");
    expect(loadoutHasWeapon(withSpikes, "spikes")).toBe(true);

    const withVan = assignLoadoutItem(DEFAULT_LOADOUT, "backStrap", "van");
    expect(withVan.backStrap).toBe("van");
    expect(loadoutHasWeapon(withVan, "van")).toBe(true);

    const withSpirit = assignLoadoutItem(DEFAULT_LOADOUT, "frontStrap", "spirit-fighter" as never);
    expect(withSpirit.frontStrap).toBe("spirit-fighter");
    expect(loadoutHasWeapon(withSpirit, "spirit-fighter" as never)).toBe(true);

    const withCross = assignLoadoutItem(DEFAULT_LOADOUT, "rightHand", "cross" as never);
    expect(withCross.rightHand).toBe("cross");
    const crossAttachment = assignLoadoutItem(withCross, "attachment", "cross" as never);
    expect(crossAttachment.attachment).toBe("cross");

    const withMoon = assignLoadoutItem(DEFAULT_LOADOUT, "backStrap", "moon" as never);
    expect(withMoon.backStrap).toBe("moon");
    expect(loadoutHasWeapon(withMoon, "moon" as never)).toBe(true);
    expect(LOADOUT_ITEMS.find((item) => item.id === ("moon" as never))).toMatchObject({
      category: "space",
      handedness: "strap",
      compatibleSlots: ["frontStrap", "backStrap"],
    });
    const withJupiter = assignLoadoutItem(DEFAULT_LOADOUT, "frontStrap", "jupiter" as never);
    expect(withJupiter.frontStrap).toBe("jupiter");
    expect(loadoutHasWeapon(withJupiter, "jupiter" as never)).toBe(true);
    expect(LOADOUT_ITEMS.find((item) => item.id === ("jupiter" as never))).toMatchObject({
      category: "space",
      handedness: "strap",
      compatibleSlots: ["frontStrap", "backStrap"],
    });
    const withUranus = assignLoadoutItem(DEFAULT_LOADOUT, "backStrap", "uranus" as never);
    expect(withUranus.backStrap).toBe("uranus");
    expect(loadoutHasWeapon(withUranus, "uranus" as never)).toBe(true);
    expect(LOADOUT_ITEMS.find((item) => item.id === ("uranus" as never))).toMatchObject({
      category: "space",
      handedness: "strap",
      compatibleSlots: ["frontStrap", "backStrap"],
    });
    const withMars = assignLoadoutItem(DEFAULT_LOADOUT, "frontStrap", "mars" as never);
    expect(withMars.frontStrap).toBe("mars");
    expect(loadoutHasWeapon(withMars, "mars" as never)).toBe(true);
    expect(LOADOUT_ITEMS.find((item) => item.id === ("mars" as never))).toMatchObject({
      category: "space",
      handedness: "strap",
      compatibleSlots: ["frontStrap", "backStrap"],
    });
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

    const holyToEmptyAttachment = swapAttachmentWithHand({
      leftHand: "holy-bazooka",
      rightHand: "holy-bazooka",
    }, "rightHand");
    expect(holyToEmptyAttachment.swapped).toBe(true);
    expect(holyToEmptyAttachment.loadout.attachment).toBe("holy-bazooka");
    expect(holyToEmptyAttachment.loadout.leftHand).toBeUndefined();
    expect(holyToEmptyAttachment.loadout.rightHand).toBeUndefined();

    const chainsawSwap = swapAttachmentWithHand({
      rightHand: "chainsaw",
      attachment: "holy-bazooka",
    }, "rightHand");
    expect(chainsawSwap.swapped).toBe(true);
    expect(chainsawSwap.loadout.leftHand).toBe("holy-bazooka");
    expect(chainsawSwap.loadout.rightHand).toBe("holy-bazooka");
    expect(chainsawSwap.loadout.attachment).toBe("chainsaw");
  });
});
