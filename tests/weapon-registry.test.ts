import { describe, expect, it } from "vitest";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "../src/game/combat/WeaponRegistry";

const enabledWeapons = [
  "pistol",
  "whip",
  "teleport-ball",
  "lightning-rod",
  "sledgehammer",
  "slingshot",
  "laser-blaster",
  "revolver",
  "minigun",
  "sniper",
] as const;

describe("weapon registry", () => {
  it("enables the first ten polished weapons with movement weight metadata", () => {
    expect(WEAPON_IDS).toEqual([
      "pistol",
      "whip",
      "teleport-ball",
      "lightning-rod",
      "sledgehammer",
      "slingshot",
      "laser-blaster",
      "revolver",
      "minigun",
      "sniper",
    ]);

    for (const id of WEAPON_IDS) {
      const weapon = weaponRegistry.get(id);
      expect(weapon.id).toBe(id);
      expect(weapon.name.length).toBeGreaterThan(2);
      expect(weapon.mastery.length).toBeGreaterThanOrEqual(2);
      expect(weapon.weight.label.length).toBeGreaterThan(2);
      expect(weapon.weight.moveSpeedMultiplier).toBeGreaterThan(0.6);
      expect(weapon.weight.accelerationMultiplier).toBeGreaterThan(0.5);
      expect(weapon.weight.jumpMultiplier).toBeGreaterThan(0.75);
      expect(weapon.throw).toMatchObject({
        damage: expect.any(Number),
        stun: expect.any(Number),
      });
    }
  });

  it("creates a test inventory with only the enabled weapons and pistol equipped first", () => {
    const inventory = createDefaultInventory();

    expect(inventory.equippedWeapon).toBe("pistol");
    expect(inventory.weaponInventory).toEqual(enabledWeapons);
    expect(inventory.ammo.pistol?.magazine).toBe(20);
    expect(inventory.ammo["slingshot"]?.magazine).toBe(10);
    expect(inventory.ammo.revolver?.magazine).toBe(6);
    expect(inventory.ammo.minigun?.magazine).toBe(120);
    expect(inventory.ammo.sniper?.magazine).toBe(1);
    expect(inventory.charge["laser-blaster"]?.maxCharge).toBe(40);
    expect(inventory.charge.minigun?.maxCharge).toBe(1);
    expect(inventory.charge.sniper?.maxCharge).toBe(1);
    expect(inventory.ammo.knife).toBeUndefined();
    expect(inventory.ammo.machete).toBeUndefined();
  });
});
