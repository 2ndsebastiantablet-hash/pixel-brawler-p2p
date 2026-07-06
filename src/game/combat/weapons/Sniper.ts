import type { WeaponDefinition } from "../Weapon";

export const sniper: WeaponDefinition = {
  id: "sniper",
  name: "Sniper",
  kind: "projectile",
  description: "Long-range precision weapon with steady aim, piercing, and risky close handling.",
  primary: { damage: 45, cooldown: 1.25, speed: 1450, range: 1450, knockback: 430, stun: 0.2, radius: 3, pierce: 1 },
  secondary: { damage: 0, cooldown: 0.2, range: 0, knockback: 0, stun: 0 },
  ammo: { magazineSize: 1, reserve: 12, reloadTime: 1.55 },
  throw: { damage: 10, stun: 0.2, speed: 320, knockback: 210 },
  mastery: ["Steady zoom", "Upper-body bonus", "Full stillness bonus", "Wall mark", "Piercing shot", "No-scope bonus"],
  flags: { tapFire: true },
};
