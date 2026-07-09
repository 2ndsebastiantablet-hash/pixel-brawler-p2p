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
  "knife",
  "machete",
  "axe",
  "wings",
  "virgin-blood",
  "death-aura",
  "rocket",
  "hands",
  "super-legs",
  "holy-bazooka",
] as const;

describe("weapon registry", () => {
  it("enables the polished weapons and items with movement weight metadata", () => {
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
      "knife",
      "machete",
      "axe",
      "wings",
      "virgin-blood",
      "death-aura",
      "rocket",
      "hands",
      "super-legs",
      "holy-bazooka",
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
    expect(inventory.ammo["slingshot"]?.magazine).toBeGreaterThanOrEqual(30);
    expect(inventory.ammo.revolver?.magazine).toBe(6);
    expect(inventory.ammo.minigun?.magazine).toBe(120);
    expect(inventory.ammo.sniper?.magazine).toBe(1);
    expect(inventory.charge["laser-blaster"]?.maxCharge).toBe(80);
    expect(inventory.charge.minigun?.maxCharge).toBe(1);
    expect(inventory.charge.sniper?.maxCharge).toBe(1);
    expect(inventory.ammo.knife).toBeUndefined();
    expect(inventory.ammo.machete).toBeUndefined();
    expect(inventory.ammo.axe).toBeUndefined();
    expect(inventory.ammo.wings).toBeUndefined();
    expect(inventory.ammo["virgin-blood"]).toBeUndefined();
    expect(inventory.ammo["death-aura"]).toBeUndefined();
    expect(inventory.ammo.rocket).toBeUndefined();
    expect(inventory.ammo.hands).toBeUndefined();
    expect(inventory.ammo["super-legs"]).toBeUndefined();
    expect(inventory.ammo["holy-bazooka"]?.magazine).toBe(0);
    expect(inventory.ammo["holy-bazooka"]?.reserve).toBe(0);
    expect(weaponRegistry.get("machete").weight.moveSpeedMultiplier).toBeLessThan(weaponRegistry.get("knife").weight.moveSpeedMultiplier);
    expect(weaponRegistry.get("axe").weight.moveSpeedMultiplier).toBeLessThan(weaponRegistry.get("knife").weight.moveSpeedMultiplier);
    expect(weaponRegistry.get("wings").weight.moveSpeedMultiplier).toBeGreaterThan(weaponRegistry.get("machete").weight.moveSpeedMultiplier);
    expect(weaponRegistry.get("super-legs").weight.moveSpeedMultiplier).toBeGreaterThanOrEqual(1.4);
    expect(weaponRegistry.get("super-legs").weight.accelerationMultiplier).toBeGreaterThanOrEqual(1.5);
    expect(weaponRegistry.get("super-legs").weight.airAccelerationMultiplier).toBeGreaterThanOrEqual(1.35);
    expect(weaponRegistry.get("super-legs").weight.jumpMultiplier).toBeGreaterThanOrEqual(1.6);
    expect(weaponRegistry.get("super-legs").weight.slideMultiplier).toBeGreaterThanOrEqual(1.45);
    expect(weaponRegistry.get("holy-bazooka").weight.moveSpeedMultiplier).toBeLessThanOrEqual(0.65);
    expect(weaponRegistry.get("holy-bazooka").description).toContain("homing missile");
    expect(weaponRegistry.get("virgin-blood").description).toContain("Left/right click consumes");
    expect(weaponRegistry.get("death-aura").description).toContain("freezes and damages nearby targets");
    expect(weaponRegistry.get("rocket").description).toContain("Ride it by standing on it");
    expect(weaponRegistry.get("hands").description).toContain("lose your own hands for 40 seconds");
    expect(weaponRegistry.get("super-legs").description).toContain("leg equipment");
  });
});
