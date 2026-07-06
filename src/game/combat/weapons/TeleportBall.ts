import type { WeaponDefinition } from "../Weapon";

export const teleportBall: WeaponDefinition = {
  id: "teleport-ball",
  name: "Teleporting Ball",
  kind: "utility",
  description: "Arc-thrown marker that reliably teleports the player after three seconds unless canceled.",
  primary: { damage: 5, cooldown: 0.9, speed: 580, range: 900, knockback: 140, stun: 0.1, radius: 9, gravity: 760, bounces: 2 },
  secondary: { damage: 0, cooldown: 0.8, range: 0, knockback: 0, stun: 0 },
  throw: { damage: 4, stun: 0.08, speed: 560, knockback: 140 },
  mastery: ["Three-second teleport", "Cancel fakeout", "Direct-hit speedup", "Momentum carry", "Arrival burst"],
  flags: { teleport: true },
};
