import type { WeaponDefinition } from "../Weapon";

export const whip: WeaponDefinition = {
  id: "whip",
  name: "Whip",
  kind: "melee",
  description: "Very long control weapon with tip cracks, low trips, air stall, and a pull only after fast repeated hits.",
  primary: { damage: 7, cooldown: 0.34, range: 286, knockback: 170, stun: 0.16, radius: 16 },
  secondary: { damage: 5, cooldown: 0.48, range: 304, knockback: 90, stun: 0.24, radius: 13, status: "tripped" },
  weight: { label: "Light", moveSpeedMultiplier: 1.02, accelerationMultiplier: 1.03, airAccelerationMultiplier: 1.05, jumpMultiplier: 1.01, slideMultiplier: 1.02 },
  throw: { damage: 5, stun: 0.16, speed: 360, knockback: 120 },
  mastery: ["Long curved arc", "Tip sweet spot", "Double-hit pull", "Low trip", "Air stall"],
};
