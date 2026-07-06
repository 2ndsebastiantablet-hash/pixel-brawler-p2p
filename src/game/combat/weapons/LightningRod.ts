import type { WeaponDefinition } from "../Weapon";

export const lightningRod: WeaponDefinition = {
  id: "lightning-rod",
  name: "Lightning Rod",
  kind: "utility",
  description: "Risky rod poke and self-strike buff: call lightning, take strain, then shock enemies on touch.",
  primary: { damage: 10, cooldown: 0.34, range: 66, knockback: 135, stun: 0.14, radius: 14, status: "shock" },
  secondary: { damage: 9, cooldown: 1.1, range: 124, knockback: 250, stun: 0.28, radius: 42, status: "shock" },
  throw: { damage: 12, stun: 0.3, speed: 520, knockback: 190 },
  mastery: ["Delayed self-strike", "Empowered touch shock", "Movement boost", "Shock poke", "Strain self-risk"],
  flags: { selfBuff: true },
};
