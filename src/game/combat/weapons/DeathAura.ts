import type { WeaponDefinition } from "../Weapon";

export const deathAura: WeaponDefinition = {
  id: "death-aura",
  name: "Death Aura",
  kind: "utility",
  description: "Creates a dark aura that freezes and damages nearby targets. The more hurt you are, the larger and darker it becomes.",
  primary: { damage: 0, cooldown: 0.25, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0.25, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Balanced", moveSpeedMultiplier: 0.96, accelerationMultiplier: 0.96, airAccelerationMultiplier: 0.96, jumpMultiplier: 0.98, slideMultiplier: 0.96 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Dark aura", "Freeze field", "Missing HP scaling", "Damage over time"],
};
