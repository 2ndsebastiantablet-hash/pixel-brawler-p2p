import type { Vec2 } from "./Damage";
import type { WeaponId } from "./Weapon";

export interface Projectile {
  id: string;
  ownerId: string;
  weaponId: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  knockback: Vec2;
  stun: number;
  age: number;
  lifetime: number;
  gravity: number;
  bounces: number;
  pierce: number;
  label: string;
  color: string;
  trailColor: string;
  originX?: number;
  originY?: number;
  teleportsOwner?: boolean;
  pulseTimer?: number;
  status?: string;
  state?: "resting" | "lit" | "chaotic" | "attached";
  riderId?: string;
  chaos?: number;
  homingStrength?: number;
  targetId?: string;
  ownerFacing?: number;
  visualOnly?: boolean;
  hits: string[];
}

export function projectileBounds(projectile: Projectile): { x: number; y: number; width: number; height: number } {
  return {
    x: projectile.x - projectile.radius,
    y: projectile.y - projectile.radius,
    width: projectile.radius * 2,
    height: projectile.radius * 2,
  };
}
