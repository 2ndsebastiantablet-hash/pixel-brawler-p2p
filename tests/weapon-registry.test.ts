import { describe, expect, it } from "vitest";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "../src/game/combat/WeaponRegistry";

describe("weapon registry", () => {
  it("enables only the first polished weapon slice", () => {
    expect(WEAPON_IDS).toEqual([
      "pistol",
      "whip",
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

  it("creates a test inventory with only the enabled weapons and pistol equipped first", () => {
    const inventory = createDefaultInventory();

    expect(inventory.equippedWeapon).toBe("pistol");
    expect(inventory.weaponInventory).toEqual(WEAPON_IDS);
    expect(inventory.ammo.pistol?.magazine).toBe(20);
    expect(inventory.ammo["slingshot"]).toBeUndefined();
    expect(inventory.charge["laser-blaster"]).toBeUndefined();
  });
});
