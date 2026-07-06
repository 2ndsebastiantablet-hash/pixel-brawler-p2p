import type { WeaponDefinition } from "../Weapon";

export const pistol: WeaponDefinition = {
  id: "pistol",
  name: "Pistol",
  kind: "projectile",
  description: "Reliable tap-fire sidearm with reload timing and movement recoil tricks.",
  primary: { damage: 10, cooldown: 0.22, speed: 980, range: 780, knockback: 190, stun: 0.08, radius: 4 },
  secondary: { damage: 8, cooldown: 0.7, speed: 520, range: 420, knockback: 260, stun: 0.22, radius: 9 },
  ammo: { magazineSize: 20, reserve: 80, reloadTime: 1.05 },
  throw: { damage: 8, stun: 0.22, speed: 520, knockback: 260 },
  mastery: ["Slide shot", "Air shot recoil", "Perfect reload", "Empty toss", "Close shot bonus"],
  flags: { tapFire: true },
};
