import type { WeaponDefinition } from "../Weapon";

export const laserBlaster: WeaponDefinition = {
  id: "laser-blaster",
  name: "Laser Blaster",
  kind: "beam",
  description: "Charge tool with heat, hover, stronger scaling releases, and overcharge risk.",
  primary: { damage: 10, cooldown: 0.36, speed: 900, range: 960, knockback: 190, stun: 0.08, radius: 6, pierce: 1, chargeScale: 3.4 },
  secondary: { damage: 4, cooldown: 0.9, range: 70, knockback: 220, stun: 0.08, radius: 22 },
  weight: { label: "Balanced", moveSpeedMultiplier: 0.98, accelerationMultiplier: 0.97, airAccelerationMultiplier: 0.98, jumpMultiplier: 0.99, slideMultiplier: 0.98 },
  charge: { maxCharge: 80, thresholds: [0.8, 2.5, 6, 12, 40, 80], overchargeDamage: 24 },
  throw: { damage: 7, stun: 0.14, speed: 390, knockback: 120 },
  mastery: ["Six charge levels", "Overcharge explosion", "Heat system", "Vent cancel", "Air hover", "Perfect release"],
};
