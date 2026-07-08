import type { WeaponDefinition } from "../Weapon";

export const rocket: WeaponDefinition = {
  id: "rocket",
  name: "Rocket",
  kind: "utility",
  description: "Left click places a rocket. Right click lights it. Ride it by standing on it, jump off before it explodes.",
  primary: { damage: 0, cooldown: 1.35, range: 0, knockback: 0, stun: 0 },
  secondary: { damage: 34, cooldown: 0.35, range: 0, knockback: 720, stun: 0.45, radius: 18 },
  weight: { label: "Heavy", moveSpeedMultiplier: 0.9, accelerationMultiplier: 0.88, airAccelerationMultiplier: 0.9, jumpMultiplier: 0.96, slideMultiplier: 0.9 },
  throw: { damage: 0, stun: 0, speed: 0, knockback: 0 },
  mastery: ["Place rocket", "Light fuse", "Ride", "Jump off", "Explosion"],
};
