import type { WeaponDefinition } from "../Weapon";

export const hands: WeaponDefinition = {
  id: "hands",
  name: "Hands",
  kind: "utility",
  description: "Summon 5 crawling hands. They can attach to faces and scramble controls, but you lose your own hands for 40 seconds.",
  primary: { damage: 0, cooldown: 1.1, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 1.1, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.02, accelerationMultiplier: 1.06, airAccelerationMultiplier: 1.04, jumpMultiplier: 1, slideMultiplier: 1.02 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Summon 5", "Face attach", "Scramble controls", "No hands drawback"],
};
