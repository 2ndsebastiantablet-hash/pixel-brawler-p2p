import type { Vec2 } from "./Damage";

export interface Hitbox {
  id: string;
  ownerId: string;
  weaponId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  knockback: Vec2;
  stun: number;
  age: number;
  duration: number;
  label: string;
  color: string;
  pull?: Vec2;
  status?: string;
  hits: string[];
}

export function intersectsRect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
