import type { WeaponDefinition } from "../Weapon";

export const superBomb: WeaponDefinition = {
  id: "super-bomb",
  name: "SUPER BOMB",
  kind: "utility",
  description: "Strap item. Empty hand turns you into a walking bomb. Left click detonates mouse point, right click throws a limb bomb, both clicks trigger a full body explosion and reform after 10s. Super cooldown 90s and weakens you after each use.",
  primary: { damage: 0, cooldown: 0.35, range: 160, knockback: 0, stun: 0, radius: 160 },
  secondary: { damage: 0, cooldown: 1.15, speed: 780, range: 860, knockback: 0, stun: 0, radius: 18, gravity: 820 },
  weight: { label: "Light", moveSpeedMultiplier: 1.03, accelerationMultiplier: 1.06, airAccelerationMultiplier: 1.04, jumpMultiplier: 1, slideMultiplier: 1.02 },
  throw: { damage: 0, stun: 0, speed: 760, knockback: 0 },
  mastery: ["Strap item", "Empty-hand active", "Mouse-point blast", "Limb bomb", "Full body explosion", "Reform"],
};
