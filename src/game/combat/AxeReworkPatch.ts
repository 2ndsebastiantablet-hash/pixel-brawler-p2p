import type { PlayerPhysicsState } from "../Physics";
import { CombatSystem } from "./CombatSystem";
import type { Vec2 } from "./Damage";
import type { Projectile } from "./Projectile";
import type { WeaponUseContext, WeaponUseResult } from "./Weapon";
import { weaponRegistry } from "./WeaponRegistry";

type LooseCombatSystem = CombatSystem & Record<string, any>;
type LooseCombatant = Record<string, any>;

interface AxeRushState {
  targetId: string;
  timer: number;
  lastDir: Vec2;
}

interface AxeThrowState {
  projectileId: string;
  returning: boolean;
}

const rushStates = new WeakMap<CombatSystem, Map<string, AxeRushState>>();
const throwStates = new WeakMap<CombatSystem, Map<string, AxeThrowState>>();
const rushRange = 520;
const rushHitDistance = 72;
const rushSeconds = 0.42;
const rushSpeed = 1080;
const recallSpeed = 1380;

const originalUsePrimary = CombatSystem.prototype.usePrimary;
const originalUseSecondary = CombatSystem.prototype.useSecondary;
const originalUpdate = CombatSystem.prototype.update;

function getRushes(system: CombatSystem): Map<string, AxeRushState> {
  let map = rushStates.get(system);
  if (!map) {
    map = new Map();
    rushStates.set(system, map);
  }
  return map;
}

function getThrows(system: CombatSystem): Map<string, AxeThrowState> {
  let map = throwStates.get(system);
  if (!map) {
    map = new Map();
    throwStates.set(system, map);
  }
  return map;
}

CombatSystem.prototype.usePrimary = function patchedUsePrimary(context: WeaponUseContext): WeaponUseResult {
  const system = this as LooseCombatSystem;
  if (system.inventory.equippedWeapon !== "axe") {
    return originalUsePrimary.call(this, context);
  }

  const cooldown = system.inventory.cooldowns.axe ?? 0;
  if (cooldown > 0) {
    return { kind: "blocked", weaponId: "axe", label: "Axe cooldown" };
  }

  const target = findNearestTarget(system, context.ownerId, context.player, rushRange);
  const axe = weaponRegistry.get("axe");
  if (!target) {
    system.inventory.cooldowns.axe = axe.primary.cooldown;
    spawnAxeSwing(system, context.ownerId, context.player, normalize(context.aim), axe.primary.range + 42, axe.primary.damage, axe.primary.knockback, "Extended Axe Swing");
    pushEvent(system, context.ownerId, "primary", muzzle(system, context.player), normalize(context.aim), "Extended Axe Swing", context.now);
    sound(system, "axe-swing");
    return { kind: "hitbox", weaponId: "axe", label: "Extended Axe Swing" };
  }

  const ownerCenter = centerOfPlayer(context.player);
  const targetCenter = centerOf(target);
  const dir = normalize({ x: targetCenter.x - ownerCenter.x, y: targetCenter.y - ownerCenter.y });
  getRushes(this).set(context.ownerId, {
    targetId: target.id,
    timer: rushSeconds,
    lastDir: dir,
  });
  context.player.velocityX = dir.x * rushSpeed;
  context.player.velocityY = dir.y * Math.min(rushSpeed * 0.6, 640);
  context.player.grounded = false;
  system.inventory.cooldowns.axe = Math.max(axe.primary.cooldown, 0.56);
  effect(system, "tracer", ownerCenter.x, ownerCenter.y, targetCenter.x, targetCenter.y, colorForAxe(), "Axe Rush");
  sound(system, "axe-swing");
  pushEvent(system, context.ownerId, "primary", ownerCenter, dir, "Axe Rush", context.now);
  return { kind: "utility", weaponId: "axe", label: "Axe Rush" };
};

CombatSystem.prototype.useSecondary = function patchedUseSecondary(context: WeaponUseContext): WeaponUseResult {
  const system = this as LooseCombatSystem;
  if (system.inventory.equippedWeapon !== "axe") {
    return originalUseSecondary.call(this, context);
  }

  const throws = getThrows(this);
  const existing = throws.get(context.ownerId);
  const existingProjectile = existing ? (system.projectiles as Projectile[]).find((projectile) => projectile.id === existing.projectileId) : undefined;
  if (existing && existingProjectile) {
    existing.returning = true;
    existingProjectile.gravity = 0;
    existingProjectile.pierce = 99;
    existingProjectile.bounces = 0;
    existingProjectile.damage = Math.max(existingProjectile.damage, weaponRegistry.get("axe").throw.damage * 2.4);
    existingProjectile.stun = Math.max(existingProjectile.stun, 0.36);
    existingProjectile.label = "Returning Axe";
    existingProjectile.color = "#9fe8ff";
    existingProjectile.trailColor = "#9fe8ff";
    existingProjectile.lifetime = Math.max(existingProjectile.lifetime, existingProjectile.age + 2.4);
    effect(system, "tracer", existingProjectile.x, existingProjectile.y, context.player.x + context.player.width / 2, context.player.y + context.player.height / 2, "#9fe8ff", "Recall");
    sound(system, "axe-throw");
    return { kind: "utility", weaponId: "axe", label: "Recall Axe" };
  }

  const cooldown = system.inventory.cooldowns.axe ?? 0;
  if (cooldown > 0) {
    return { kind: "blocked", weaponId: "axe", label: "Throw cooldown" };
  }

  const axe = weaponRegistry.get("axe");
  const aim = normalize(context.aim);
  const start = muzzle(system, context.player);
  const projectileId = makeId(system, "axe");
  const airThrow = !context.player.grounded;
  (system.projectiles as Projectile[]).push({
    id: projectileId,
    ownerId: context.ownerId,
    weaponId: "axe",
    x: start.x,
    y: start.y,
    vx: aim.x * axe.throw.speed,
    vy: aim.y * axe.throw.speed - 45,
    radius: axe.secondary.radius ?? 12,
    damage: axe.throw.damage,
    knockback: { x: aim.x * axe.throw.knockback, y: aim.y * axe.throw.knockback - 80 },
    stun: axe.throw.stun,
    age: 0,
    lifetime: Math.max(1.3, axe.secondary.range / Math.max(axe.throw.speed, 1)),
    gravity: axe.secondary.gravity ?? 240,
    bounces: axe.secondary.bounces ?? 1,
    pierce: 1,
    label: "Thrown Axe",
    color: colorForAxe(),
    trailColor: colorForAxe(),
    originX: start.x,
    originY: start.y,
    status: axe.secondary.status,
    hits: [],
  });
  throws.set(context.ownerId, { projectileId, returning: false });
  system.inventory.cooldowns.axe = Math.max(0.22, axe.secondary.cooldown * 0.45);
  if (typeof system.applySelfRecoil === "function") {
    system.applySelfRecoil(context.player, aim, airThrow ? 112 : 76, airThrow ? 26 : 16);
  } else {
    context.player.velocityX -= aim.x * (airThrow ? 220 : 140);
    context.player.velocityY -= Math.max(0.25, aim.y) * (airThrow ? 70 : 38);
  }
  effect(system, "tracer", start.x, start.y, start.x + aim.x * 120, start.y + aim.y * 120, colorForAxe(), "Throw");
  sound(system, "axe-throw");
  pushEvent(system, context.ownerId, "throw", start, aim, "Axe Throw", context.now);
  return { kind: "fired", weaponId: "axe", label: "Axe Throw" };
};

CombatSystem.prototype.update = function patchedUpdate(dt: number, players: PlayerPhysicsState[]): void {
  const system = this as LooseCombatSystem;
  applyAxeRushes(system, dt, players);
  updateReturningAxes(system, players);
  originalUpdate.call(this, dt, players);
  cleanupMissingAxeThrows(system);
};

function applyAxeRushes(system: LooseCombatSystem, dt: number, players: PlayerPhysicsState[]): void {
  const rushes = getRushes(system);
  for (const [ownerId, rush] of rushes) {
    const player = players.find((item) => item.id === ownerId);
    const target = system.combatants.get(rush.targetId);
    if (!player || !target || target.respawnTimer > 0) {
      rushes.delete(ownerId);
      continue;
    }
    const from = centerOfPlayer(player);
    const to = centerOf(target);
    const dir = normalize({ x: to.x - from.x, y: to.y - from.y });
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    player.velocityX = dir.x * rushSpeed;
    player.velocityY = dir.y * Math.min(rushSpeed * 0.55, 620);
    player.grounded = false;
    rush.lastDir = dir;
    rush.timer -= dt;
    if (distance <= rushHitDistance || rush.timer <= 0) {
      spawnAxeSwing(system, ownerId, player, dir, 104, 28, 520, "Axe Rush Hit");
      effect(system, "spark", to.x, to.y, to.x + dir.x * 34, to.y - 8, colorForAxe(), "Rush Hit");
      sound(system, "axe-impact");
      rushes.delete(ownerId);
    }
  }
}

function updateReturningAxes(system: LooseCombatSystem, players: PlayerPhysicsState[]): void {
  const throws = getThrows(system);
  for (const [ownerId, thrown] of throws) {
    const projectile = (system.projectiles as Projectile[]).find((item) => item.id === thrown.projectileId);
    const player = players.find((item) => item.id === ownerId);
    if (!projectile || !player) {
      throws.delete(ownerId);
      continue;
    }
    if (!thrown.returning) {
      continue;
    }
    const target = centerOfPlayer(player);
    const dir = normalize({ x: target.x - projectile.x, y: target.y - projectile.y });
    projectile.vx = dir.x * recallSpeed;
    projectile.vy = dir.y * recallSpeed;
    projectile.gravity = 0;
    projectile.bounces = 0;
    projectile.pierce = 99;
    projectile.damage = Math.max(projectile.damage, weaponRegistry.get("axe").throw.damage * 2.4);
    projectile.knockback = { x: dir.x * 680, y: dir.y * 480 - 90 };
    projectile.label = "Returning Axe";
    projectile.status = "bleed";
    projectile.lifetime = Math.max(projectile.lifetime, projectile.age + 0.3);
    if (Math.hypot(projectile.x - target.x, projectile.y - target.y) < 34) {
      projectile.age = projectile.lifetime + 1;
      throws.delete(ownerId);
      effect(system, "pickup", target.x, target.y, target.x, target.y - 24, colorForAxe(), "Caught");
      sound(system, "weapon-pickup");
    }
  }
}

function cleanupMissingAxeThrows(system: LooseCombatSystem): void {
  const throws = getThrows(system);
  for (const [ownerId, thrown] of throws) {
    if (!(system.projectiles as Projectile[]).some((projectile) => projectile.id === thrown.projectileId)) {
      throws.delete(ownerId);
    }
  }
}

function spawnAxeSwing(system: LooseCombatSystem, ownerId: string, player: PlayerPhysicsState, dir: Vec2, range: number, damage: number, knockback: number, label: string): void {
  const start = muzzle(system, player);
  const width = range;
  const height = 58;
  const facing = Math.sign(dir.x || player.facing || 1);
  system.hitboxes.push({
    id: makeId(system, "axe-hit"),
    ownerId,
    weaponId: "axe",
    x: facing >= 0 ? start.x : start.x - width,
    y: start.y - height / 2 + dir.y * 22,
    width,
    height,
    damage,
    knockback: { x: facing * knockback, y: dir.y * knockback - 80 },
    stun: 0.28,
    age: 0,
    duration: 0.18,
    label,
    color: colorForAxe(),
    status: "bleed",
    sweetSpot: "tip",
    heavy: true,
    hits: [],
  });
  effect(system, "whip", facing >= 0 ? start.x : start.x - width, start.y, start.x + facing * width, start.y + dir.y * 28, colorForAxe(), label);
}

function findNearestTarget(system: LooseCombatSystem, ownerId: string, player: PlayerPhysicsState, maxDistance: number): LooseCombatant | null {
  const from = centerOfPlayer(player);
  let best: { target: LooseCombatant; distance: number } | null = null;
  for (const target of system.combatants.values() as Iterable<LooseCombatant>) {
    if (target.id === ownerId || target.respawnTimer > 0) {
      continue;
    }
    const to = centerOf(target);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { target, distance };
    }
  }
  return best?.target ?? null;
}

function pushEvent(system: LooseCombatSystem, ownerId: string, action: string, pos: Vec2, aim: Vec2, label: string, now: number): void {
  if (typeof system.createEvent === "function") {
    system.recentEvents.push(system.createEvent(ownerId, "axe", action, pos, aim, label, now));
  }
}

function muzzle(system: LooseCombatSystem, player: PlayerPhysicsState): Vec2 {
  if (typeof system.muzzle === "function") {
    return system.muzzle(player);
  }
  return { x: player.x + player.width / 2 + player.facing * 16, y: player.y + player.height * 0.45 };
}

function effect(system: LooseCombatSystem, kind: string, x: number, y: number, tx: number, ty: number, color: string, label?: string): void {
  if (typeof system.addEffect === "function") {
    system.addEffect(kind, x, y, tx, ty, color, label);
    return;
  }
  system.effects.push({ id: makeId(system, "fx"), kind, x, y, tx, ty, age: 0, duration: 0.35, color, label });
}

function sound(system: LooseCombatSystem, soundId: string): void {
  if (typeof system.queueSound === "function") {
    system.queueSound(soundId);
  } else {
    system.sounds.push(soundId);
  }
}

function makeId(system: LooseCombatSystem, prefix: string): string {
  return typeof system.makeId === "function" ? system.makeId(prefix) : `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function centerOf(target: LooseCombatant): Vec2 {
  return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
}

function centerOfPlayer(player: PlayerPhysicsState): Vec2 {
  return { x: player.x + player.width / 2, y: player.y + player.height / 2 };
}

function normalize(vec: Vec2): Vec2 {
  const length = Math.hypot(vec.x, vec.y) || 1;
  return { x: vec.x / length, y: vec.y / length };
}

function colorForAxe(): string {
  return "#9fe8ff";
}
