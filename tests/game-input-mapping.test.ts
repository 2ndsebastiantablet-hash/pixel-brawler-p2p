import { describe, expect, it } from "vitest";
import { resolveMouseWeaponAction } from "../src/game/Game";
import type { LoadoutState } from "../src/game/loadout/Loadout";

describe("game mouse weapon input mapping", () => {
  it("does nothing for empty hand slots or leg-only equipment", () => {
    expect(resolveMouseWeaponAction("primary", {})).toBeNull();
    expect(resolveMouseWeaponAction("secondary", { legs: "super-legs" })).toBeNull();
  });

  it("routes left mouse to primary and right mouse to alternate/secondary behavior", () => {
    const loadout: LoadoutState = {
      leftHand: "pistol",
      rightHand: "knife",
      frontStrap: "wings",
      backStrap: "death-aura",
      attachment: "virgin-blood",
    };

    expect(resolveMouseWeaponAction("primary", loadout)).toEqual({ weaponId: "pistol", action: "primary" });
    expect(resolveMouseWeaponAction("secondary", loadout)).toEqual({ weaponId: "knife", action: "secondary" });
  });

  it("keeps right mouse routed to an attached Grappling Hook even when another weapon is in the right hand", () => {
    const loadout: LoadoutState = {
      leftHand: "grappling-hook",
      rightHand: "knife",
      frontStrap: "wings",
      backStrap: "death-aura",
      attachment: "chainsaw",
    };

    expect(resolveMouseWeaponAction("secondary", loadout)).toEqual({ weaponId: "knife", action: "secondary" });
    expect(resolveMouseWeaponAction("secondary", loadout, { preferGrapplePull: true })).toEqual({
      weaponId: "grappling-hook",
      action: "secondary",
    });
  });

  it("keeps Grappling Hook pull priority after loadout swaps when the hook is attached", () => {
    const loadout: LoadoutState = {
      leftHand: "pistol",
      rightHand: "machete",
      attachment: "grappling-hook",
      frontStrap: "van",
    };

    expect(resolveMouseWeaponAction("secondary", loadout, { preferGrapplePull: true })).toEqual({
      weaponId: "grappling-hook",
      action: "secondary",
    });
  });

  it("keeps two-handed held items on left primary and right secondary controls", () => {
    const loadout: LoadoutState = {
      leftHand: "axe",
      rightHand: "axe",
      frontStrap: "wings",
      backStrap: "death-aura",
      attachment: "virgin-blood",
    };

    expect(resolveMouseWeaponAction("primary", loadout)).toEqual({ weaponId: "axe", action: "primary" });
    expect(resolveMouseWeaponAction("secondary", loadout)).toEqual({ weaponId: "axe", action: "secondary" });
  });
});
