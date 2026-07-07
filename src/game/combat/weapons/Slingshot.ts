import type { WeaponDefinition } from "../Weapon";

export const slingshot: WeaponDefinition = {
  id: "slingshot",
  name: "Slingshot",
  kind: "projectile",
  description: "Fast five-stone volleys with long ricochet life and wider scatter utility.",
  primary: { damage: 5, cooldown: 0.3, speed: 1280, range: 3400, knockback: 105, stun: 0.07, radius: 5, gravity: 300, bounces: 10, pellets: 5, spread: 0.06, chargeScale: 1.25 },
  secondary: { damage: 4, cooldown: 0.58, speed: 1220, range: 3200, knockback: 78, stun: 0.05, radius: 4, gravity: 320, bounces: 10, pellets: 5, spread: 0.42 },
  weight: { label: "Light", moveSpeedMultiplier: 1.04, accelerationMultiplier: 1.06, airAccelerationMultiplier: 1.05, jumpMultiplier: 1.01, slideMultiplier: 1.03 },
  ammo: { magazineSize: 40, reserve: 80, reloadTime: 0.9, consumePerShot: 5 },
  throw: { damage: 4, stun: 0.12, speed: 380, knockback: 100 },
  mastery: ["Stretch shot", "Ricochet stone", "Head bonk", "Scatter pebble", "Slide skip shot", "Counter-pop"],
};
