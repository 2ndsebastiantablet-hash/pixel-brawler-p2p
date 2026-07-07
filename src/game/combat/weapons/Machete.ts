import type { WeaponDefinition } from "../Weapon";

export const machete: WeaponDefinition = {
  id: "machete",
  name: "Machete",
  kind: "melee",
  description: "Heavy close-range blade with wide clearing slash and overhead chop.",
  primary: { damage: 14, cooldown: 0.34, range: 76, knockback: 210, stun: 0.14, radius: 22, status: "bleed" },
  secondary: { damage: 24, cooldown: 0.74, range: 86, knockback: 330, stun: 0.24, radius: 26, status: "bleed" },
  weight: { label: "Heavy", moveSpeedMultiplier: 0.94, accelerationMultiplier: 0.9, airAccelerationMultiplier: 0.91, jumpMultiplier: 0.96, slideMultiplier: 0.93 },
  throw: { damage: 12, stun: 0.16, speed: 460, knockback: 190 },
  mastery: ["Heavy chop", "Wide clearing slash", "Tip cleave", "Slide cleave", "Air fall stall", "Bleed pressure"],
};
