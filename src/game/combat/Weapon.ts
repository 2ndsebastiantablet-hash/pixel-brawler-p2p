import type { PlayerPhysicsState } from "../Physics";
import type { Vec2 } from "./Damage";
import type { StatusEffectId } from "./StatusEffects";

export type WeaponId =
  | "pistol"
  | "whip"
  | "slingshot"
  | "laser-blaster"
  | "revolver"
  | "minigun"
  | "sniper"
  | "knife"
  | "machete"
  | "axe"
  | "wings"
  | "virgin-blood"
  | "death-aura"
  | "rocket"
  | "holy-bazooka"
  | "grappling-hook"
  | "chainsaw"
  | "spikes"
  | "van"
  | "spirit-fighter"
  | "cross"
  | "moon"
  | "hands"
  | "super-legs"
  | "teleport-ball"
  | "lightning-rod"
  | "sledgehammer";

export type WeaponKind = "projectile" | "melee" | "beam" | "utility" | "heavy";

export interface AmmoDefinition {
  magazineSize: number;
  reserve: number;
  reloadTime: number;
  consumePerShot?: number;
}

export interface ChargeDefinition {
  maxCharge: number;
  thresholds: number[];
  overchargeDamage?: number;
}

export interface WeaponThrowDefinition {
  damage: number;
  stun: number;
  speed: number;
  knockback: number;
}

export interface WeaponWeightDefinition {
  label: "Light" | "Balanced" | "Heavy" | "Very Heavy";
  moveSpeedMultiplier: number;
  accelerationMultiplier: number;
  airAccelerationMultiplier: number;
  jumpMultiplier: number;
  slideMultiplier: number;
}

export interface AttackProfile {
  damage: number;
  cooldown: number;
  speed?: number;
  range: number;
  knockback: number;
  stun: number;
  radius?: number;
  gravity?: number;
  bounces?: number;
  pierce?: number;
  spread?: number;
  pellets?: number;
  chargeScale?: number;
  status?: StatusEffectId;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  description: string;
  primary: AttackProfile;
  secondary: AttackProfile;
  weight: WeaponWeightDefinition;
  ammo?: AmmoDefinition;
  charge?: ChargeDefinition;
  throw: WeaponThrowDefinition;
  mastery: string[];
  flags?: {
    tapFire?: boolean;
    slowsMovement?: boolean;
    canParry?: boolean;
    selfBuff?: boolean;
    teleport?: boolean;
  };
}

export interface WeaponAmmoState {
  magazine: number;
  reserve: number;
  reloadTimer: number;
  perfectWindow: number;
  perfectShots: number;
  perfectQueued: boolean;
}

export interface WeaponChargeState {
  charge: number;
  charging: boolean;
  heat: number;
  maxCharge: number;
}

export interface WeaponInventoryState {
  equippedWeapon: WeaponId;
  weaponInventory: WeaponId[];
  ammo: Partial<Record<WeaponId, WeaponAmmoState>>;
  charge: Partial<Record<WeaponId, WeaponChargeState>>;
  cooldowns: Partial<Record<WeaponId, number>>;
  combo: Partial<Record<WeaponId, { targetId?: string; timer: number; count: number }>>;
}

export interface WeaponUseContext {
  ownerId: string;
  player: PlayerPhysicsState;
  aim: Vec2;
  now: number;
  heldMs: number;
  isNewPress: boolean;
}

export type WeaponUseKind = "fired" | "hitbox" | "utility" | "reload-started" | "dry-fire" | "blocked";

export interface WeaponUseResult {
  kind: WeaponUseKind;
  weaponId: WeaponId;
  label: string;
}
