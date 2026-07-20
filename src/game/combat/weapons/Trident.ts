import type { WeaponDefinition } from "../Weapon";

export const trident: WeaponDefinition = {
  id: "trident",
  name: "Trident",
  kind: "melee",
  description: "Water trident. Left click strikes, right click throws and must be picked back up. Hits transform players into puffer fish, octopus, or goldfish for 40s. Press both mouse buttons for a 1-minute flood with a giant shark.",
  primary: { damage: 18, cooldown: 0.38, range: 104, knockback: 285, stun: 0.18, radius: 22 },
  secondary: { damage: 22, cooldown: 0.64, speed: 900, range: 820, knockback: 360, stun: 0.26, radius: 10 },
  weight: { label: "Balanced", moveSpeedMultiplier: 0.96, accelerationMultiplier: 0.95, airAccelerationMultiplier: 0.96, jumpMultiplier: 0.98, slideMultiplier: 0.96 },
  throw: { damage: 22, stun: 0.26, speed: 900, knockback: 360 },
  mastery: ["Mouse-aimed stab", "Manual throw pickup", "Sea creature transform", "Flood super", "Puffer poison", "Octopus throw"],
};
