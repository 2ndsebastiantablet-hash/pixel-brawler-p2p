import type { WeaponDefinition } from "../Weapon";

export const sledgeHammer: WeaponDefinition = {
  id: "sledgehammer",
  name: "Sledge Hammer",
  kind: "heavy",
  description: "Slow heavy hitter with charge, shockwave, armor frames, shove, and huge knockback.",
  primary: { damage: 32, cooldown: 0.85, range: 74, knockback: 520, stun: 0.34, radius: 28, chargeScale: 1.8 },
  secondary: { damage: 14, cooldown: 0.55, range: 52, knockback: 330, stun: 0.18, radius: 22 },
  throw: { damage: 18, stun: 0.26, speed: 310, knockback: 340 },
  mastery: ["Charged overhead slam", "Ground shockwave", "Shoulder shove", "Air hammer drop", "Bounce recoil", "Armor frames", "Stagger effect"],
  flags: { slowsMovement: true },
};
