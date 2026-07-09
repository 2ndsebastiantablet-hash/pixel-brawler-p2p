import type { WeaponDefinition } from "../Weapon";

export const superLegs: WeaponDefinition = {
  id: "super-legs",
  name: "Super Legs",
  kind: "utility",
  description: "leg equipment that massively boosts height, running, triple jumps, slides, slams, kicks, and leg armor.",
  primary: { damage: 0, cooldown: 0.55, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0.55, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.44, accelerationMultiplier: 1.58, airAccelerationMultiplier: 1.42, jumpMultiplier: 1.64, slideMultiplier: 1.5 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Huge height boost", "Triple jump", "Fast run", "Armor legs", "Power kicks", "Super slam"],
};
