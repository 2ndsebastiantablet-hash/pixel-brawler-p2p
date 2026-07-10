import type { WeaponDefinition } from "../Weapon";

export const chainsaw: WeaponDefinition = {
  id: "chainsaw",
  name: "Chainsaw",
  kind: "utility",
  description: "Runs immediately at close range for low damage over time, scales slowly from total chainsaw damage dealt, overheats fast, and chainsaw kills spawn zombies whose strength depends on damage dealt to the victim.",
  primary: { damage: 0, cooldown: 0.16, range: 62, knockback: 120, stun: 0.05, radius: 20 },
  secondary: { damage: 0, cooldown: 0.25, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Heavy", moveSpeedMultiplier: 0.9, accelerationMultiplier: 0.86, airAccelerationMultiplier: 0.86, jumpMultiplier: 0.94, slideMultiplier: 0.88 },
  throw: { damage: 9, stun: 0.14, speed: 520, knockback: 190 },
  mastery: ["Instant run", "Sustained cut", "Heat management", "Zombie spawn", "Poison bite"],
};
