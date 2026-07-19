import { COMBAT_TUNING } from "../CombatTuning";
import type { WeaponDefinition } from "../Weapon";

export const neptune: WeaponDefinition = {
  id: "neptune",
  name: "Neptune",
  kind: "utility",
  description: "Space event item. One use. Q/E summons Neptune: giant hands, flood waves, map tilts, instant laser eyes, and killable sea creatures for one minute.",
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
  weight: COMBAT_TUNING.weaponWeights.neptune,
  throw: {
    damage: 0,
    stun: 0,
    speed: 0,
    knockback: 0,
  },
  mastery: [
    "Q/E consumes Neptune to raise a giant low-poly sea god from under the stage",
    "Neptune floods, tilts, fires lethal eye lasers, and summons killable sea creatures",
    "Sea creatures vanish with the event and can be destroyed by normal combat damage",
  ],
};
