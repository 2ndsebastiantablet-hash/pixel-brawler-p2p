import type { WeaponDefinition } from "../Weapon";

export const holyBazooka: WeaponDefinition = {
  id: "holy-bazooka",
  name: "Holy Bazooka",
  kind: "projectile",
  description: "Heavy two-handed launcher that fires one ammo-gated homing missile into a huge holy explosion with health steal.",
  primary: { damage: 58, cooldown: 7, speed: 620, range: 3600, knockback: 1800, stun: 0.78, radius: 18 },
  secondary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Very Heavy", moveSpeedMultiplier: 0.62, accelerationMultiplier: 0.52, airAccelerationMultiplier: 0.54, jumpMultiplier: 0.78, slideMultiplier: 0.62 },
  ammo: { magazineSize: 3, reserve: 0, reloadTime: 0, consumePerShot: 1 },
  throw: { damage: 12, stun: 0.28, speed: 520, knockback: 300 },
  mastery: ["Right-click ammo call", "7s fire cooldown", "Homing missile", "Huge holy splash", "Health steal", "Massive recoil"],
};
