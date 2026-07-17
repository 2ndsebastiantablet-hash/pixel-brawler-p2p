import { COMBAT_TUNING } from "../CombatTuning";
import type { WeaponDefinition } from "../Weapon";

export const uranus: WeaponDefinition = {
  id: "uranus",
  name: "Uranus",
  kind: "utility",
  description: "Space event item. One use. Q/E summons a falling planet flash that transforms the arena into a fast-moving Saturn-ring stage with a giant chomping hazard.",
  primary: {
    damage: 0,
    cooldown: 0.5,
    range: 0,
    knockback: 0,
    stun: 0,
  },
  secondary: {
    damage: 0,
    cooldown: 0.5,
    range: 0,
    knockback: 0,
    stun: 0,
  },
  weight: COMBAT_TUNING.weaponWeights.uranus,
  throw: {
    damage: 0,
    stun: 0,
    speed: 0,
    knockback: 0,
  },
  mastery: [
    "Q/E consumes Uranus to drop a planet, flash the arena, and reveal a moving Saturn-ring stage",
    "The ring scrolls forward, so players must keep moving or get forced into the left hazard",
    "The original low-poly Ring Chomper on the left instantly respawns players caught in its mouth",
  ],
};
