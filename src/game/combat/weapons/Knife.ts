import type { WeaponDefinition } from "../Weapon";

export const knife: WeaponDefinition = {
  id: "knife",
  name: "Knife",
  kind: "melee",
  description: "Fast close-range combo weapon whose main gimmick is infinite recoil throws.",
  primary: { damage: 6, cooldown: 0.16, range: 44, knockback: 85, stun: 0.07, radius: 12, status: "bleed" },
  secondary: { damage: 10, cooldown: 0.22, speed: 960, range: 620, knockback: 150, stun: 0.09, radius: 6, status: "bleed" },
  weight: { label: "Light", moveSpeedMultiplier: 1.08, accelerationMultiplier: 1.1, airAccelerationMultiplier: 1.08, jumpMultiplier: 1.02, slideMultiplier: 1.06 },
  throw: { damage: 10, stun: 0.09, speed: 960, knockback: 150 },
  mastery: ["Infinite throw", "Throw recoil", "Air throw boost", "Three-hit combo", "Dash stab", "Bleed status"],
  flags: { canParry: true },
};
