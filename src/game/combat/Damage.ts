import type { WeaponId } from "./Weapon";

export type HitLocation = "head" | "body" | "leg";

export interface Vec2 {
  x: number;
  y: number;
}

export interface DamageRequest {
  sourceId: string;
  targetId: string;
  damage: number;
  knockback: Vec2;
  stun: number;
  label: string;
  status?: string;
  weaponId?: WeaponId;
  hitY?: number;
  hitLocation?: HitLocation;
  skipHitLocationScaling?: boolean;
  emitEvent?: boolean;
}

export interface DamageResult {
  applied: boolean;
  remainingHp: number;
  hitLocation?: HitLocation;
}

export interface DamageNumber {
  id: string;
  x: number;
  y: number;
  amount: number;
  age: number;
  label: string;
  color: string;
  hitLocation?: HitLocation;
}
