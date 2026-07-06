import { DEFAULT_PHYSICS, type PlayerPhysicsState } from "../Physics";
import type { DamageNumber, DamageRequest, DamageResult, Vec2 } from "./Damage";
import type { Hitbox } from "./Hitbox";
import { intersectsRect } from "./Hitbox";
import type { Projectile } from "./Projectile";
import { projectileBounds } from "./Projectile";
import { updateStatusEffects, upsertStatusEffect, type StatusEffect, type StatusEffectId } from "./StatusEffects";
import type { AttackProfile, WeaponId, WeaponInventoryState, WeaponUseContext, WeaponUseResult } from "./Weapon";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "./WeaponRegistry";

export interface Combatant {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  velocityX: number;
  velocityY: number;
  hitstun: number;
  invulnerable: number;
  respawnTimer: number;
  color: string;
  statuses: StatusEffect[];
}

export interface DroppedWeapon {
  id: string;
  weaponId: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  pickupable: boolean;
}

export interface CombatEffect {
  id: string;
  kind: "spark" | "tracer" | "whip" | "laser" | "lightning" | "shockwave" | "teleport" | "dry-fire" | "reload" | "pickup";
  x: number;
  y: number;
  tx: number;
  ty: number;
  age: number;
  duration: number;
  color: string;
  label?: string;
}

export interface CombatSnapshot {
  projectiles: Projectile[];
  hitboxes: Hitbox[];
  combatants: Combatant[];
  droppedWeapons: DroppedWeapon[];
  damageNumbers: DamageNumber[];
  effects: CombatEffect[];
}

export interface CombatEventPacket {
  t: "c";
  id: string;
  ownerId: string;
  weaponId: WeaponId;
  action: "primary" | "secondary" | "throw" | "reload" | "hit" | "equip";
  x: number;
  y: number;
  ax: number;
  ay: number;
  label: string;
  ts: number;
}

interface CombatOptions {
  mode: "offline" | "network";
}

const maxHp = 100;
const respawnDelay = 2;

export class CombatSystem {
  private inventory: WeaponInventoryState = createDefaultInventory();
  private readonly combatants = new Map<string, Combatant>();
  private readonly projectiles: Projectile[] = [];
  private readonly hitboxes: Hitbox[] = [];
  private readonly droppedWeapons: DroppedWeapon[] = [];
  private readonly damageNumbers: DamageNumber[] = [];
  private readonly effects: CombatEffect[] = [];
  private readonly recentEvents: CombatEventPacket[] = [];
  private nextId = 0;

  constructor(_options: CombatOptions) {}

  start(inventory: WeaponInventoryState = createDefaultInventory()): void {
    this.inventory = inventory;
    this.combatants.clear();
    this.projectiles.length = 0;
    this.hitboxes.length = 0;
    this.droppedWeapons.length = 0;
    this.damageNumbers.length = 0;
    this.effects.length = 0;
    this.recentEvents.length = 0;
  }

  syncLocalPlayer(player: PlayerPhysicsState, name: string, color: string): Combatant {
    const existing = this.combatants.get(player.id);
    const next: Combatant = {
      id: player.id,
      name,
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height,
      spawnX: existing?.spawnX ?? player.x,
      spawnY: existing?.spawnY ?? player.y,
      hp: existing?.hp ?? maxHp,
      maxHp,
      velocityX: player.velocityX,
      velocityY: player.velocityY,
      hitstun: existing?.hitstun ?? 0,
      invulnerable: existing?.invulnerable ?? 0,
      respawnTimer: existing?.respawnTimer ?? 0,
      color,
      statuses: existing?.statuses ?? [],
    };
    this.combatants.set(player.id, next);
    return next;
  }

  spawnTrainingDummy(position: { x: number; y: number }): Combatant {
    const dummy: Combatant = {
      id: "training-dummy",
      name: "Training Dummy",
      x: position.x,
      y: position.y,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      spawnX: position.x,
      spawnY: position.y,
      hp: maxHp,
      maxHp,
      velocityX: 0,
      velocityY: 0,
      hitstun: 0,
      invulnerable: 0,
      respawnTimer: 0,
      color: "#ff6f91",
      statuses: [],
    };
    this.combatants.set(dummy.id, dummy);
    return dummy;
  }

  getCombatant(id: string): Combatant | undefined {
    return this.combatants.get(id);
  }

  getPlayerInventory(): WeaponInventoryState {
    return this.inventory;
  }

  equip(indexOrId: number | WeaponId): WeaponId {
    const nextWeapon = typeof indexOrId === "number"
      ? this.inventory.weaponInventory[(indexOrId + this.inventory.weaponInventory.length) % this.inventory.weaponInventory.length]
      : indexOrId;
    this.inventory.equippedWeapon = nextWeapon;
    this.addEffect("pickup", 0, 0, 0, 0, "#ffd84d", weaponRegistry.get(nextWeapon).name);
    this.recentEvents.push(this.createEvent("local", nextWeapon, "equip", { x: 0, y: 0 }, { x: 1, y: 0 }, weaponRegistry.get(nextWeapon).name, 0));
    return nextWeapon;
  }

  cycleWeapon(direction: -1 | 1): WeaponId {
    const index = this.inventory.weaponInventory.indexOf(this.inventory.equippedWeapon);
    return this.equip(index + direction);
  }

  usePrimary(context: WeaponUseContext): WeaponUseResult {
    return this.useAttack(context, "primary");
  }

  useSecondary(context: WeaponUseContext): WeaponUseResult {
    const weapon = weaponRegistry.get(this.inventory.equippedWeapon);
    if (weapon.id === "pistol" || weapon.id === "knife" || weapon.id === "lightning-rod") {
      return this.throwCurrentWeapon(context.ownerId, context.player, context.aim, context.now, weapon.id === "pistol" && this.inventory.ammo.pistol?.magazine === 0);
    }
    if (weapon.id === "teleport-ball") {
      this.addEffect("teleport", context.player.x, context.player.y, context.player.x, context.player.y, "#b096ff", "Cancel");
      return { kind: "utility", weaponId: weapon.id, label: "Cancel teleport" };
    }
    if (weapon.id === "laser-blaster") {
      this.addRadialHitbox(context, weapon.secondary, "Vent");
      return { kind: "hitbox", weaponId: weapon.id, label: "Vent" };
    }
    return this.useAttack(context, "secondary");
  }

  reload(ownerId: string, now: number): WeaponUseResult {
    const weapon = weaponRegistry.get(this.inventory.equippedWeapon);
    const ammo = this.inventory.ammo[weapon.id];
    if (!weapon.ammo || !ammo || ammo.reloadTimer > 0 || ammo.magazine >= weapon.ammo.magazineSize) {
      return { kind: "blocked", weaponId: weapon.id, label: "Reload blocked" };
    }
    ammo.reloadTimer = weapon.ammo.reloadTime;
    ammo.perfectWindow = Math.max(0.16, weapon.ammo.reloadTime * 0.18);
    this.addEffect("reload", 0, 0, 0, 0, "#ffd84d", "Reload");
    this.recentEvents.push(this.createEvent(ownerId, weapon.id, "reload", { x: 0, y: 0 }, { x: 1, y: 0 }, "Reload", now));
    return { kind: "reload-started", weaponId: weapon.id, label: "Reload" };
  }

  dropCurrentWeapon(ownerId: string, player: PlayerPhysicsState, aim: Vec2, now: number): WeaponUseResult {
    return this.throwCurrentWeapon(ownerId, player, aim, now, false);
  }

  pickUpNearest(player: PlayerPhysicsState, maxDistance = 54): WeaponId | null {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    let best: { weapon: DroppedWeapon; distance: number } | null = null;
    for (const dropped of this.droppedWeapons) {
      const distance = Math.hypot(dropped.x - cx, dropped.y - cy);
      if (dropped.pickupable && distance <= maxDistance && (!best || distance < best.distance)) {
        best = { weapon: dropped, distance };
      }
    }
    if (!best) {
      return null;
    }
    this.inventory.equippedWeapon = best.weapon.weaponId;
    const index = this.droppedWeapons.indexOf(best.weapon);
    this.droppedWeapons.splice(index, 1);
    this.addEffect("pickup", best.weapon.x, best.weapon.y, best.weapon.x, best.weapon.y, "#ffd84d", weaponRegistry.get(best.weapon.weaponId).name);
    return best.weapon.weaponId;
  }

  applyDamage(request: DamageRequest): DamageResult {
    const target = this.combatants.get(request.targetId);
    if (!target || target.respawnTimer > 0 || target.invulnerable > 0) {
      return { applied: false, remainingHp: target?.hp ?? 0 };
    }

    target.hp = Math.max(0, target.hp - request.damage);
    target.velocityX += request.knockback.x;
    target.velocityY += request.knockback.y;
    target.hitstun = Math.max(target.hitstun, request.stun);
    target.invulnerable = Math.max(0.24, request.stun * 1.2);
    if (request.status) {
      target.statuses = upsertStatusEffect(target.statuses, createStatus(request.status as StatusEffectId));
    }

    this.damageNumbers.push({
      id: this.makeId("dmg"),
      x: target.x + target.width / 2,
      y: target.y - 10,
      amount: request.damage,
      age: 0,
      label: request.label,
      color: request.damage >= 25 ? "#ffd84d" : "#ffffff",
    });
    this.addEffect("spark", target.x + target.width / 2, target.y + 18, target.x + target.width / 2, target.y + 18, "#ffffff", request.label);

    if (target.hp <= 0) {
      target.respawnTimer = respawnDelay;
      target.hitstun = 0;
      target.invulnerable = respawnDelay;
    }

    return { applied: true, remainingHp: target.hp };
  }

  update(dt: number, players: PlayerPhysicsState[]): void {
    for (const player of players) {
      const combatant = this.combatants.get(player.id);
      if (combatant) {
        combatant.x = player.x;
        combatant.y = player.y;
        combatant.width = player.width;
        combatant.height = player.height;
      }
    }

    this.updateInventory(dt);
    this.updateCombatants(dt);
    this.updateProjectiles(dt);
    this.updateHitboxes(dt);
    this.updateDroppedWeapons(dt);
    this.updateTimedVisuals(dt);
  }

  consumeEvents(): CombatEventPacket[] {
    const events = [...this.recentEvents];
    this.recentEvents.length = 0;
    return events;
  }

  applyRemoteEvent(event: CombatEventPacket): void {
    const weapon = weaponRegistry.get(event.weaponId);
    this.addEffect(event.action === "reload" ? "reload" : weapon.kind === "beam" ? "laser" : weapon.kind === "melee" ? "whip" : "tracer", event.x, event.y, event.x + event.ax * weapon.primary.range, event.y + event.ay * weapon.primary.range, colorForWeapon(event.weaponId), event.label);
  }

  getSnapshot(): CombatSnapshot {
    return {
      projectiles: this.projectiles,
      hitboxes: this.hitboxes,
      combatants: [...this.combatants.values()],
      droppedWeapons: this.droppedWeapons,
      damageNumbers: this.damageNumbers,
      effects: this.effects,
    };
  }

  private useAttack(context: WeaponUseContext, slot: "primary" | "secondary"): WeaponUseResult {
    const weapon = weaponRegistry.get(this.inventory.equippedWeapon);
    const profile = weapon[slot];
    const ammo = this.inventory.ammo[weapon.id];
    if (ammo && ammo.magazine <= 0 && ammo.reloadTimer === 0) {
      this.addEffect("dry-fire", context.player.x + context.player.width / 2, context.player.y + 20, context.player.x + context.player.width / 2 + context.aim.x * 18, context.player.y + 20 + context.aim.y * 18, "#ffffff", "Click");
      return { kind: "dry-fire", weaponId: weapon.id, label: "Dry fire" };
    }
    const cooldown = this.inventory.cooldowns[weapon.id] ?? 0;
    if (cooldown > 0) {
      return { kind: "blocked", weaponId: weapon.id, label: "Cooldown" };
    }
    if (weapon.flags?.tapFire && !context.isNewPress) {
      return { kind: "blocked", weaponId: weapon.id, label: "Tap fire" };
    }
    if (!this.consumeAmmo(weapon.id, profile.pellets ? Math.min(profile.pellets, 3) : undefined)) {
      this.addEffect("dry-fire", context.player.x + context.player.width / 2, context.player.y + 20, context.player.x + context.player.width / 2 + context.aim.x * 18, context.player.y + 20 + context.aim.y * 18, "#ffffff", "Click");
      return { kind: "dry-fire", weaponId: weapon.id, label: "Dry fire" };
    }

    const fast = this.inventory.ammo[weapon.id]?.perfectShots ? 0.68 : 1;
    this.inventory.cooldowns[weapon.id] = profile.cooldown * fast;
    if (this.inventory.ammo[weapon.id]?.perfectShots) {
      this.inventory.ammo[weapon.id]!.perfectShots -= 1;
    }

    if (weapon.kind === "projectile" || weapon.kind === "beam" || weapon.id === "teleport-ball") {
      this.spawnProjectiles(context, profile, slot);
      this.recentEvents.push(this.createEvent(context.ownerId, weapon.id, slot, this.muzzle(context.player), normalize(context.aim), weapon.name, context.now));
      return { kind: "fired", weaponId: weapon.id, label: weapon.name };
    }

    if (weapon.id === "lightning-rod" && slot === "secondary") {
      this.addRadialHitbox(context, profile, "Lightning");
      this.applyDamage({ sourceId: context.ownerId, targetId: context.ownerId, damage: 6, knockback: { x: -context.aim.x * 90, y: -80 }, stun: 0.05, label: "SELF" });
      return { kind: "utility", weaponId: weapon.id, label: "Lightning" };
    }

    this.spawnMeleeHitbox(context, profile, slot === "secondary" ? "Heavy" : weapon.name);
    this.recentEvents.push(this.createEvent(context.ownerId, weapon.id, slot, this.muzzle(context.player), normalize(context.aim), weapon.name, context.now));
    return { kind: "hitbox", weaponId: weapon.id, label: weapon.name };
  }

  private consumeAmmo(weaponId: WeaponId, explicitCost?: number): boolean {
    const ammo = this.inventory.ammo[weaponId];
    if (!ammo) {
      return true;
    }
    if (ammo.reloadTimer > 0) {
      return false;
    }
    const weapon = weaponRegistry.get(weaponId);
    const cost = explicitCost ?? weapon.ammo?.consumePerShot ?? 1;
    if (ammo.magazine < cost) {
      return false;
    }
    ammo.magazine -= cost;
    return true;
  }

  private spawnProjectiles(context: WeaponUseContext, profile: AttackProfile, slot: "primary" | "secondary"): void {
    const weaponId = this.inventory.equippedWeapon;
    const weapon = weaponRegistry.get(weaponId);
    const aim = normalize(context.aim);
    const muzzle = this.muzzle(context.player);
    const pellets = Math.max(1, profile.pellets ?? 1);
    const chargeState = this.inventory.charge[weaponId];
    const chargeMultiplier = chargeState && !chargeState.charging ? 1 + Math.min(chargeState.charge / 6, profile.chargeScale ?? 1) : 1;
    const speedBonus = context.player.sliding ? 1.18 : context.player.action === "lowSlide" ? 1.26 : 1;

    for (let index = 0; index < pellets; index += 1) {
      const spread = pellets === 1 ? 0 : ((index - (pellets - 1) / 2) * (profile.spread ?? 0.14));
      const shot = rotate(aim, spread);
      this.projectiles.push({
        id: this.makeId("proj"),
        ownerId: context.ownerId,
        weaponId,
        x: muzzle.x,
        y: muzzle.y,
        vx: shot.x * (profile.speed ?? 600) * speedBonus,
        vy: shot.y * (profile.speed ?? 600) * speedBonus,
        radius: (profile.radius ?? 5) * Math.min(chargeMultiplier, 2.6),
        damage: Math.round(profile.damage * Math.min(chargeMultiplier, 3)),
        knockback: { x: shot.x * profile.knockback * speedBonus, y: shot.y * profile.knockback - 30 },
        stun: profile.stun,
        age: 0,
        lifetime: profile.range / Math.max(profile.speed ?? 600, 1),
        gravity: profile.gravity ?? 0,
        bounces: profile.bounces ?? 0,
        pierce: profile.pierce ?? 0,
        label: weapon.name,
        color: colorForWeapon(weaponId),
        trailColor: colorForWeapon(weaponId),
        status: profile.status,
        hits: [],
      });
    }

    if (weaponId === "laser-blaster" && chargeState) {
      chargeState.charge = 0;
      chargeState.heat = Math.min(1, chargeState.heat + 0.16);
      chargeState.charging = false;
    }
    if (weaponId === "teleport-ball") {
      this.addEffect("teleport", muzzle.x, muzzle.y, muzzle.x + aim.x * profile.range, muzzle.y + aim.y * profile.range, "#b096ff", "3");
    }
    this.addEffect(weapon.kind === "beam" ? "laser" : "tracer", muzzle.x, muzzle.y, muzzle.x + aim.x * Math.min(profile.range, 220), muzzle.y + aim.y * Math.min(profile.range, 220), colorForWeapon(weaponId), slot);
  }

  private spawnMeleeHitbox(context: WeaponUseContext, profile: AttackProfile, label: string): void {
    const weaponId = this.inventory.equippedWeapon;
    const aim = normalize(context.aim);
    const center = this.muzzle(context.player);
    const width = profile.range;
    const height = Math.max(22, (profile.radius ?? 14) * 2);
    const x = aim.x >= 0 ? center.x : center.x - width;
    const y = center.y - height / 2 + aim.y * 18;
    this.hitboxes.push({
      id: this.makeId("hit"),
      ownerId: context.ownerId,
      weaponId,
      x,
      y,
      width,
      height,
      damage: profile.damage,
      knockback: { x: Math.sign(aim.x || context.player.facing) * profile.knockback, y: aim.y * profile.knockback - 60 },
      stun: profile.stun,
      age: 0,
      duration: Math.max(0.08, profile.cooldown * 0.46),
      label,
      color: colorForWeapon(weaponId),
      pull: weaponId === "whip" ? { x: -Math.sign(aim.x || context.player.facing) * 160, y: -40 } : undefined,
      status: profile.status,
      hits: [],
    });
    this.addEffect(weaponId === "sledgehammer" ? "shockwave" : weaponId === "lightning-rod" ? "lightning" : "whip", x, y, x + width * Math.sign(aim.x || context.player.facing), y, colorForWeapon(weaponId), label);
  }

  private addRadialHitbox(context: WeaponUseContext, profile: AttackProfile, label: string): void {
    const center = this.muzzle(context.player);
    this.hitboxes.push({
      id: this.makeId("hit"),
      ownerId: context.ownerId,
      weaponId: this.inventory.equippedWeapon,
      x: center.x - profile.range / 2,
      y: center.y - profile.range / 2,
      width: profile.range,
      height: profile.range,
      damage: profile.damage,
      knockback: { x: context.aim.x * profile.knockback, y: context.aim.y * profile.knockback - 80 },
      stun: profile.stun,
      age: 0,
      duration: 0.22,
      label,
      color: colorForWeapon(this.inventory.equippedWeapon),
      status: profile.status,
      hits: [],
    });
    this.addEffect(label === "Lightning" ? "lightning" : "shockwave", center.x, center.y, center.x, center.y - profile.range, colorForWeapon(this.inventory.equippedWeapon), label);
  }

  private throwCurrentWeapon(ownerId: string, player: PlayerPhysicsState, aimInput: Vec2, now: number, emptyToss: boolean): WeaponUseResult {
    const weaponId = this.inventory.equippedWeapon;
    const weapon = weaponRegistry.get(weaponId);
    const aim = normalize(aimInput);
    const start = this.muzzle(player);
    this.droppedWeapons.push({
      id: this.makeId("drop"),
      weaponId,
      x: start.x,
      y: start.y,
      vx: aim.x * weapon.throw.speed,
      vy: aim.y * weapon.throw.speed - 80,
      age: 0,
      pickupable: false,
    });
    this.projectiles.push({
      id: this.makeId("throw"),
      ownerId,
      weaponId,
      x: start.x,
      y: start.y,
      vx: aim.x * weapon.throw.speed,
      vy: aim.y * weapon.throw.speed - 80,
      radius: 8,
      damage: emptyToss ? Math.max(3, weapon.throw.damage - 4) : weapon.throw.damage,
      knockback: { x: aim.x * weapon.throw.knockback, y: aim.y * weapon.throw.knockback - 40 },
      stun: emptyToss ? weapon.throw.stun + 0.1 : weapon.throw.stun,
      age: 0,
      lifetime: 0.85,
      gravity: 900,
      bounces: 1,
      pierce: 0,
      label: `${weapon.name} throw`,
      color: colorForWeapon(weaponId),
      trailColor: colorForWeapon(weaponId),
      hits: [],
    });
    this.addEffect("tracer", start.x, start.y, start.x + aim.x * 70, start.y + aim.y * 70, colorForWeapon(weaponId), "Throw");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "throw", start, aim, "Throw", now));
    return { kind: "fired", weaponId, label: "Throw" };
  }

  private updateInventory(dt: number): void {
    for (const id of WEAPON_IDS) {
      this.inventory.cooldowns[id] = Math.max(0, (this.inventory.cooldowns[id] ?? 0) - dt);
      const ammo = this.inventory.ammo[id];
      const weapon = weaponRegistry.get(id);
      if (ammo && weapon.ammo && ammo.reloadTimer > 0) {
        ammo.reloadTimer = Math.max(0, ammo.reloadTimer - dt);
        ammo.perfectWindow = Math.max(0, ammo.perfectWindow - dt);
        if (ammo.reloadTimer === 0) {
          const needed = weapon.ammo.magazineSize - ammo.magazine;
          const loaded = Math.min(needed, ammo.reserve);
          ammo.magazine += loaded;
          ammo.reserve -= loaded;
          if (ammo.perfectWindow > 0) {
            ammo.perfectShots = 3;
          }
          ammo.perfectWindow = 0;
        }
      }
      const charge = this.inventory.charge[id];
      if (charge) {
        charge.heat = Math.max(0, charge.heat - dt * 0.045);
        if (charge.charging) {
          charge.charge += dt * Math.max(0.35, 1 - charge.heat);
          if (charge.charge > charge.maxCharge) {
            charge.charge = 0;
            charge.charging = false;
          }
        }
      }
    }
  }

  private updateCombatants(dt: number): void {
    for (const combatant of this.combatants.values()) {
      if (combatant.respawnTimer > 0) {
        combatant.respawnTimer = Math.max(0, combatant.respawnTimer - dt);
        if (combatant.respawnTimer === 0) {
          combatant.hp = combatant.maxHp;
          combatant.x = combatant.spawnX;
          combatant.y = combatant.spawnY;
          combatant.velocityX = 0;
          combatant.velocityY = 0;
          combatant.statuses = [];
        }
        continue;
      }
      const statusUpdate = updateStatusEffects(combatant.statuses, dt);
      combatant.statuses = statusUpdate.effects;
      if (statusUpdate.damage > 0 && combatant.invulnerable === 0) {
        this.applyDamage({ sourceId: "status", targetId: combatant.id, damage: statusUpdate.damage, knockback: { x: 0, y: 0 }, stun: 0, label: "DOT" });
      }
      combatant.hitstun = Math.max(0, combatant.hitstun - dt);
      combatant.invulnerable = Math.max(0, combatant.invulnerable - dt);
      combatant.x += combatant.velocityX * dt;
      combatant.y += combatant.velocityY * dt;
      combatant.velocityX *= Math.max(0, 1 - dt * 5);
      combatant.velocityY += DEFAULT_PHYSICS.gravity * dt;
      const ground = DEFAULT_PHYSICS.groundY - combatant.height;
      if (combatant.y > ground) {
        combatant.y = ground;
        combatant.velocityY = 0;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.projectiles) {
      projectile.age += dt;
      projectile.vy += projectile.gravity * dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const ground = DEFAULT_PHYSICS.groundY - projectile.radius;
      if (projectile.y > ground && projectile.bounces > 0) {
        projectile.y = ground;
        projectile.vy *= -0.45;
        projectile.vx *= 0.82;
        projectile.bounces -= 1;
      }
      for (const target of this.combatants.values()) {
        if (target.id === projectile.ownerId || projectile.hits.includes(target.id)) {
          continue;
        }
        if (intersectsRect(projectileBounds(projectile), target)) {
          const hit = this.applyDamage({
            sourceId: projectile.ownerId,
            targetId: target.id,
            damage: projectile.damage,
            knockback: projectile.knockback,
            stun: projectile.stun,
            label: projectile.label,
            status: projectile.status,
          });
          if (hit.applied) {
            projectile.hits.push(target.id);
            this.recentEvents.push(this.createEvent(projectile.ownerId, projectile.weaponId, "hit", { x: projectile.x, y: projectile.y }, normalize(projectile.knockback), projectile.label, performanceNow()));
            if (projectile.pierce <= 0) {
              projectile.age = projectile.lifetime + 1;
            } else {
              projectile.pierce -= 1;
            }
          }
        }
      }
    }
    removeWhere(this.projectiles, (projectile) => projectile.age > projectile.lifetime);
  }

  private updateHitboxes(dt: number): void {
    for (const hitbox of this.hitboxes) {
      hitbox.age += dt;
      for (const target of this.combatants.values()) {
        if (target.id === hitbox.ownerId || hitbox.hits.includes(target.id)) {
          continue;
        }
        if (intersectsRect(hitbox, target)) {
          const damage = hitbox.weaponId === "whip" && hitbox.age < 0.1 ? hitbox.damage + 3 : hitbox.damage;
          const hit = this.applyDamage({
            sourceId: hitbox.ownerId,
            targetId: target.id,
            damage,
            knockback: hitbox.pull ?? hitbox.knockback,
            stun: hitbox.stun,
            label: hitbox.label,
            status: hitbox.status,
          });
          if (hit.applied) {
            hitbox.hits.push(target.id);
          }
        }
      }
    }
    removeWhere(this.hitboxes, (hitbox) => hitbox.age > hitbox.duration);
  }

  private updateDroppedWeapons(dt: number): void {
    for (const dropped of this.droppedWeapons) {
      dropped.age += dt;
      dropped.vy += 900 * dt;
      dropped.x += dropped.vx * dt;
      dropped.y += dropped.vy * dt;
      const ground = DEFAULT_PHYSICS.groundY - 8;
      if (dropped.y > ground) {
        dropped.y = ground;
        dropped.vx *= 0.72;
        dropped.vy = 0;
        dropped.pickupable = true;
      }
      if (dropped.age > 0.35) {
        dropped.pickupable = true;
      }
    }
    removeWhere(this.droppedWeapons, (dropped) => dropped.age > 18);
  }

  private updateTimedVisuals(dt: number): void {
    for (const number of this.damageNumbers) {
      number.age += dt;
      number.y -= dt * 34;
    }
    for (const effect of this.effects) {
      effect.age += dt;
    }
    removeWhere(this.damageNumbers, (number) => number.age > 0.8);
    removeWhere(this.effects, (effect) => effect.age > effect.duration);
  }

  private muzzle(player: PlayerPhysicsState): Vec2 {
    return {
      x: player.x + player.width / 2 + player.facing * 18,
      y: player.y + 22,
    };
  }

  private createEvent(ownerId: string, weaponId: WeaponId, action: CombatEventPacket["action"], origin: Vec2, aim: Vec2, label: string, now: number): CombatEventPacket {
    return {
      t: "c",
      id: this.makeId("evt"),
      ownerId,
      weaponId,
      action,
      x: round(origin.x),
      y: round(origin.y),
      ax: round(aim.x),
      ay: round(aim.y),
      label,
      ts: now,
    };
  }

  private addEffect(kind: CombatEffect["kind"], x: number, y: number, tx: number, ty: number, color: string, label?: string): void {
    this.effects.push({
      id: this.makeId("fx"),
      kind,
      x,
      y,
      tx,
      ty,
      age: 0,
      duration: kind === "lightning" ? 0.42 : kind === "shockwave" ? 0.36 : 0.24,
      color,
      label,
    });
  }

  private makeId(prefix: string): string {
    this.nextId += 1;
    return `${prefix}-${this.nextId}`;
  }
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function rotate(vector: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function colorForWeapon(id: WeaponId): string {
  switch (id) {
    case "laser-blaster":
      return "#5ad7ff";
    case "lightning-rod":
      return "#ffd84d";
    case "teleport-ball":
      return "#b096ff";
    case "sledgehammer":
      return "#ff8f3d";
    case "whip":
      return "#f65bd8";
    default:
      return "#ffffff";
  }
}

function createStatus(id: StatusEffectId): StatusEffect {
  switch (id) {
    case "bleed":
      return { id, label: "Bleed", duration: 3, stacks: 1, tickDamage: 1, tickEvery: 0.65 };
    case "shock":
      return { id, label: "Shock", duration: 1.4, stacks: 1 };
    case "suppressed":
      return { id, label: "Suppressed", duration: 1, stacks: 1 };
    case "daze":
      return { id, label: "Dazed", duration: 0.8, stacks: 1 };
    case "tripped":
      return { id, label: "Tripped", duration: 0.7, stacks: 1 };
    case "empowered":
      return { id, label: "Empowered", duration: 5, stacks: 1 };
    case "marked":
      return { id, label: "Marked", duration: 4, stacks: 1 };
  }
}

function removeWhere<T>(items: T[], predicate: (item: T) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      items.splice(index, 1);
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
