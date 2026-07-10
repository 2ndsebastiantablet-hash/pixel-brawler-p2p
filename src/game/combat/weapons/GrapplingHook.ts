import type { WeaponDefinition } from "../Weapon";

export const grapplingHook: WeaponDefinition = {
  id: "grappling-hook",
  name: "Grappling Hook",
  kind: "utility",
  description: "Light physical rope hook. Left click launches or releases; right click pulls while attached.",
  primary: { damage: 6, cooldown: 0.35, speed: 980, range: 1350, knockback: 120, stun: 0.08, radius: 8 },
  secondary: { damage: 0, cooldown: 0.2, range: 0, knockback: 0, stun: 0 },
  weight: { label: "Light", moveSpeedMultiplier: 1.04, accelerationMultiplier: 1.08, airAccelerationMultiplier: 1.12, jumpMultiplier: 1.02, slideMultiplier: 1.02 },
  throw: { damage: 7, stun: 0.12, speed: 620, knockback: 170 },
  mastery: ["Physical rope hook", "Surface attach", "Player attach", "Right-click pull", "Left-click release"],
};
