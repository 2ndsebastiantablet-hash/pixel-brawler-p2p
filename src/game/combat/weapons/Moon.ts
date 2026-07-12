import type { WeaponDefinition } from "../Weapon";

export const moon: WeaponDefinition = {
  id: "moon",
  name: "The Moon",
  kind: "utility",
  description: "Space event item. One use. Q/E flips the map upside down for 1 minute. User stays on bottom invisible floor and can switch sides by pressing both mouse buttons.",
  primary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.04, accelerationMultiplier: 1.08, airAccelerationMultiplier: 1.08, jumpMultiplier: 1.02, slideMultiplier: 1.02 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["One-use space event", "Map inversion", "Bottom floor safety", "Mouse chord side switch"],
};
