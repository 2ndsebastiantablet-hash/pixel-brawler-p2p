import type { WeaponDefinition } from "../Weapon";

export const sledgeHammer: WeaponDefinition = {
  id: "sledgehammer",
  name: "Sledgehammer",
  kind: "heavy",
  description: "Slow heavy weapon with chunky hammer arcs, armor startup, shoulder shove, air drop, and charged shockwaves.",
  primary: { damage: 34, cooldown: 0.88, range: 92, knockback: 560, stun: 0.38, radius: 34, chargeScale: 1.9 },
  secondary: { damage: 15, cooldown: 0.5, range: 60, knockback: 360, stun: 0.2, radius: 24, status: "daze" },
  throw: { damage: 18, stun: 0.28, speed: 330, knockback: 360 },
  mastery: ["Charged overhead slam", "Ground shockwave", "Shoulder shove", "Air hammer drop", "Armor startup"],
  flags: { slowsMovement: true },
};
