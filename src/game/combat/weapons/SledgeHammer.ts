import type { WeaponDefinition } from "../Weapon";

export const sledgeHammer: WeaponDefinition = {
  id: "sledgehammer",
  name: "Sledgehammer",
  kind: "heavy",
  description: "Slow heavy weapon with chunky hammer arcs, armor startup, shoulder shove, air drop, and charged shockwaves.",
  primary: { damage: 38, cooldown: 0.88, range: 104, knockback: 690, stun: 0.44, radius: 38, chargeScale: 2.05 },
  secondary: { damage: 18, cooldown: 0.5, range: 68, knockback: 430, stun: 0.24, radius: 26, status: "daze" },
  weight: { label: "Very Heavy", moveSpeedMultiplier: 0.83, accelerationMultiplier: 0.72, airAccelerationMultiplier: 0.72, jumpMultiplier: 0.9, slideMultiplier: 0.86 },
  throw: { damage: 18, stun: 0.28, speed: 330, knockback: 360 },
  mastery: ["Charged overhead slam", "Ground shockwave", "Shoulder shove", "Air hammer drop", "Armor startup"],
  flags: { slowsMovement: true },
};
