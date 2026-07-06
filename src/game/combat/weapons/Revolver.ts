import type { WeaponDefinition } from "../Weapon";

export const revolver: WeaponDefinition = {
  id: "revolver",
  name: "Revolver",
  kind: "projectile",
  description: "Slow high-knockback precision sidearm with fan fire and last-bullet reward.",
  primary: { damage: 18, cooldown: 0.45, speed: 1050, range: 880, knockback: 310, stun: 0.12, radius: 4 },
  secondary: { damage: 12, cooldown: 0.12, speed: 850, range: 620, knockback: 180, stun: 0.07, radius: 4, spread: 0.18, pellets: 3 },
  weight: { label: "Balanced", moveSpeedMultiplier: 0.99, accelerationMultiplier: 0.99, airAccelerationMultiplier: 1, jumpMultiplier: 1, slideMultiplier: 1 },
  ammo: { magazineSize: 6, reserve: 36, reloadTime: 1.35 },
  throw: { damage: 9, stun: 0.18, speed: 430, knockback: 200 },
  mastery: ["Fan fire", "Quickdraw", "Last bullet bonus", "Perfect reload", "Duel shot", "Ricochet shot"],
  flags: { tapFire: true },
};
