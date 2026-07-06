import type { WeaponDefinition } from "../Weapon";

export const lightningRod: WeaponDefinition = {
  id: "lightning-rod",
  name: "Lightning Rod",
  kind: "utility",
  description: "Risky self-strike weapon that grants shock empowerment or electrifies thrown landing zones.",
  primary: { damage: 11, cooldown: 0.36, range: 58, knockback: 145, stun: 0.12, radius: 14, status: "shock" },
  secondary: { damage: 15, cooldown: 1.3, range: 110, knockback: 230, stun: 0.32, radius: 34, status: "shock" },
  throw: { damage: 12, stun: 0.28, speed: 470, knockback: 180 },
  mastery: ["Conductive landing", "Enemy empower hazard", "Chain shock", "Self-risk", "Storm timing", "Grounded bonus"],
  flags: { selfBuff: true },
};
