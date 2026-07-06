import type { WeaponDefinition } from "../Weapon";

export const knife: WeaponDefinition = {
  id: "knife",
  name: "Knife",
  kind: "melee",
  description: "Fast close-range combo weapon with bleed, dash stab, parry, and throw.",
  primary: { damage: 6, cooldown: 0.16, range: 44, knockback: 85, stun: 0.07, radius: 12, status: "bleed" },
  secondary: { damage: 9, cooldown: 0.5, speed: 650, range: 420, knockback: 150, stun: 0.14, radius: 6, status: "bleed" },
  weight: { label: "Light", moveSpeedMultiplier: 1.08, accelerationMultiplier: 1.1, airAccelerationMultiplier: 1.08, jumpMultiplier: 1.02, slideMultiplier: 1.06 },
  throw: { damage: 9, stun: 0.14, speed: 650, knockback: 150 },
  mastery: ["Three-hit combo", "Backstab bonus", "Air slash stall", "Dash stab", "Parry window", "Bleed status"],
  flags: { canParry: true },
};
