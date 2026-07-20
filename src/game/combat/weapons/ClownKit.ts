import type { WeaponDefinition } from "../Weapon";

export const clownKit: WeaponDefinition = {
  id: "clown-kit",
  name: "Clown Kit",
  kind: "utility",
  description: "Head item. Gives clown mask and gloves. Empty hand required. Left click fires 2-damage finger-gun bullets with huge knockback. Right click makes balloon tools. Both clicks build a comedy stage that traps enemies in laugh waves.",
  primary: { damage: 2, cooldown: 0.22, speed: 980, range: 820, knockback: 1320, stun: 0.12, radius: 6 },
  secondary: { damage: 0, cooldown: 0.75, range: 340, knockback: 0, stun: 0, radius: 24 },
  weight: { label: "Light", moveSpeedMultiplier: 1.05, accelerationMultiplier: 1.1, airAccelerationMultiplier: 1.08, jumpMultiplier: 1.02, slideMultiplier: 1.04 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Head item", "Empty-hand kit", "Finger gun", "Balloon tools", "Comedy Stage"],
};
