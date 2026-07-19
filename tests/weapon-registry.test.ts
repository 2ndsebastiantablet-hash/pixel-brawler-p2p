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
  "grappling-hook",
  "chainsaw",
  "spikes",
  "van",
  "spirit-fighter",
  "cross",
  "moon",
  "jupiter",
  "uranus",
  "mars",
  "neptune",
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
      "grappling-hook",
      "chainsaw",
      "spikes",
      "van",
      "spirit-fighter",
      "cross",
      "moon",
      "jupiter",
      "uranus",
      "mars",
      "neptune",
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
    expect(inventory.ammo["grappling-hook"]).toBeUndefined();
    expect(inventory.ammo.chainsaw).toBeUndefined();
    expect(inventory.ammo.spikes).toBeUndefined();
    expect(inventory.ammo.van).toBeUndefined();
    expect(inventory.ammo["spirit-fighter"]).toBeUndefined();
    expect(inventory.ammo.cross).toBeUndefined();
    expect(inventory.ammo.moon).toBeUndefined();
    expect((inventory.ammo as Record<string, unknown>).jupiter).toBeUndefined();
    expect((inventory.ammo as Record<string, unknown>).uranus).toBeUndefined();
    expect((inventory.ammo as Record<string, unknown>).mars).toBeUndefined();
    expect((inventory.ammo as Record<string, unknown>).neptune).toBeUndefined();
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
    expect(weaponRegistry.get("grappling-hook").description).toContain("physical rope hook");
    expect(weaponRegistry.get("grappling-hook").weight.label).toBe("Light");
    expect(weaponRegistry.get("chainsaw").description).not.toContain("Rev for 2 seconds");
    expect(weaponRegistry.get("chainsaw").weight.label).toBe("Heavy");
    expect(weaponRegistry.get("spikes").description).toBe("Strap weapon. Q/E activates 30s spike mode. Click to spawn impaling poison spikes. No spike cooldown during mode. 60s cooldown after.");
    expect(weaponRegistry.get("spikes").weight.label).toBe("Light");
    expect(weaponRegistry.get("van").description).toBe("Strap vehicle. Q/E spawns or absorbs a physics van. Anyone can drive it. Ram players, honk to stun, shoot from inside, and manage gas/health.");
    expect(weaponRegistry.get("van").weight.label).toBe("Heavy");
    expect(weaponRegistry.get("spirit-fighter").description).toBe("High-skill rhythm fighting mode. Stay on beat to punch, counter, grab, throw, and unleash flurries. Three missed beats or whiffs ends the mode and makes you Winded.");
    expect(weaponRegistry.get("spirit-fighter").weight.label).toBe("Light");
    expect(weaponRegistry.get("cross").description).toBe("Holy Cross. Left click creates a mouse-aimed crescent shield that gets bigger the longer its stopwatch charges. Right click starts Judgment Day: a one-minute countdown, then one minute of warned lethal holy beams. Cross rests for 3 minutes after.");
    expect(weaponRegistry.get("cross").weight.label).toBe("Light");
    expect(weaponRegistry.get("moon").name).toBe("The Moon");
    expect(weaponRegistry.get("moon").description).toBe("Space event item. One use. Q/E flips the map upside down for 1 minute. User stays on bottom invisible floor and can switch sides by pressing both mouse buttons.");
    expect(weaponRegistry.get("moon").weight.label).toBe("Light");
    expect(weaponRegistry.get("jupiter" as never).name).toBe("Jupiter");
    expect(weaponRegistry.get("jupiter" as never).description).toBe("Space event item. One use. Q/E starts Jupiter: footstep pressure markers erupt upward, orange gas creates floaty gravity, and a shark tornado releases low-poly homing sharks.");
    expect(weaponRegistry.get("jupiter" as never).weight.label).toBe("Light");
    expect(weaponRegistry.get("uranus" as never).name).toBe("Uranus");
    expect(weaponRegistry.get("uranus" as never).description).toBe("Space event item. One use. Q/E summons a falling planet flash that transforms the arena into a fast-moving Saturn-ring stage with a giant chomping hazard.");
    expect(weaponRegistry.get("uranus" as never).weight.label).toBe("Light");
    expect(weaponRegistry.get("mars" as never).name).toBe("Mars");
    expect(weaponRegistry.get("mars" as never).description).toBe("Space event item. One use. Q/E summons Mars, extracts green laser duplicates from every player, and releases AI clones that hunt their originals until the event ends.");
    expect(weaponRegistry.get("mars" as never).weight.label).toBe("Light");
    expect(weaponRegistry.get("neptune" as never).name).toBe("Neptune");
    expect(weaponRegistry.get("neptune" as never).description).toBe("Space event item. One use. Q/E summons Neptune: giant hands, flood waves, map tilts, instant laser eyes, and killable sea creatures for one minute.");
    expect(weaponRegistry.get("neptune" as never).weight.label).toBe("Light");
  });
});
