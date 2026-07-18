import { COMBAT_TUNING } from "../CombatTuning";
import type { WeaponDefinition } from "../Weapon";

export const mars: WeaponDefinition = {
  id: "mars",
  name: "Mars",
  kind: "utility",
  description: "Space event item. One use. Q/E summons Mars, extracts green laser duplicates from every player, and releases AI clones that hunt their originals until the event ends.",
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
  weight: COMBAT_TUNING.weaponWeights.mars,
  throw: {
    damage: 0,
    stun: 0,
    speed: 0,
    knockback: 0,
  },
  mastery: [
    "Q/E consumes Mars to raise a red planet and pull green laser duplicates from every player",
    "Released clones copy player colors and loadouts, then hunt their originals with item-aware tactics",
    "Killed clones reform after a short delay until Mars descends and dissolves every duplicate",
  ],
};
