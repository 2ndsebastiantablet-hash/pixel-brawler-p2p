import { describe, expect, it } from "vitest";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "../src/game/combat/WeaponRegistry";

describe("weapon registry", () => {
  it("registers the complete prototype weapon set with mastery hooks", () => {
    expect(WEAPON_IDS).toEqual([
      "pistol",
      "whip",
      "slingshot",
      "laser-blaster",
      "revolver",
      "minigun",
      "sniper",
      "knife",
      "machete",
      "teleport-ball",
      "lightning-rod",
      "sledgehammer",
    ]);

    for (const id of WEAPON_IDS) {
      const weapon = weaponRegistry.get(id);
      expect(weapon.id).toBe(id);
      expect(weapon.name.length).toBeGreaterThan(2);
      expect(weapon.mastery.length).toBeGreaterThanOrEqual(2);
      expect(weapon.throw).toMatchObject({
        damage: expect.any(Number),
        stun: expect.any(Number),
      });
    }
  });

  it("creates a test inventory with all 12 weapons and pistol equipped first", () => {
    const inventory = createDefaultInventory();

    expect(inventory.equippedWeapon).toBe("pistol");
    expect(inventory.weaponInventory).toEqual(WEAPON_IDS);
    expect(inventory.ammo.pistol?.magazine).toBe(20);
    expect(inventory.ammo["slingshot"]?.magazine).toBe(10);
    expect(inventory.charge["laser-blaster"]?.maxCharge).toBe(40);
  });
});
