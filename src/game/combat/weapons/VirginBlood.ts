import type { WeaponDefinition } from "../Weapon";

export const virginBlood: WeaponDefinition = {
  id: "virgin-blood",
  name: "Virgin Blood",
  kind: "utility",
  description: "F: full heal + holy buff. If you die after blessing yourself, revive with 30s angel wings.",
  primary: { damage: 0, cooldown: 0.1, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 0, cooldown: 0.1, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.02, accelerationMultiplier: 1.08, airAccelerationMultiplier: 1.08, jumpMultiplier: 1.03, slideMultiplier: 1.02 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["F full heal", "Holy buff", "One revive", "Angel wings", "No attacks"],
};
