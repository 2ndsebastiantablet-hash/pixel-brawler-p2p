import type { WeaponDefinition } from "../Weapon";

export const spikes: WeaponDefinition = {
  id: "spikes",
  name: "Spikes",
  kind: "utility",
  description: "Strap weapon. Q/E activates 30s spike mode. Click to spawn impaling poison spikes. No spike cooldown during mode. 60s cooldown after.",
  primary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.02, accelerationMultiplier: 1.06, airAccelerationMultiplier: 1.04, jumpMultiplier: 1, slideMultiplier: 1.02 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Strap activation", "Spike mode", "Impale lock", "Poison thorns", "Disintegration"],
};
