import type { WeaponDefinition } from "../Weapon";

export const wings: WeaponDefinition = {
  id: "wings",
  name: "Wings",
  kind: "utility",
  description: "Light mobility item for flapping, gliding, diving, and air bursts.",
  primary: { damage: 0, cooldown: 0.1, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0.1, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.04, accelerationMultiplier: 1.08, airAccelerationMultiplier: 1.2, jumpMultiplier: 1.04, slideMultiplier: 1 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Flap lift", "Glide descent", "Dive control", "Air burst", "Gust pushback", "Fall safety"],
};
