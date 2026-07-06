import type { WeaponDefinition } from "../Weapon";

export const teleportBall: WeaponDefinition = {
  id: "teleport-ball",
  name: "Teleport Ball",
  kind: "utility",
  description: "Arc-thrown marker that teleports the player after three seconds with burst utility.",
  primary: { damage: 4, cooldown: 1.1, speed: 560, range: 720, knockback: 140, stun: 0.08, radius: 8, gravity: 780, bounces: 1 },
  secondary: { damage: 0, cooldown: 0.8, range: 0, knockback: 0, stun: 0 },
  throw: { damage: 4, stun: 0.08, speed: 560, knockback: 140 },
  mastery: ["Cancel teleport", "Direct-hit faster teleport", "Telefrag burst", "Enemy pull", "Momentum carry", "Fakeout"],
  flags: { teleport: true },
};
