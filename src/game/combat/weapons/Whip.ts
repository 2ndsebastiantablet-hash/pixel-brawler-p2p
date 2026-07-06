import type { WeaponDefinition } from "../Weapon";

export const whip: WeaponDefinition = {
  id: "whip",
  name: "Whip",
  kind: "melee",
  description: "Long narrow control weapon with tip stun and quick double-hit pull.",
  primary: { damage: 7, cooldown: 0.38, range: 132, knockback: 150, stun: 0.16, radius: 12 },
  secondary: { damage: 5, cooldown: 0.55, range: 150, knockback: 70, stun: 0.2, radius: 10 },
  throw: { damage: 5, stun: 0.16, speed: 360, knockback: 120 },
  mastery: ["Double whip pull", "Tip crack", "Low trip", "Air latch", "Disarm chance prototype", "Whip cancel"],
};
