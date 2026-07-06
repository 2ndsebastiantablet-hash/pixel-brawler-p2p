import type { WeaponDefinition } from "../Weapon";

export const slingshot: WeaponDefinition = {
  id: "slingshot",
  name: "Slingshot",
  kind: "projectile",
  description: "Short arcing stones with charge, bounce, and scatter utility.",
  primary: { damage: 6, cooldown: 0.28, speed: 620, range: 480, knockback: 130, stun: 0.09, radius: 5, gravity: 720, bounces: 1, chargeScale: 1.45 },
  secondary: { damage: 3, cooldown: 0.55, speed: 540, range: 340, knockback: 80, stun: 0.05, radius: 4, gravity: 680, bounces: 1, pellets: 3, spread: 0.24 },
  weight: { label: "Light", moveSpeedMultiplier: 1.04, accelerationMultiplier: 1.06, airAccelerationMultiplier: 1.05, jumpMultiplier: 1.01, slideMultiplier: 1.03 },
  ammo: { magazineSize: 10, reserve: 40, reloadTime: 0.9, consumePerShot: 1 },
  throw: { damage: 4, stun: 0.12, speed: 380, knockback: 100 },
  mastery: ["Stretch shot", "Ricochet stone", "Head bonk", "Scatter pebble", "Slide skip shot", "Counter-pop"],
};
