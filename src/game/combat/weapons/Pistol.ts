import type { WeaponDefinition } from "../Weapon";

export const pistol: WeaponDefinition = {
  id: "pistol",
  name: "Pistol",
  kind: "projectile",
  description: "Fast tap-fire sidearm with visible kick, reload timing, slide shots, close knockback, and perfect reload timing.",
  primary: { damage: 10, cooldown: 0.2, speed: 1180, range: 900, knockback: 210, stun: 0.08, radius: 4 },
  secondary: { damage: 10, cooldown: 0.7, speed: 640, range: 470, knockback: 280, stun: 0.24, radius: 9 },
  weight: { label: "Light", moveSpeedMultiplier: 1.03, accelerationMultiplier: 1.05, airAccelerationMultiplier: 1.04, jumpMultiplier: 1, slideMultiplier: 1 },
  ammo: { magazineSize: 20, reserve: 80, reloadTime: 1.05 },
  throw: { damage: 10, stun: 0.24, speed: 640, knockback: 290 },
  mastery: ["Tap-fire only", "Air recoil boost", "Slide shot", "Close-shot knockback", "Perfect reload"],
  flags: { tapFire: true },
};
