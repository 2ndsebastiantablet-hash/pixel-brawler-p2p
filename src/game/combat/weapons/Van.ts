import type { WeaponDefinition } from "../Weapon";

export const van: WeaponDefinition = {
  id: "van",
  name: "Van",
  kind: "utility",
  description: "Strap vehicle. Q/E spawns or absorbs a physics van. Anyone can drive it. Ram players, honk to stun, shoot from inside, and manage gas/health.",
  primary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Heavy", moveSpeedMultiplier: 0.88, accelerationMultiplier: 0.88, airAccelerationMultiplier: 0.9, jumpMultiplier: 0.96, slideMultiplier: 0.9 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Strap summon", "Anyone can drive", "Ramming physics", "Honk stun", "Gas and health"],
};
