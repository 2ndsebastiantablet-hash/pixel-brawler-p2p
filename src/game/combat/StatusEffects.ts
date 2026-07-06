export type StatusEffectId =
  | "bleed"
  | "daze"
  | "shock"
  | "suppressed"
  | "empowered"
  | "tripped"
  | "marked";

export interface StatusEffect {
  id: StatusEffectId;
  label: string;
  duration: number;
  stacks: number;
  tickDamage?: number;
  tickEvery?: number;
  tickTimer?: number;
}

export function updateStatusEffects(effects: StatusEffect[], dt: number): { damage: number; effects: StatusEffect[] } {
  let damage = 0;
  const next: StatusEffect[] = [];

  for (const effect of effects) {
    const updated = { ...effect, duration: effect.duration - dt };
    if (updated.tickDamage && updated.tickEvery) {
      updated.tickTimer = (updated.tickTimer ?? updated.tickEvery) - dt;
      while (updated.tickTimer <= 0 && updated.duration > 0) {
        damage += updated.tickDamage * updated.stacks;
        updated.tickTimer += updated.tickEvery;
      }
    }
    if (updated.duration > 0) {
      next.push(updated);
    }
  }

  return { damage, effects: next };
}

export function upsertStatusEffect(effects: StatusEffect[], effect: StatusEffect): StatusEffect[] {
  const existing = effects.find((item) => item.id === effect.id);
  if (!existing) {
    return [...effects, effect];
  }

  return effects.map((item) => item.id === effect.id
    ? {
        ...effect,
        stacks: Math.min(Math.max(item.stacks + effect.stacks, effect.stacks), 5),
        duration: Math.max(item.duration, effect.duration),
      }
    : item);
}
