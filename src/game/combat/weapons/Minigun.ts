import type { WeaponDefinition } from "../Weapon";

export const minigun: WeaponDefinition = {
  id: "minigun",
  name: "Minigun",
  kind: "projectile",
  description: "Heavy sustained-pressure weapon with spin-up, suppression, recoil, and overheat.",
  primary: { damage: 3, cooldown: 0.055, speed: 840, range: 650, knockback: 60, stun: 0.025, radius: 3, spread: 0.12, status: "suppressed" },
  secondary: { damage: 0, cooldown: 0.1, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Very Heavy", moveSpeedMultiplier: 0.78, accelerationMultiplier: 0.64, airAccelerationMultiplier: 0.62, jumpMultiplier: 0.86, slideMultiplier: 0.8 },
  ammo: { magazineSize: 120, reserve: 240, reloadTime: 2.1 },
  charge: { maxCharge: 1, thresholds: [0.35, 0.7, 1] },
  throw: { damage: 12, stun: 0.22, speed: 250, knockback: 250 },
  mastery: ["Spin-up time", "Overheat meter", "Backward recoil", "Air firing fall slow", "Suppression", "Pre-spin"],
  flags: { slowsMovement: true },
};
