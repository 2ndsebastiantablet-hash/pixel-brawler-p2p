import type { WeaponId } from "./Weapon";

export type MarsAiMovementStyle = "rush" | "kite" | "reposition" | "guard" | "steady";
export type MarsAiStrategyId =
  | "gun"
  | "melee"
  | "axe"
  | "grapple"
  | "mobility"
  | "death-aura"
  | "van"
  | "spikes"
  | "cross"
  | "super-legs"
  | "holy-bazooka"
  | "chainsaw"
  | "space-passive"
  | "fallback";

export interface MarsAiItemStrategy {
  id: MarsAiStrategyId;
  preferredRange: {
    min: number;
    max: number;
  };
  movementStyle: MarsAiMovementStyle;
  allowPrimary: boolean;
  allowSecondary: boolean;
  usesReload: boolean;
  attackCooldown: number;
  damage: number;
  knockback: number;
  verticalKnockback: number;
}

const baseStrategy: MarsAiItemStrategy = {
  id: "fallback",
  preferredRange: { min: 24, max: 96 },
  movementStyle: "rush",
  allowPrimary: true,
  allowSecondary: false,
  usesReload: false,
  attackCooldown: 0.55,
  damage: 8,
  knockback: 240,
  verticalKnockback: -140,
};

export function getMarsAiItemStrategy(weaponId: WeaponId | string | undefined): MarsAiItemStrategy {
  switch (weaponId) {
    case "pistol":
    case "revolver":
    case "minigun":
    case "sniper":
    case "laser-blaster":
    case "slingshot":
      return {
        ...baseStrategy,
        id: "gun",
        preferredRange: { min: 180, max: 520 },
        movementStyle: "kite",
        allowSecondary: weaponId !== "pistol",
        usesReload: true,
        attackCooldown: weaponId === "minigun" ? 0.18 : weaponId === "sniper" ? 1.25 : 0.48,
        damage: weaponId === "sniper" ? 18 : weaponId === "minigun" ? 5 : 9,
        knockback: weaponId === "sniper" ? 520 : 300,
        verticalKnockback: weaponId === "sniper" ? -220 : -90,
      };
    case "chainsaw":
      return {
        ...baseStrategy,
        id: "chainsaw",
        preferredRange: { min: 0, max: 58 },
        movementStyle: "rush",
        attackCooldown: 0.2,
        damage: 5,
        knockback: 190,
        verticalKnockback: -55,
      };
    case "axe":
      return {
        ...baseStrategy,
        id: "axe",
        preferredRange: { min: 52, max: 340 },
        movementStyle: "rush",
        allowSecondary: true,
        attackCooldown: 0.72,
        damage: 14,
        knockback: 420,
        verticalKnockback: -210,
      };
    case "grappling-hook":
      return {
        ...baseStrategy,
        id: "grapple",
        preferredRange: { min: 90, max: 420 },
        movementStyle: "reposition",
        allowSecondary: true,
        attackCooldown: 0.75,
        damage: 6,
        knockback: 260,
        verticalKnockback: -160,
      };
    case "wings":
    case "teleport-ball":
      return {
        ...baseStrategy,
        id: "mobility",
        preferredRange: { min: 80, max: 250 },
        movementStyle: "reposition",
        allowPrimary: weaponId === "teleport-ball",
        attackCooldown: 0.7,
        damage: weaponId === "teleport-ball" ? 5 : 3,
        knockback: 260,
        verticalKnockback: -180,
      };
    case "death-aura":
      return {
        ...baseStrategy,
        id: "death-aura",
        preferredRange: { min: 0, max: 150 },
        movementStyle: "guard",
        attackCooldown: 0.45,
        damage: 4,
        knockback: 150,
        verticalKnockback: -120,
      };
    case "van":
      return {
        ...baseStrategy,
        id: "van",
        preferredRange: { min: 18, max: 140 },
        movementStyle: "rush",
        attackCooldown: 0.8,
        damage: 12,
        knockback: 520,
        verticalKnockback: -120,
      };
    case "spikes":
      return {
        ...baseStrategy,
        id: "spikes",
        preferredRange: { min: 50, max: 180 },
        movementStyle: "guard",
        attackCooldown: 0.9,
        damage: 10,
        knockback: 280,
        verticalKnockback: -170,
      };
    case "cross":
      return {
        ...baseStrategy,
        id: "cross",
        preferredRange: { min: 36, max: 180 },
        movementStyle: "guard",
        allowSecondary: true,
        attackCooldown: 0.82,
        damage: 9,
        knockback: 460,
        verticalKnockback: -200,
      };
    case "super-legs":
      return {
        ...baseStrategy,
        id: "super-legs",
        preferredRange: { min: 18, max: 96 },
        movementStyle: "rush",
        attackCooldown: 0.42,
        damage: 11,
        knockback: 360,
        verticalKnockback: -260,
      };
    case "holy-bazooka":
    case "rocket":
      return {
        ...baseStrategy,
        id: "holy-bazooka",
        preferredRange: { min: 210, max: 620 },
        movementStyle: "steady",
        allowSecondary: true,
        usesReload: weaponId === "holy-bazooka",
        attackCooldown: 1.35,
        damage: 18,
        knockback: 640,
        verticalKnockback: -300,
      };
    case "moon":
    case "jupiter":
    case "uranus":
    case "mars":
      return {
        ...baseStrategy,
        id: "space-passive",
        preferredRange: { min: 80, max: 170 },
        movementStyle: "reposition",
        allowPrimary: false,
        allowSecondary: false,
        damage: 0,
        knockback: 0,
        verticalKnockback: 0,
      };
    case "knife":
    case "machete":
    case "whip":
    case "sledgehammer":
    case "hands":
    case "virgin-blood":
    case "lightning-rod":
      return {
        ...baseStrategy,
        id: "melee",
        preferredRange: { min: 24, max: weaponId === "whip" || weaponId === "lightning-rod" ? 220 : 115 },
        movementStyle: "rush",
        allowSecondary: weaponId !== "virgin-blood",
        attackCooldown: weaponId === "sledgehammer" ? 0.95 : 0.5,
        damage: weaponId === "sledgehammer" ? 16 : 9,
        knockback: weaponId === "sledgehammer" ? 540 : 300,
        verticalKnockback: weaponId === "sledgehammer" ? -260 : -150,
      };
    default:
      return baseStrategy;
  }
}
