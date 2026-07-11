import type { WeaponDefinition } from "../Weapon";

export const spiritFighter: WeaponDefinition = {
  id: "spirit-fighter",
  name: "Spirit of a Fighter",
  kind: "utility",
  description: "High-skill rhythm fighting mode. Stay on beat to punch, counter, grab, throw, and unleash flurries. Three missed beats or whiffs ends the mode and makes you Winded.",
  primary: { damage: 9, cooldown: 0, range: 92, knockback: 260, stun: 0.12 },
  secondary: { damage: 12, cooldown: 0, range: 78, knockback: 360, stun: 0.24 },
  weight: { label: "Light", moveSpeedMultiplier: 1.06, accelerationMultiplier: 1.12, airAccelerationMultiplier: 1.1, jumpMultiplier: 1.02, slideMultiplier: 1.04 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Beat focus", "Perfect punches", "Counter throws", "Flash step", "100-punch flurry", "Winded failure"],
};
