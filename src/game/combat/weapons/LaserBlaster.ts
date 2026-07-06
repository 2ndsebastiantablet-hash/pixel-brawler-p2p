import type { WeaponDefinition } from "../Weapon";

export const laserBlaster: WeaponDefinition = {
  id: "laser-blaster",
  name: "Laser Blaster",
  kind: "beam",
  description: "Charge weapon with heat, hover, threshold releases, and overcharge risk.",
  primary: { damage: 9, cooldown: 0.36, speed: 900, range: 880, knockback: 160, stun: 0.08, radius: 6, pierce: 1, chargeScale: 3 },
  secondary: { damage: 4, cooldown: 0.9, range: 70, knockback: 220, stun: 0.08, radius: 22 },
  charge: { maxCharge: 40, thresholds: [0.8, 2.5, 6, 12], overchargeDamage: 18 },
  throw: { damage: 7, stun: 0.14, speed: 390, knockback: 120 },
  mastery: ["Four charge levels", "Overcharge explosion", "Heat system", "Vent cancel", "Air hover", "Perfect release"],
};
