import { COMBAT_TUNING } from "../CombatTuning";
import type { WeaponDefinition } from "../Weapon";

export const grabber: WeaponDefinition = {
  id: "grabber",
  name: "Grabber",
  kind: "utility",
  description: "Strap utility item. Adds an extra F-cycle attachment slot on a spring arm; empty Grabber auto-punches nearby targets and extends pickup reach.",
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
  weight: COMBAT_TUNING.weaponWeights.grabber,
  throw: {
    damage: 0,
    stun: 0,
    speed: 0,
    knockback: 0,
  },
  mastery: [
    "Front/back strap only; not a Space item and not a hand weapon",
    "Adds an extra F-cycle attachment slot for physical held items",
    "When empty, the arm reaches farther for pickups and auto-punches nearby targets",
  ],
};
