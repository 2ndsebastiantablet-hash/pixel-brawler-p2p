import type { WeaponDefinition } from "../Weapon";

export const machete: WeaponDefinition = {
  id: "machete",
  name: "Machete",
  kind: "melee",
  description: "Medium melee arc with heavy chop, low slash, projectile deflect, and multi-hit clear.",
  primary: { damage: 14, cooldown: 0.34, range: 62, knockback: 190, stun: 0.13, radius: 20 },
  secondary: { damage: 22, cooldown: 0.72, range: 74, knockback: 300, stun: 0.2, radius: 24 },
  throw: { damage: 12, stun: 0.16, speed: 460, knockback: 190 },
  mastery: ["Heavy chop", "Wide clearing slash", "Crouch slash", "Air chop", "Brush-cut combo", "Weapon clash"],
};
