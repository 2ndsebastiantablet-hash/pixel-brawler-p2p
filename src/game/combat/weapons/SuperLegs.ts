import type { WeaponDefinition } from "../Weapon";

export const superLegs: WeaponDefinition = {
  id: "super-legs",
  name: "Super Legs",
  kind: "utility",
  description: "leg equipment that boosts running, jumping, air control, leg armor, and Space kick combos.",
  primary: { damage: 0, cooldown: 0.55, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0.55, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.12, accelerationMultiplier: 1.18, airAccelerationMultiplier: 1.22, jumpMultiplier: 1.12, slideMultiplier: 1.08 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Run boost", "Higher jumps", "Double-jump control", "Leg armor", "Space kicks", "Impact rings"],
};
