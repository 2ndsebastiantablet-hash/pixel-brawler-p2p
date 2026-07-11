import type { WeaponDefinition } from "../Weapon";

export const cross: WeaponDefinition = {
  id: "cross",
  name: "Cross",
  kind: "utility",
  description: "Holy Cross. Left click creates a mouse-aimed crescent shield that gets bigger the longer its stopwatch charges. Right click starts Judgment Day: a one-minute storm of lethal holy beams. Cross rests for 3 minutes after.",
  primary: { damage: 1, cooldown: 0.42, range: 126, knockback: 560, stun: 0.12, radius: 58 },
  secondary: { damage: 999, cooldown: 180, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.03, accelerationMultiplier: 1.08, airAccelerationMultiplier: 1.08, jumpMultiplier: 1.02, slideMultiplier: 1.02 },
  throw: { damage: 4, stun: 0.1, speed: 520, knockback: 180 },
  mastery: ["Stopwatch shield", "Crescent bounce", "Projectile deflection", "Judgment Day", "Three-minute rest"],
  flags: { canParry: true },
};
