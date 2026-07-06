import type { WeaponDefinition } from "../Weapon";

export const lightningRod: WeaponDefinition = {
  id: "lightning-rod",
  name: "Lightning Rod",
  kind: "utility",
  description: "Risky rod poke and self-strike buff: call lightning, take strain, then shock enemies on touch.",
  primary: { damage: 12, cooldown: 0.3, range: 76, knockback: 235, stun: 0.24, radius: 16, status: "shock" },
  secondary: { damage: 11, cooldown: 1.1, range: 136, knockback: 320, stun: 0.34, radius: 46, status: "shock" },
  weight: { label: "Balanced", moveSpeedMultiplier: 1, accelerationMultiplier: 1, airAccelerationMultiplier: 1.02, jumpMultiplier: 1, slideMultiplier: 1 },
  throw: { damage: 12, stun: 0.3, speed: 520, knockback: 190 },
  mastery: ["Delayed self-strike", "Empowered touch shock", "Movement boost", "Shock poke", "Strain self-risk"],
  flags: { selfBuff: true },
};
