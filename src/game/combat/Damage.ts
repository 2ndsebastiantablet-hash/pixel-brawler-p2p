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
}

export interface DamageResult {
  applied: boolean;
  remainingHp: number;
}

export interface DamageNumber {
  id: string;
  x: number;
  y: number;
  amount: number;
  age: number;
  label: string;
  color: string;
}
