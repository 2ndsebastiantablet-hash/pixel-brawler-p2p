import { COMBAT_TUNING } from "../CombatTuning";
import type { WeaponDefinition } from "../Weapon";

export const jupiter: WeaponDefinition = {
  id: "jupiter",
  name: "Jupiter",
  kind: "utility",
  description: "Space event item. One use. Q/E starts Jupiter: footstep pressure markers erupt upward, orange gas creates floaty gravity, and a shark tornado releases low-poly homing sharks.",
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
  weight: COMBAT_TUNING.weaponWeights.jupiter,
  throw: {
    damage: 0,
    stun: 0,
    speed: 0,
    knockback: 0,
  },
  mastery: [
    "Q/E opens a one-use Jupiter event with delayed footstep bursts, orange gas, and a shark tornado",
    "Floaty gravity lifts everyone while unstable footsteps erupt after one second",
    "Homing sharks can be killed, but the tornado core is lethal",
  ],
};
