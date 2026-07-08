import type { WeaponDefinition } from "../Weapon";

export const axe: WeaponDefinition = {
  id: "axe",
  name: "Axe",
  kind: "melee",
  description: "Heavy blade hybrid with left-click rush swings and right-click throw/recall.",
  primary: { damage: 22, cooldown: 0.52, range: 72, knockback: 340, stun: 0.22, radius: 22, status: "bleed" },
  secondary: { damage: 22, cooldown: 0.68, speed: 900, range: 780, knockback: 360, stun: 0.22, radius: 11, gravity: 340, bounces: 1, status: "bleed" },
  weight: { label: "Heavy", moveSpeedMultiplier: 0.9, accelerationMultiplier: 0.84, airAccelerationMultiplier: 0.86, jumpMultiplier: 0.94, slideMultiplier: 0.88 },
  throw: { damage: 22, stun: 0.22, speed: 900, knockback: 360 },
  mastery: ["Rush swing", "Spinning throw", "Recall pierce", "Axe-head sweet spot", "Slide cleave", "Heavy knockback"],
};
