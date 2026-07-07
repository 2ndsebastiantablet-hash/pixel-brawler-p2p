import { DEFAULT_PHYSICS, type PlayerPhysicsState } from "../Physics";
import type { DamageNumber, DamageRequest, DamageResult, HitLocation, Vec2 } from "./Damage";
import type { Hitbox } from "./Hitbox";
import { intersectsRect } from "./Hitbox";
import type { Projectile } from "./Projectile";
import { projectileBounds } from "./Projectile";
import { updateStatusEffects, upsertStatusEffect, type StatusEffect, type StatusEffectId } from "./StatusEffects";
import type { AttackProfile, WeaponChargeState, WeaponId, WeaponInventoryState, WeaponUseContext, WeaponUseResult } from "./Weapon";
import { COMBAT_TUNING } from "./CombatTuning";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "./WeaponRegistry";
import type { SoundId } from "../../audio/SoundSystem";

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
  kind:
    | "spark"
    | "tracer"
    | "whip"
    | "whip-pull"
    | "laser"
    | "lightning"
    | "shockwave"
    | "teleport"
    | "dry-fire"
    | "reload"
    | "pickup"
    | "muzzle"
    | "trip"
    | "stomp"
    | "stun"
    | "aura"
    | "slam"
    | "blood";
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
  targetId?: string;
  damage?: number;
  kx?: number;
  ky?: number;
  stun?: number;
  status?: string;
  hitLocation?: HitLocation;
}

interface CombatOptions {
  mode: "offline" | "network";
}

const maxHp = 100;
const respawnDelay = 2;
const teleportDelay = 3;
const whipComboWindow = 0.55;

interface PendingTeleport {
  ownerId: string;
  projectileId: string;
  timer: number;
  pulseTimer: number;
}

interface LightningState {
  chargeTimer: number;
  empoweredTimer: number;
  strain: number;
  pulseTimer: number;
  shockCooldowns: Map<string, number>;
}

export interface WeaponRuntimeState {
  charge: number;
  heat: number;
  spin: number;
  steady: number;
  chamber: number;
  charging: boolean;
  overheated: boolean;
}

export class CombatSystem {
  private inventory: WeaponInventoryState = createDefaultInventory();
  private readonly combatants = new Map<string, Combatant>();
  private readonly projectiles: Projectile[] = [];
  private readonly hitboxes: Hitbox[] = [];
  private readonly droppedWeapons: DroppedWeapon[] = [];
  private readonly damageNumbers: DamageNumber[] = [];
  private readonly effects: CombatEffect[] = [];
  private readonly recentEvents: CombatEventPacket[] = [];
  private readonly appliedRemoteEvents = new Set<string>();
  private readonly sounds: SoundId[] = [];
  private readonly pendingTeleports = new Map<string, PendingTeleport>();
  private readonly lightning = new Map<string, LightningState>();
  private readonly bodyContactCooldowns = new Map<string, number>();
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
    this.appliedRemoteEvents.clear();
    this.sounds.length = 0;
    this.pendingTeleports.clear();
    this.lightning.clear();
    this.bodyContactCooldowns.clear();
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

  syncRemotePlayer(player: {
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    velocityX: number;
    velocityY: number;
    hp?: number;
    statuses?: StatusEffectId[];
    respawnTimer?: number;
  }): Combatant {
    const existing = this.combatants.get(player.id);
    const next: Combatant = {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      width: player.width,
      height: player.height,
      spawnX: existing?.spawnX ?? player.x,
      spawnY: existing?.spawnY ?? player.y,
      hp: player.hp ?? existing?.hp ?? maxHp,
      maxHp,
      velocityX: player.velocityX,
      velocityY: player.velocityY,
      hitstun: existing?.hitstun ?? 0,
      invulnerable: existing?.invulnerable ?? 0,
      respawnTimer: player.respawnTimer ?? existing?.respawnTimer ?? 0,
      color: player.color,
      statuses: player.statuses ? player.statuses.map((status) => createStatus(status)) : existing?.statuses ?? [],
    };
    this.combatants.set(player.id, next);
    return next;
  }

  removeCombatant(id: string): void {
    this.combatants.delete(id);
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
    this.queueSound("weapon-switch");
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
    if (weapon.id === "pistol" || weapon.id === "knife") {
      return this.throwCurrentWeapon(context.ownerId, context.player, context.aim, context.now, weapon.id === "pistol" && this.inventory.ammo.pistol?.magazine === 0);
    }
    if (weapon.id === "teleport-ball") {
      return this.cancelTeleport(context.ownerId, context.player, context.now);
    }
    if (weapon.id === "lightning-rod") {
      return this.startLightningCall(context);
    }
    if (weapon.id === "laser-blaster") {
      const charge = this.inventory.charge[weapon.id];
      if (charge) {
        charge.heat = Math.max(0, charge.heat - COMBAT_TUNING.laser.ventCooling);
        charge.charge = Math.max(0, charge.charge - 3);
        charge.charging = false;
      }
      this.applySelfRecoil(context.player, context.aim, 95, 35);
      this.addRadialHitbox(context, weapon.secondary, "Vent");
      this.queueSound("laser-vent");
      return { kind: "hitbox", weaponId: weapon.id, label: "Vent" };
    }
    if (weapon.id === "minigun") {
      const charge = this.inventory.charge[weapon.id];
      if (charge) {
        charge.charging = true;
        charge.heat = Math.max(0, charge.heat - 0.015);
      }
      this.queueSound("minigun-spin");
      return { kind: "utility", weaponId: weapon.id, label: "Pre-spin" };
    }
    if (weapon.id === "sniper") {
      const charge = this.inventory.charge[weapon.id];
      if (charge) {
        charge.charging = true;
        charge.heat = 0;
      }
      context.player.velocityX = 0;
      context.player.velocityY = 0;
      this.applySteadyStatus(context.ownerId);
      this.queueSound("sniper-steady");
      return { kind: "utility", weaponId: weapon.id, label: "Steady aim" };
    }
    return this.useAttack(context, "secondary");
  }

  reload(ownerId: string, now: number): WeaponUseResult {
    const weapon = weaponRegistry.get(this.inventory.equippedWeapon);
    const ammo = this.inventory.ammo[weapon.id];
    if (!weapon.ammo || !ammo) {
      return { kind: "blocked", weaponId: weapon.id, label: "Reload blocked" };
    }
    if (ammo.reloadTimer > 0) {
      if (ammo.perfectWindow > 0 && !ammo.perfectQueued) {
        ammo.perfectQueued = true;
        this.addEffect("reload", 0, 0, 0, 0, "#7cff6b", "Perfect");
        this.queueSound("pistol-perfect");
        return { kind: "utility", weaponId: weapon.id, label: "Perfect reload" };
      }
      return { kind: "blocked", weaponId: weapon.id, label: "Reload blocked" };
    }
    if (ammo.magazine >= weapon.ammo.magazineSize) {
      return { kind: "blocked", weaponId: weapon.id, label: "Reload blocked" };
    }
    ammo.reloadTimer = weapon.ammo.reloadTime;
    ammo.perfectWindow = 0;
    ammo.perfectQueued = false;
    this.addEffect("reload", 0, 0, 0, 0, "#ffd84d", "Reload");
    this.queueSound("pistol-reload-start");
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
    return this.collectDroppedWeapon(best.weapon);
  }

  applyDamage(request: DamageRequest): DamageResult {
    const target = this.combatants.get(request.targetId);
    if (!target || target.respawnTimer > 0 || target.invulnerable > 0) {
      return { applied: false, remainingHp: target?.hp ?? 0 };
    }

    const hitLocation = request.hitLocation ?? classifyHitLocation(target, request.hitY);
    const locationModifier = request.skipHitLocationScaling ? neutralLocationModifier : modifierForHitLocation(hitLocation);
    const effectiveStun = request.stun + locationModifier.stunBonus;
    const finalStatus = statusForHit(request.weaponId, hitLocation, request.status);
    const finalLabel = hitLocation ? `${labelForHitLocation(hitLocation)} ${request.label}` : request.label;
    const steadyResist = target.statuses.some((status) => status.id === "steady") && request.sourceId !== target.id;
    const damageScale = steadyResist ? COMBAT_TUNING.sniper.steadyDamageResistance : 1;
    const knockbackScale = request.label === "DOT" ? 1 : COMBAT_TUNING.enemyKnockbackMultiplier * (steadyResist ? 0.25 : 1) * locationModifier.knockbackScale;
    const verticalLift = request.damage >= 20 ? -26 : effectiveStun >= 0.3 ? -16 : 0;
    const damage = Math.max(1, Math.round(request.damage * damageScale * locationModifier.damageScale));
    target.hp = Math.max(0, target.hp - damage);
    target.velocityX += request.knockback.x * knockbackScale;
    target.velocityY += request.knockback.y * knockbackScale * locationModifier.verticalScale + verticalLift * locationModifier.verticalScale;
    target.hitstun = Math.max(target.hitstun, effectiveStun * (request.label === "DOT" ? 1 : 1.08));
    target.invulnerable = Math.max(0.24, effectiveStun * 1.2);
    if (finalStatus) {
      target.statuses = upsertStatusEffect(target.statuses, createStatus(finalStatus as StatusEffectId));
    }
    this.queueSound("player-hit");
    this.queueSound("damage-pop");
    if (request.damage >= 24 || Math.abs(request.knockback.x) + Math.abs(request.knockback.y) >= 560) {
      this.queueSound("player-stunned");
    }
    if (finalStatus === "tripped" || finalStatus === "daze") {
      this.queueSound("player-stunned");
      this.addEffect("stun", target.x + target.width / 2, target.y + 12, target.x + target.width / 2, target.y + 12, "#ffd84d", finalStatus === "tripped" ? "Trip" : "Stun");
    }
    if (finalStatus === "shock") {
      this.queueSound("lightning-shock");
    }
    if (hitLocation === "head" || hitLocation === "leg" || finalStatus === "bleed") {
      const bloodY = typeof request.hitY === "number" ? request.hitY : target.y + target.height / 2;
      this.addEffect("blood", target.x + target.width / 2, bloodY, target.x + target.width / 2 + Math.sign(request.knockback.x || 1) * 28, bloodY + 10, "#c71943", labelForHitLocation(hitLocation));
    }

    this.damageNumbers.push({
      id: this.makeId("dmg"),
      x: target.x + target.width / 2,
      y: target.y - 10,
      amount: damage,
      age: 0,
      label: finalLabel,
      color: hitLocation === "head" ? "#ffd84d" : hitLocation === "leg" ? "#7cff6b" : request.damage >= 25 ? "#ffd84d" : "#ffffff",
      hitLocation,
    });
    this.addEffect("spark", target.x + target.width / 2, target.y + 18, target.x + target.width / 2, target.y + 18, "#ffffff", finalLabel);
    if (request.emitEvent !== false && request.sourceId !== "status") {
      this.recentEvents.push(this.createEvent(
        request.sourceId,
        request.weaponId ?? this.inventory.equippedWeapon,
        "hit",
        { x: target.x + target.width / 2, y: target.y + target.height / 2 },
        normalize(request.knockback),
        request.label,
        performanceNow(),
        {
          targetId: target.id,
          damage,
          kx: request.knockback.x,
          ky: request.knockback.y,
          stun: effectiveStun,
          status: finalStatus,
          hitLocation,
        },
      ));
    }

    if (target.hp <= 0) {
      target.respawnTimer = respawnDelay;
      target.hitstun = 0;
      target.invulnerable = respawnDelay;
      this.queueSound("respawn");
    }

    return { applied: true, remainingHp: target.hp, hitLocation };
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
    this.updateTeleports(dt, players);
    this.updateHitboxes(dt);
    this.updateLightning(dt, players);
    this.updateBodyContact(dt, players);
    this.updateDroppedWeapons(dt);
    this.updateTimedVisuals(dt);
    this.updateContactCooldowns(dt);
  }

  consumeEvents(): CombatEventPacket[] {
    const events = [...this.recentEvents];
    this.recentEvents.length = 0;
    return events;
  }

  consumeSounds(): SoundId[] {
    const events = [...this.sounds];
    this.sounds.length = 0;
    return events;
  }

  getTeleportState(ownerId: string): { pending: boolean; timer: number } {
    const pending = this.pendingTeleports.get(ownerId);
    return { pending: Boolean(pending), timer: pending?.timer ?? 0 };
  }

  getLightningState(ownerId: string): { charging: boolean; chargeTimer: number; empoweredTimer: number; strain: number } {
    const state = this.lightning.get(ownerId);
    return {
      charging: Boolean(state && state.chargeTimer > 0),
      chargeTimer: state?.chargeTimer ?? 0,
      empoweredTimer: state?.empoweredTimer ?? 0,
      strain: state?.strain ?? 0,
    };
  }

  getWeaponRuntimeState(id: WeaponId = this.inventory.equippedWeapon): WeaponRuntimeState {
    const charge = this.inventory.charge[id];
    const heat = charge?.heat ?? 0;
    return {
      charge: charge?.charge ?? 0,
      heat,
      spin: id === "minigun" ? charge?.charge ?? 0 : 0,
      steady: id === "sniper" ? charge?.charge ?? 0 : 0,
      chamber: this.inventory.cooldowns[id] ?? 0,
      charging: charge?.charging ?? false,
      overheated: heat >= (id === "laser-blaster" ? COMBAT_TUNING.laser.overheatThreshold : 0.95),
    };
  }

  triggerLaserOvercharge(ownerId: string, player: PlayerPhysicsState, now: number): WeaponUseResult {
    const weaponId: WeaponId = "laser-blaster";
    const charge = this.inventory.charge[weaponId];
    if (!charge || charge.heat >= 0.98 || charge.charge < charge.maxCharge) {
      return { kind: "blocked", weaponId, label: "Overcharge blocked" };
    }
    charge.charge = 0;
    charge.charging = false;
    charge.heat = 1;
    this.inventory.cooldowns[weaponId] = 0.85;
    const center = this.muzzle(player);
    this.addEffect("shockwave", center.x, center.y, center.x, center.y - 120, colorForWeapon(weaponId), "Overcharge");
    this.addEffect("spark", center.x - 18, center.y + 10, center.x - 58, center.y - 20, "#ff6f91", "Heat");
    this.addEffect("spark", center.x + 18, center.y + 10, center.x + 58, center.y - 24, "#ffd84d", "Blast");
    this.applyBurstDamage(ownerId, center.x, center.y, COMBAT_TUNING.laser.overchargeRadius, COMBAT_TUNING.laser.overchargeDamage, 520, 0.42, "Overcharge", "shockwave");
    const owner = this.combatants.get(ownerId);
    if (owner) {
      const previousInvulnerable = owner.invulnerable;
      owner.invulnerable = 0;
      this.applyDamage({
        sourceId: ownerId,
        targetId: ownerId,
        damage: 8,
        knockback: { x: -player.facing * 160, y: -180 },
        stun: 0.22,
        label: "OVERCHARGE",
        status: "daze",
      });
      owner.invulnerable = Math.max(owner.invulnerable, previousInvulnerable);
    }
    this.queueSound("laser-overcharge");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "secondary", center, { x: 0, y: -1 }, "Overcharge", now));
    return { kind: "utility", weaponId, label: "Overcharge" };
  }

  applyRemoteEvent(event: CombatEventPacket): void {
    const weapon = weaponRegistry.get(event.weaponId);
    if (event.action === "hit" && event.targetId && typeof event.damage === "number" && !this.appliedRemoteEvents.has(event.id)) {
      const target = this.combatants.get(event.targetId);
      if (target) {
        this.appliedRemoteEvents.add(event.id);
        const previousInvulnerable = target.invulnerable;
        target.invulnerable = 0;
        const hit = this.applyDamage({
          sourceId: event.ownerId,
          targetId: event.targetId,
          damage: event.damage,
          knockback: { x: event.kx ?? event.ax * 220, y: event.ky ?? event.ay * 160 },
          stun: event.stun ?? 0.2,
          label: event.label,
          status: event.status,
          weaponId: event.weaponId,
          hitLocation: event.hitLocation,
          skipHitLocationScaling: true,
          emitEvent: false,
        });
        if (!hit.applied) {
          target.invulnerable = previousInvulnerable;
        }
      }
    }
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
    const ammo = this.inventory.ammo[weapon.id];
    const ammoBefore = ammo?.magazine ?? Number.POSITIVE_INFINITY;
    if (ammo && ammo.magazine <= 0 && ammo.reloadTimer === 0) {
      this.addEffect("dry-fire", context.player.x + context.player.width / 2, context.player.y + 20, context.player.x + context.player.width / 2 + context.aim.x * 18, context.player.y + 20 + context.aim.y * 18, "#ffffff", "Click");
      this.queueSound(dryFireSoundFor(weapon.id));
      return { kind: "dry-fire", weaponId: weapon.id, label: "Dry fire" };
    }
    const cooldown = this.inventory.cooldowns[weapon.id] ?? 0;
    if (cooldown > 0) {
      return { kind: "blocked", weaponId: weapon.id, label: "Cooldown" };
    }
    if (weapon.flags?.tapFire && !context.isNewPress) {
      return { kind: "blocked", weaponId: weapon.id, label: "Tap fire" };
    }
    if (weapon.id === "minigun" && slot === "primary") {
      const spinResult = this.prepareMinigunPrimary(context);
      if (spinResult) {
        return spinResult;
      }
    }

    const profile = this.getRuntimeAttackProfile(weapon.id, slot, weapon[slot], context, ammoBefore);
    if (!this.consumeAmmo(weapon.id, this.ammoCostForAttack(weapon.id, slot, profile, ammoBefore))) {
      this.addEffect("dry-fire", context.player.x + context.player.width / 2, context.player.y + 20, context.player.x + context.player.width / 2 + context.aim.x * 18, context.player.y + 20 + context.aim.y * 18, "#ffffff", "Click");
      this.queueSound(dryFireSoundFor(weapon.id));
      return { kind: "dry-fire", weaponId: weapon.id, label: "Dry fire" };
    }

    const fast = this.inventory.ammo[weapon.id]?.perfectShots ? 0.68 : 1;
    const chargedProfile = weapon.id === "sledgehammer" ? this.getSledgeProfile(profile, context) : profile;
    this.inventory.cooldowns[weapon.id] = chargedProfile.cooldown * fast;
    if (this.inventory.ammo[weapon.id]?.perfectShots) {
      this.inventory.ammo[weapon.id]!.perfectShots -= 1;
    }

    if (weapon.kind === "projectile" || weapon.kind === "beam" || weapon.id === "teleport-ball") {
      this.spawnProjectiles(context, chargedProfile, slot);
      if (weapon.id === "pistol") {
        this.applyPistolRecoil(context.player, context.aim);
        const muzzle = this.muzzle(context.player);
        this.addEffect("muzzle", muzzle.x, muzzle.y, muzzle.x + context.aim.x * 24, muzzle.y + context.aim.y * 24, "#fff4a8", "Bang");
      }
      this.applyProjectileWeaponFeedback(weapon.id, slot, context, ammoBefore);
      this.recentEvents.push(this.createEvent(context.ownerId, weapon.id, slot, this.muzzle(context.player), normalize(context.aim), weapon.name, context.now));
      return { kind: "fired", weaponId: weapon.id, label: weapon.name };
    }

    if (weapon.id === "whip") {
      if (!context.player.grounded) {
        context.player.velocityY = Math.min(context.player.velocityY, 80);
        context.player.velocityX += normalize(context.aim).x * 45;
      }
      this.queueSound("whip-swing");
    }
    if (weapon.id === "lightning-rod") {
      this.queueSound("lightning-shock");
    }
    if (weapon.id === "sledgehammer") {
      this.queueSound(context.heldMs >= 650 ? "sledge-slam" : "sledge-swing");
    }
    if (weapon.id === "knife") {
      this.queueSound(this.peekKnifeComboStep() === 3 ? "knife-stab" : "knife-slash");
    }

    this.spawnMeleeHitbox(context, chargedProfile, slot === "secondary" ? "Heavy" : weapon.name);
    if (weapon.id === "sledgehammer" && context.heldMs >= 650) {
      this.addRadialHitbox(context, {
        ...chargedProfile,
        damage: Math.round(chargedProfile.damage * 0.86),
        range: COMBAT_TUNING.sledgehammer.shockwaveRadius,
        knockback: chargedProfile.knockback * 0.86,
        stun: Math.max(chargedProfile.stun, 0.62),
      }, "Charged Slam");
    }
    this.recentEvents.push(this.createEvent(context.ownerId, weapon.id, slot, this.muzzle(context.player), normalize(context.aim), weapon.name, context.now));
    return { kind: "hitbox", weaponId: weapon.id, label: weapon.name };
  }

  private prepareMinigunPrimary(context: WeaponUseContext): WeaponUseResult | null {
    const weaponId: WeaponId = "minigun";
    const charge = this.inventory.charge[weaponId];
    if (!charge) {
      return null;
    }
    charge.charging = true;
    if (charge.heat >= 0.98) {
      charge.charge = Math.max(0, charge.charge - 0.08);
      this.inventory.cooldowns[weaponId] = Math.max(this.inventory.cooldowns[weaponId] ?? 0, 0.24);
      this.addEffect("shockwave", context.player.x + context.player.width / 2, context.player.y + 24, context.player.x + context.player.width / 2, context.player.y - 20, colorForWeapon(weaponId), "Overheat");
      this.queueSound("minigun-overheat");
      return { kind: "blocked", weaponId, label: "Overheated" };
    }
    if (charge.charge < 1) {
      charge.charge = Math.min(charge.maxCharge, charge.charge + 0.02);
      this.queueSound("minigun-spin");
      return { kind: "utility", weaponId, label: "Spinning" };
    }
    return null;
  }

  private getRuntimeAttackProfile(
    weaponId: WeaponId,
    slot: "primary" | "secondary",
    profile: AttackProfile,
    context: WeaponUseContext,
    ammoBefore: number,
  ): AttackProfile {
    if (weaponId === "slingshot") {
      if (slot === "primary") {
        const charge = Math.min(Math.max(context.heldMs / 850, 0), 1);
        return {
          ...profile,
          damage: Math.round(profile.damage * (1 + charge * 0.55)),
          speed: Math.min(1400, (profile.speed ?? 1280) * (1 + charge * 0.08)),
          knockback: profile.knockback * (1 + charge * 0.42),
          stun: profile.stun + charge * 0.08,
          radius: (profile.radius ?? 5) + charge,
          bounces: COMBAT_TUNING.projectiles.slingshotBounces,
        };
      }
      return {
        ...profile,
        bounces: COMBAT_TUNING.projectiles.slingshotBounces,
        knockback: profile.knockback * 1.18,
      };
    }

    if (weaponId === "laser-blaster") {
      const state = this.inventory.charge[weaponId];
      const charge = state?.charge ?? 0;
      const overheated = (state?.heat ?? 0) >= COMBAT_TUNING.laser.overheatThreshold;
      const chargeRatio = overheated ? Math.min(charge / (state?.maxCharge ?? 80), 1) * 0.2 : Math.min(charge / (state?.maxCharge ?? 80), 1);
      const weakScale = overheated ? 0.65 : 1;
      return {
        ...profile,
        damage: Math.max(1, Math.round(profile.damage * weakScale * (1 + chargeRatio * COMBAT_TUNING.laser.chargeDamageScale))),
        range: (profile.range + chargeRatio * COMBAT_TUNING.laser.chargeLengthScale) * (overheated ? 0.62 : 1),
        knockback: profile.knockback * weakScale * (1 + chargeRatio * 0.95),
        stun: profile.stun + chargeRatio * 0.08,
        radius: (profile.radius ?? 6) + chargeRatio * COMBAT_TUNING.laser.chargeWidthScale,
        pierce: (profile.pierce ?? 0) + (chargeRatio >= 0.35 ? 1 : 0) + (chargeRatio >= 0.7 ? 1 : 0),
      };
    }

    if (weaponId === "revolver") {
      if (slot === "secondary") {
        const bullets = Number.isFinite(ammoBefore) ? Math.min(Math.max(1, ammoBefore), 6) : profile.pellets ?? 3;
        return {
          ...profile,
          pellets: Math.max(2, Math.min(6, bullets)),
          spread: 0.13 + Math.min(bullets, 6) * 0.025,
          knockback: profile.knockback * 1.18,
          bounces: context.player.ducking || context.player.action === "duck" || context.player.lowSliding ? COMBAT_TUNING.projectiles.revolverRicochetBounces : profile.bounces,
        };
      }
      if (ammoBefore === 1) {
        return {
          ...profile,
          damage: Math.round(profile.damage * 1.8),
          knockback: profile.knockback * 1.68,
          stun: profile.stun + 0.13,
          pierce: (profile.pierce ?? 0) + 1,
        };
      }
    }

    if (weaponId === "minigun") {
      const heat = this.inventory.charge[weaponId]?.heat ?? 0;
      return {
        ...profile,
        spread: (profile.spread ?? 0.12) + heat * 0.12,
        knockback: profile.knockback * (1 + heat * 0.25),
      };
    }

    if (weaponId === "sniper") {
      const steady = this.inventory.charge[weaponId]?.charge ?? 0;
      return {
        ...profile,
        damage: profile.damage + Math.round(steady * 18),
        knockback: profile.knockback * (1 + steady * 0.22),
        stun: profile.stun + steady * 0.1,
        radius: (profile.radius ?? 3) + steady * 2,
        pierce: (profile.pierce ?? 0) + (steady > 0.85 ? 1 : 0),
        status: steady > 0.85 ? "marked" : profile.status,
      };
    }

    if (weaponId === "knife" && slot === "primary") {
      const step = this.peekKnifeComboStep();
      const dashStab = context.player.sliding || context.player.lowSliding || context.player.action === "slide" || context.player.action === "lowSlide";
      const airSlash = !context.player.grounded;
      if (airSlash) {
        context.player.velocityY = Math.min(context.player.velocityY, 55);
      }
      return {
        ...profile,
        damage: step === 3 ? profile.damage + 6 : profile.damage,
        range: profile.range + (dashStab ? 22 : 0) + (airSlash ? 8 : 0),
        knockback: profile.knockback * (step === 3 ? 1.55 : dashStab ? 1.32 : 1),
        stun: profile.stun + (step === 3 ? 0.16 : dashStab ? 0.05 : 0),
      };
    }

    return profile;
  }

  private ammoCostForAttack(weaponId: WeaponId, slot: "primary" | "secondary", profile: AttackProfile, ammoBefore: number): number | undefined {
    if (weaponId === "revolver" && slot === "secondary") {
      return Number.isFinite(ammoBefore) ? Math.min(Math.max(1, ammoBefore), profile.pellets ?? 1) : profile.pellets;
    }
    if (profile.pellets) {
      return Math.min(profile.pellets, weaponId === "minigun" ? 1 : 6);
    }
    return undefined;
  }

  private applyProjectileWeaponFeedback(weaponId: WeaponId, slot: "primary" | "secondary", context: WeaponUseContext, ammoBefore: number): void {
    const aim = normalize(context.aim);
    const charge = this.inventory.charge[weaponId];
    switch (weaponId) {
      case "pistol":
        this.queueSound("pistol-shot");
        break;
      case "teleport-ball":
        this.queueSound("teleport-throw");
        break;
      case "slingshot":
        this.queueSound(slot === "secondary" ? "slingshot-scatter" : "slingshot-shot");
        break;
      case "laser-blaster":
        {
          const ratio = Math.min((charge?.charge ?? 0) / (charge?.maxCharge ?? 80), 1);
          this.applySelfRecoil(context.player, aim, 88 + ratio * 190, 48 + ratio * 95);
        }
        this.queueSound("laser-fire");
        break;
      case "revolver":
        this.queueSound(slot === "secondary" ? "revolver-fan" : ammoBefore === 1 ? "revolver-last" : "revolver-shot");
        this.applySelfRecoil(context.player, aim, slot === "secondary" ? 120 + Math.min(ammoBefore, 6) * 8 : ammoBefore === 1 ? 190 : 96, slot === "secondary" ? 34 : ammoBefore === 1 ? 48 : 28);
        break;
      case "minigun":
        if (charge) {
          charge.heat = Math.min(1, charge.heat + COMBAT_TUNING.minigun.heatPerShot);
          charge.charging = true;
        }
        this.applySelfRecoil(context.player, aim, 34, 8);
        this.queueSound("minigun-fire");
        break;
      case "sniper":
        {
          const steady = charge?.charge ?? 0;
        if (charge) {
          charge.charge = 0;
          charge.charging = false;
          charge.heat = 0.18;
        }
        this.clearStatus(context.ownerId, "steady");
        this.addEffect("aura", context.player.x + context.player.width / 2, context.player.y + 12, context.player.x + context.player.width / 2, context.player.y - 32, colorForWeapon(weaponId), "Reveal");
        this.queueSound("sniper-reveal");
        this.applySelfRecoil(context.player, aim, steady > 0.95 ? 130 : 210, 82);
        this.queueSound("sniper-shot");
        this.queueSound("sniper-chamber");
        break;
        }
      default:
        this.queueSound("weapon-drop");
        break;
    }
  }

  private cancelTeleport(ownerId: string, player: PlayerPhysicsState, now: number): WeaponUseResult {
    const weaponId = "teleport-ball";
    const cooldown = this.inventory.cooldowns[weaponId] ?? 0;
    if (cooldown > 0) {
      return { kind: "blocked", weaponId, label: "Cancel cooldown" };
    }
    const pending = this.pendingTeleports.get(ownerId);
    if (!pending) {
      this.addEffect("teleport", player.x + player.width / 2, player.y + 20, player.x + player.width / 2, player.y + 20, "#b096ff", "No marker");
      return { kind: "blocked", weaponId, label: "No teleport" };
    }
    removeWhere(this.projectiles, (projectile) => projectile.id === pending.projectileId);
    this.pendingTeleports.delete(ownerId);
    this.inventory.cooldowns[weaponId] = 0.55;
    this.addEffect("teleport", player.x + player.width / 2, player.y + 20, player.x + player.width / 2, player.y + 20, "#b096ff", "Cancel");
    this.queueSound("teleport-cancel");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "secondary", this.muzzle(player), { x: 0, y: -1 }, "Cancel", now));
    return { kind: "utility", weaponId, label: "Cancel teleport" };
  }

  private startLightningCall(context: WeaponUseContext): WeaponUseResult {
    const weaponId = "lightning-rod";
    const existing = this.lightning.get(context.ownerId) ?? {
      chargeTimer: 0,
      empoweredTimer: 0,
      strain: 0,
      pulseTimer: 0,
      shockCooldowns: new Map<string, number>(),
    };
    if (existing.chargeTimer > 0) {
      return { kind: "blocked", weaponId, label: "Calling lightning" };
    }
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Lightning cooldown" };
    }
    existing.chargeTimer = 0.68;
    existing.strain = Math.min(1.2, existing.strain + 0.38);
    this.lightning.set(context.ownerId, existing);
    this.inventory.cooldowns[weaponId] = 1.05;
    this.addEffect("aura", context.player.x + context.player.width / 2, context.player.y, context.player.x + context.player.width / 2, context.player.y - 120, "#ffd84d", "Raise");
    this.queueSound("lightning-raise");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "secondary", this.muzzle(context.player), normalize(context.aim), "Raise", context.now));
    return { kind: "utility", weaponId, label: "Raise rod" };
  }

  private resolveLightningStrike(ownerId: string, state: LightningState): void {
    const owner = this.combatants.get(ownerId);
    if (!owner) {
      return;
    }
    const previousInvulnerable = owner.invulnerable;
    owner.invulnerable = 0;
    this.applyDamage({
      sourceId: ownerId,
      targetId: ownerId,
      damage: 5 + Math.round(state.strain * 3),
      knockback: { x: 0, y: -140 },
      stun: state.strain > 0.95 ? 0.35 : 0.05,
      label: "SELF STRIKE",
      status: "empowered",
    });
    owner.invulnerable = Math.max(owner.invulnerable, previousInvulnerable);
    owner.statuses = upsertStatusEffect(owner.statuses, { id: "empowered", label: "Empowered", duration: 5.8, stacks: 1 });
    if (state.strain > 1) {
      owner.statuses = upsertStatusEffect(owner.statuses, { id: "daze", label: "Strained", duration: 0.55, stacks: 1 });
      owner.hitstun = Math.max(owner.hitstun, 0.55);
    }
    state.empoweredTimer = 5.8;
    state.pulseTimer = 0;
    this.addEffect("lightning", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y - 170, "#ffd84d", "Strike");
    this.queueSound("lightning-strike");
    for (const target of this.combatants.values()) {
      if (target.id === ownerId || !intersectsRect(owner, target)) {
        continue;
      }
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: ownerId,
        targetId: target.id,
        damage: 7,
        knockback: { x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * 160, y: -120 },
        stun: 0.24,
        label: "Shock",
        status: "shock",
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
      }
      state.shockCooldowns.set(target.id, 0.55);
    }
  }

  private getSledgeProfile(profile: AttackProfile, context: WeaponUseContext): AttackProfile {
    const charge = Math.min(Math.max(context.heldMs / 900, 0), 1);
    const airDrop = !context.player.grounded;
    if (airDrop) {
      context.player.velocityY = Math.max(context.player.velocityY, 760);
    }
    if (charge <= 0.1 && !airDrop) {
      return profile;
    }
    return {
      ...profile,
      damage: Math.round(profile.damage * (1 + charge * 0.75 + (airDrop ? 0.18 : 0))),
      knockback: profile.knockback * (1 + charge * 0.55),
      stun: profile.stun + charge * 0.18,
      range: profile.range + charge * 34,
      cooldown: profile.cooldown + charge * 0.34,
    };
  }

  private applyPistolRecoil(player: PlayerPhysicsState, aimInput: Vec2): void {
    this.applySelfRecoil(player, aimInput, 118, 42);
  }

  private applySelfRecoil(player: PlayerPhysicsState, aimInput: Vec2, horizontal: number, vertical: number): void {
    const aim = normalize(aimInput);
    const airScale = player.grounded ? 1 : 1.55;
    const scale = COMBAT_TUNING.selfRecoilMultiplier * airScale;
    player.velocityX -= aim.x * horizontal * scale;
    player.velocityY -= Math.max(0.35, aim.y) * vertical * scale;
    if (!player.grounded) {
      player.velocityY -= vertical * 0.65;
    }
  }

  private applySteadyStatus(ownerId: string): void {
    const owner = this.combatants.get(ownerId);
    if (!owner) {
      return;
    }
    owner.statuses = upsertStatusEffect(owner.statuses, { id: "steady", label: "Steady", duration: COMBAT_TUNING.sniper.invisibilitySeconds, stacks: 1 });
    owner.invulnerable = Math.max(owner.invulnerable, 0.08);
    this.addEffect("aura", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y - 32, colorForWeapon("sniper"), "Vanish");
  }

  private clearStatus(targetId: string, id: StatusEffectId): void {
    const target = this.combatants.get(targetId);
    if (!target) {
      return;
    }
    target.statuses = target.statuses.filter((status) => status.id !== id);
  }

  private collectDroppedWeapon(dropped: DroppedWeapon): WeaponId {
    this.inventory.equippedWeapon = dropped.weaponId;
    const index = this.droppedWeapons.indexOf(dropped);
    if (index >= 0) {
      this.droppedWeapons.splice(index, 1);
    }
    this.addEffect("pickup", dropped.x, dropped.y, dropped.x, dropped.y - 34, "#ffd84d", weaponRegistry.get(dropped.weaponId).name);
    this.addEffect("tracer", dropped.x, dropped.y, dropped.x, dropped.y - 18, colorForWeapon(dropped.weaponId), "Snap");
    this.queueSound("weapon-pickup");
    if (dropped.weaponId === "knife") {
      this.queueSound("knife-pickup");
    }
    return dropped.weaponId;
  }

  private pickUpDroppedWeaponsInHitbox(hitbox: Hitbox): void {
    for (const dropped of [...this.droppedWeapons]) {
      if (!dropped.pickupable) {
        continue;
      }
      const bounds = { x: dropped.x - 10, y: dropped.y - 10, width: 20, height: 20 };
      if (intersectsRect(hitbox, bounds)) {
        this.collectDroppedWeapon(dropped);
        this.addEffect("whip-pull", hitbox.x, hitbox.y + hitbox.height / 2, dropped.x, dropped.y, colorForWeapon(hitbox.weaponId), "Pickup");
      }
    }
  }

  private registerWhipHit(targetId: string): { count: number; pulled: boolean } {
    const combo = this.inventory.combo.whip ?? { timer: 0, count: 0 };
    const count = combo.targetId === targetId && combo.timer > 0 ? combo.count + 1 : 1;
    this.inventory.combo.whip = {
      targetId,
      timer: whipComboWindow,
      count,
    };
    return { count, pulled: count >= 2 };
  }

  private peekKnifeComboStep(): number {
    const combo = this.inventory.combo.knife;
    return combo && combo.timer > 0 ? (combo.count % 3) + 1 : 1;
  }

  private registerKnifeSwing(): number {
    const step = this.peekKnifeComboStep();
    this.inventory.combo.knife = {
      timer: 0.62,
      count: step,
    };
    return step;
  }

  private applyBurstDamage(
    sourceId: string,
    x: number,
    y: number,
    radius: number,
    damage: number,
    knockback: number,
    stun: number,
    label: string,
    effect: CombatEffect["kind"],
  ): void {
    for (const target of this.combatants.values()) {
      if (target.id === sourceId || target.respawnTimer > 0) {
        continue;
      }
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height / 2;
      const distance = Math.hypot(tx - x, ty - y);
      if (distance > radius) {
        continue;
      }
      const direction = normalize({ x: tx - x || 1, y: ty - y || -0.2 });
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId,
        targetId: target.id,
        damage,
        knockback: { x: direction.x * knockback, y: -Math.abs(direction.y * knockback) - 120 },
        stun,
        label,
        status: stun >= 0.35 ? "daze" : undefined,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
      }
    }
    this.addEffect(effect, x, y, x, y, effect === "teleport" ? "#b096ff" : "#ff8f3d", label);
  }

  private applyBodyHit(
    sourceId: string,
    target: Combatant,
    kind: string,
    request: {
      damage: number;
      knockback: Vec2;
      stun: number;
      label: string;
      status?: StatusEffectId;
      sound: SoundId;
      effect: CombatEffect["kind"];
    },
  ): boolean {
    const key = `${sourceId}:${target.id}:${kind}`;
    if (this.bodyContactCooldowns.has(key)) {
      return false;
    }
    const previousInvulnerable = target.invulnerable;
    target.invulnerable = 0;
    const hit = this.applyDamage({
      sourceId,
      targetId: target.id,
      damage: request.damage,
      knockback: request.knockback,
      stun: request.stun,
      label: request.label,
      status: request.status,
    });
    if (!hit.applied) {
      target.invulnerable = previousInvulnerable;
      return false;
    }
    this.bodyContactCooldowns.set(key, kind === "stomp" ? COMBAT_TUNING.headStomp.cooldown : kind.includes("slam") ? 0.45 : 0.32);
    this.addEffect(request.effect, target.x + target.width / 2, target.y + target.height / 2, target.x + target.width / 2, target.y, request.effect === "trip" ? "#7cff6b" : "#ffd84d", request.label);
    this.queueSound(request.sound);
    return true;
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
    const chargeMultiplier = 1;
    const speedBonus = context.player.sliding ? 1.18 : context.player.action === "lowSlide" ? 1.26 : 1;

    for (let index = 0; index < pellets; index += 1) {
      const spread = pellets === 1 ? 0 : ((index - (pellets - 1) / 2) * (profile.spread ?? 0.14));
      const shot = rotate(aim, spread);
      const projectileId = this.makeId("proj");
      this.projectiles.push({
        id: projectileId,
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
        lifetime: weaponId === "teleport-ball" ? teleportDelay + 0.35 : profile.range / Math.max(profile.speed ?? 600, 1),
        gravity: profile.gravity ?? 0,
        bounces: profile.bounces ?? 0,
        pierce: profile.pierce ?? 0,
        label: projectileLabelFor(weaponId, slot),
        color: colorForWeapon(weaponId),
        trailColor: colorForWeapon(weaponId),
        originX: muzzle.x,
        originY: muzzle.y,
        teleportsOwner: weaponId === "teleport-ball",
        pulseTimer: 0,
        status: profile.status,
        hits: [],
      });
      if (weaponId === "teleport-ball") {
        this.pendingTeleports.set(context.ownerId, {
          ownerId: context.ownerId,
          projectileId,
          timer: teleportDelay,
          pulseTimer: 0.35,
        });
      }
    }

    if (weaponId === "laser-blaster" && chargeState) {
      const wasOverheated = chargeState.heat >= COMBAT_TUNING.laser.overheatThreshold;
      chargeState.charge = 0;
      chargeState.heat = wasOverheated ? 0.72 : Math.min(1, chargeState.heat + COMBAT_TUNING.laser.heatPerShot);
      chargeState.charging = false;
    }
    if (weaponId === "teleport-ball") {
      this.addEffect("teleport", muzzle.x, muzzle.y, muzzle.x + aim.x * profile.range, muzzle.y + aim.y * profile.range, "#b096ff", "3.0");
    }
    this.addEffect(weapon.kind === "beam" ? "laser" : "tracer", muzzle.x, muzzle.y, muzzle.x + aim.x * Math.min(profile.range, 220), muzzle.y + aim.y * Math.min(profile.range, 220), colorForWeapon(weaponId), slot);
  }

  private spawnMeleeHitbox(context: WeaponUseContext, profile: AttackProfile, label: string): void {
    const weaponId = this.inventory.equippedWeapon;
    const aim = normalize(context.aim);
    const center = this.muzzle(context.player);
    const isWhip = weaponId === "whip";
    const isKnife = weaponId === "knife";
    const isHammer = weaponId === "sledgehammer";
    const knifeStep = isKnife ? this.registerKnifeSwing() : 0;
    const lowTrip = isWhip && (context.player.ducking || context.player.lowSliding || context.player.action === "duck" || context.player.action === "lowSlide");
    const width = isKnife ? profile.range + (knifeStep === 3 ? 10 : 0) : profile.range;
    const height = isWhip ? Math.max(32, (profile.radius ?? 14) * 2.4) : isKnife ? Math.max(24, (profile.radius ?? 14) * 2.2) : Math.max(22, (profile.radius ?? 14) * 2);
    const x = aim.x >= 0 ? center.x : center.x - width;
    const y = lowTrip ? center.y + 18 : center.y - height / 2 + aim.y * (isWhip ? 44 : 18);
    const hitLabel = isKnife ? (knifeStep === 3 ? "Knife Stab" : "Knife Slash") : lowTrip ? "Low Whip" : label;
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
      label: hitLabel,
      color: colorForWeapon(weaponId),
      status: lowTrip ? "tripped" : profile.status,
      sweetSpot: isWhip ? "tip" : undefined,
      lowTrip,
      heavy: isHammer,
      hits: [],
    });
    this.addEffect(weaponId === "sledgehammer" ? "slam" : weaponId === "lightning-rod" ? "lightning" : "whip", x, y, x + width * Math.sign(aim.x || context.player.facing), y, colorForWeapon(weaponId), hitLabel);
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
    if (weaponId !== "knife") {
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
    }
    this.projectiles.push({
      id: this.makeId("throw"),
      ownerId,
      weaponId,
      x: start.x,
      y: start.y,
      vx: aim.x * weapon.throw.speed,
      vy: aim.y * weapon.throw.speed - 80,
      radius: weaponId === "knife" ? 6 : 8,
      damage: emptyToss ? Math.max(3, weapon.throw.damage - 4) : weapon.throw.damage,
      knockback: { x: aim.x * weapon.throw.knockback, y: aim.y * weapon.throw.knockback - 40 },
      stun: emptyToss ? weapon.throw.stun + 0.1 : weapon.throw.stun,
      age: 0,
      lifetime: weaponId === "knife" ? 0.95 : 0.85,
      gravity: weaponId === "knife" ? 760 : 900,
      bounces: weaponId === "knife" ? 0 : 1,
      pierce: 0,
      label: `${weapon.name} throw`,
      color: colorForWeapon(weaponId),
      trailColor: colorForWeapon(weaponId),
      hits: [],
    });
    this.addEffect("tracer", start.x, start.y, start.x + aim.x * 70, start.y + aim.y * 70, colorForWeapon(weaponId), "Throw");
    this.queueSound(weaponId === "pistol" ? "pistol-throw" : weaponId === "knife" ? "knife-throw" : "weapon-drop");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "throw", start, aim, "Throw", now));
    return { kind: "fired", weaponId, label: "Throw" };
  }

  private stickThrownKnife(projectile: Projectile): void {
    const existing = this.droppedWeapons.find((dropped) => dropped.weaponId === "knife" && Math.hypot(dropped.x - projectile.x, dropped.y - projectile.y) < 16);
    if (existing) {
      existing.x = projectile.x;
      existing.y = projectile.y;
      existing.vx = 0;
      existing.vy = 0;
      existing.pickupable = true;
      return;
    }
    this.droppedWeapons.push({
      id: this.makeId("drop"),
      weaponId: "knife",
      x: projectile.x,
      y: projectile.y,
      vx: 0,
      vy: 0,
      age: 0.3,
      pickupable: true,
    });
    this.addEffect("spark", projectile.x, projectile.y, projectile.x, projectile.y - 18, colorForWeapon("knife"), "Stick");
  }

  private updateInventory(dt: number): void {
    for (const id of WEAPON_IDS) {
      this.inventory.cooldowns[id] = Math.max(0, (this.inventory.cooldowns[id] ?? 0) - dt);
      const ammo = this.inventory.ammo[id];
      const weapon = weaponRegistry.get(id);
      if (ammo && weapon.ammo && ammo.reloadTimer > 0) {
        ammo.reloadTimer = Math.max(0, ammo.reloadTimer - dt);
        ammo.perfectWindow = ammo.reloadTimer > 0.08 && ammo.reloadTimer <= 0.28 ? ammo.reloadTimer : 0;
        if (ammo.reloadTimer === 0) {
          const needed = weapon.ammo.magazineSize - ammo.magazine;
          const loaded = Math.min(needed, ammo.reserve);
          ammo.magazine += loaded;
          ammo.reserve -= loaded;
          if (ammo.perfectQueued) {
            ammo.perfectShots = 3;
            this.queueSound("pistol-perfect");
          } else {
            this.queueSound("pistol-reload-end");
          }
          ammo.perfectWindow = 0;
          ammo.perfectQueued = false;
        }
      }
      const charge = this.inventory.charge[id];
      if (charge) {
        this.updateWeaponCharge(id, charge, dt);
      }
      const combo = this.inventory.combo[id];
      if (combo) {
        combo.timer = Math.max(0, combo.timer - dt);
        if (combo.timer === 0) {
          combo.targetId = undefined;
          combo.count = 0;
        }
      }
    }
  }

  private updateWeaponCharge(id: WeaponId, charge: WeaponChargeState, dt: number): void {
    if (id === "laser-blaster") {
      charge.heat = Math.max(0, charge.heat - dt * 0.06);
      if (charge.charging) {
        charge.charge = Math.min(charge.maxCharge, charge.charge + dt * 10.5 * Math.max(0.24, 1 - charge.heat * 0.6));
        if (charge.charge > 1 && charge.charge < charge.maxCharge) {
          this.queueSound("laser-charge");
        }
      }
      return;
    }

    if (id === "minigun") {
      if (charge.charging) {
        charge.charge = Math.min(charge.maxCharge, charge.charge + dt / COMBAT_TUNING.minigun.spinUpSeconds);
      } else {
        charge.charge = Math.max(0, charge.charge - dt * 0.08);
      }
      charge.heat = Math.max(0, charge.heat - dt * (charge.charging ? 0.04 : 0.18));
      if (charge.heat >= 1) {
        charge.charge = Math.max(0, charge.charge - dt * 0.9);
      }
      charge.charging = false;
      return;
    }

    if (id === "sniper") {
      if (charge.charging) {
        charge.charge = Math.min(charge.maxCharge, charge.charge + dt / COMBAT_TUNING.sniper.steadySeconds);
      } else {
        charge.charge = Math.max(0, charge.charge - dt * 0.12);
      }
      charge.heat = Math.max(0, charge.heat - dt * 0.12);
      charge.charging = false;
      return;
    }

    charge.heat = Math.max(0, charge.heat - dt * 0.045);
    if (charge.charging) {
      charge.charge += dt * Math.max(0.35, 1 - charge.heat);
      if (charge.charge > charge.maxCharge) {
        charge.charge = charge.maxCharge;
        charge.charging = false;
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
      const hadSteady = combatant.statuses.some((status) => status.id === "steady");
      const statusUpdate = updateStatusEffects(combatant.statuses, dt);
      combatant.statuses = statusUpdate.effects;
      if (hadSteady && !combatant.statuses.some((status) => status.id === "steady")) {
        this.addEffect("aura", combatant.x + combatant.width / 2, combatant.y + 16, combatant.x + combatant.width / 2, combatant.y - 28, colorForWeapon("sniper"), "Reveal");
        this.queueSound("sniper-reveal");
      }
      if (combatant.statuses.some((status) => status.id === "shock")) {
        this.addEffect("aura", combatant.x + combatant.width / 2, combatant.y + combatant.height / 2, combatant.x + combatant.width / 2, combatant.y - 16, "#c8c4a8", "Shock Aura");
        this.addEffect("spark", combatant.x + combatant.width / 2, combatant.y + 16, combatant.x + combatant.width / 2 + Math.sin(performanceNow() * 0.02) * 18, combatant.y - 8, "#ffd84d", "Spark");
      }
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
      const ground = COMBAT_TUNING.projectiles.floorY - projectile.radius;
      if (projectile.y > ground) {
        projectile.y = ground;
        if (projectile.weaponId === "lightning-rod" && projectile.id.startsWith("throw")) {
          this.addEffect("lightning", projectile.x, projectile.y, projectile.x, projectile.y - 140, "#ffd84d", "Rod Strike");
          this.applyBurstDamage(projectile.ownerId, projectile.x, projectile.y, 105, 10, 230, 0.26, "Rod Strike", "lightning");
          this.queueSound("lightning-strike");
          projectile.age = projectile.lifetime + 1;
          continue;
        }
        if (projectile.bounces > 0) {
          projectile.vy *= COMBAT_TUNING.projectiles.bounceVelocityMultiplier;
          projectile.vx *= COMBAT_TUNING.projectiles.bounceFriction;
          projectile.bounces -= 1;
          if (projectile.weaponId === "slingshot" || projectile.weaponId === "revolver") {
            projectile.damage = Math.max(1, Math.round(projectile.damage * 0.8));
            this.addEffect("spark", projectile.x, projectile.y, projectile.x + projectile.vx * 0.04, projectile.y - 12, colorForWeapon(projectile.weaponId), projectile.weaponId === "revolver" ? "Ricochet" : "Bounce");
            this.queueSound(projectile.weaponId === "slingshot" ? "slingshot-bounce" : "revolver-shot");
          }
        } else if (projectile.weaponId === "knife" && projectile.id.startsWith("throw")) {
          this.stickThrownKnife(projectile);
          projectile.age = projectile.lifetime + 1;
          continue;
        } else if (projectile.weaponId === "teleport-ball") {
          projectile.vx = 0;
          projectile.vy = 0;
          projectile.gravity = 0;
        } else {
          this.addEffect("spark", projectile.x, projectile.y, projectile.x, projectile.y - 16, colorForWeapon(projectile.weaponId), "Impact");
          projectile.age = projectile.lifetime + 1;
          continue;
        }
      }
      for (const target of this.combatants.values()) {
        if (target.id === projectile.ownerId || projectile.hits.includes(target.id)) {
          continue;
        }
        if (intersectsRect(projectileBounds(projectile), target)) {
          const closePistolShot = projectile.weaponId === "pistol" && projectile.age < 0.13;
          const hitLocation = classifyHitLocation(target, projectile.y);
          const sniperLegShot = projectile.weaponId === "sniper" && hitLocation === "leg";
          const knockback = closePistolShot
            ? { x: projectile.knockback.x * 1.55, y: projectile.knockback.y - 35 }
            : projectile.knockback;
          const hit = this.applyDamage({
            sourceId: projectile.ownerId,
            targetId: target.id,
            damage: projectile.damage,
            knockback,
            stun: closePistolShot ? projectile.stun + 0.04 : projectile.stun,
            label: projectile.label,
            status: projectile.weaponId === "lightning-rod" ? "shock" : sniperLegShot ? "legShotSlow" : projectile.status,
            weaponId: projectile.weaponId,
            hitY: projectile.y,
            hitLocation,
          });
          if (hit.applied) {
            projectile.hits.push(target.id);
            if (sniperLegShot) {
              target.statuses = upsertStatusEffect(target.statuses, createStatus("legShotSlow"));
              this.addEffect("blood", projectile.x, projectile.y, projectile.x + normalize(projectile.knockback).x * 28, projectile.y + 12, "#c71943", "Leg Shot");
              this.queueSound("player-hit");
            }
            if (projectile.weaponId === "teleport-ball") {
              const pending = this.pendingTeleports.get(projectile.ownerId);
              if (pending?.projectileId === projectile.id) {
                pending.timer = Math.max(0.35, pending.timer - 0.75);
                this.addEffect("teleport", projectile.x, projectile.y, projectile.x, projectile.y, "#b096ff", "Fast");
                this.queueSound("teleport-pulse");
              }
            }
            if (projectile.weaponId === "lightning-rod") {
              this.addEffect("lightning", projectile.x, projectile.y, projectile.x, projectile.y - 110, "#ffd84d", "Rod");
              this.queueSound("lightning-strike");
            }
            if (projectile.weaponId === "laser-blaster") {
              this.addEffect("laser", projectile.originX ?? projectile.x, projectile.originY ?? projectile.y, projectile.x, projectile.y, colorForWeapon(projectile.weaponId), "Burn");
            }
            if (projectile.weaponId === "revolver" || projectile.weaponId === "sniper") {
              this.addEffect("muzzle", projectile.x, projectile.y, projectile.x + normalize(projectile.knockback).x * 24, projectile.y, colorForWeapon(projectile.weaponId), projectile.weaponId === "sniper" ? "Mark" : "Hit");
            }
            if (projectile.weaponId === "minigun") {
              this.addEffect("spark", projectile.x, projectile.y, projectile.x, projectile.y, colorForWeapon(projectile.weaponId), "Suppress");
            }
            if (projectile.weaponId === "knife" && projectile.id.startsWith("throw")) {
              this.stickThrownKnife(projectile);
              this.queueSound("knife-hit");
            }
            if (projectile.weaponId === "teleport-ball") {
              continue;
            } else if (projectile.weaponId === "knife" && projectile.id.startsWith("throw")) {
              projectile.age = projectile.lifetime + 1;
            } else if (projectile.pierce <= 0) {
              projectile.age = projectile.lifetime + 1;
            } else {
              projectile.pierce -= 1;
            }
          }
        }
      }
    }
    const xLimit = 2400 + COMBAT_TUNING.projectiles.cleanupPadding;
    removeWhere(this.projectiles, (projectile) => projectile.age > projectile.lifetime
      || projectile.y > COMBAT_TUNING.projectiles.floorY + COMBAT_TUNING.projectiles.cleanupPadding
      || projectile.x < -xLimit
      || projectile.x > xLimit);
  }

  private updateHitboxes(dt: number): void {
    for (const hitbox of this.hitboxes) {
      hitbox.age += dt;
      if (hitbox.weaponId === "whip") {
        this.pickUpDroppedWeaponsInHitbox(hitbox);
      }
      for (const target of this.combatants.values()) {
        if (target.id === hitbox.ownerId || hitbox.hits.includes(target.id)) {
          continue;
        }
        if (intersectsRect(hitbox, target)) {
          const owner = this.combatants.get(hitbox.ownerId);
          const whipHit = hitbox.weaponId === "whip";
          const rodHit = hitbox.weaponId === "lightning-rod";
          const knifeHit = hitbox.weaponId === "knife";
          const tipHit = whipHit && isWhipTipHit(hitbox, target);
          const combo = whipHit ? this.registerWhipHit(target.id) : { count: 0, pulled: false };
          const rodEmpowered = rodHit && owner?.statuses.some((status) => status.id === "empowered");
          const backstab = knifeHit && owner ? isBackstab(owner, target, hitbox.knockback.x) : false;
          const pull = whipHit && combo.pulled && owner
            ? {
                x: Math.sign((owner.x + owner.width / 2) - (target.x + target.width / 2)) * 380,
                y: -135,
              }
            : undefined;
          const damage = whipHit && tipHit ? hitbox.damage + 4 : rodEmpowered ? hitbox.damage + 6 : knifeHit && backstab ? hitbox.damage + 5 : hitbox.damage;
          const stun = whipHit && tipHit ? hitbox.stun + 0.14 : rodEmpowered ? hitbox.stun + 0.12 : knifeHit && backstab ? hitbox.stun + 0.08 : hitbox.lowTrip ? Math.max(hitbox.stun, 0.32) : hitbox.stun;
          const hitY = clamp(hitbox.y + hitbox.height / 2, target.y, target.y + target.height - 1);
          const hit = this.applyDamage({
            sourceId: hitbox.ownerId,
            targetId: target.id,
            damage,
            knockback: pull ?? (rodHit ? { x: hitbox.knockback.x * 1.28, y: hitbox.knockback.y - 75 } : hitbox.knockback),
            stun,
            label: combo.pulled ? "Whip Pull" : tipHit ? "Tip Crack" : rodHit ? "Electrocute" : knifeHit && backstab ? `${hitbox.label} Backstab` : hitbox.label,
            status: rodHit ? "shock" : hitbox.lowTrip ? "tripped" : hitbox.status,
            weaponId: hitbox.weaponId,
            hitY,
          });
          if (hit.applied) {
            hitbox.hits.push(target.id);
            if (whipHit) {
              this.queueSound(combo.pulled ? "whip-pull" : "whip-crack");
              this.addEffect(combo.pulled ? "whip-pull" : "whip", hitbox.x, hitbox.y, target.x + target.width / 2, target.y + target.height / 2, colorForWeapon(hitbox.weaponId), combo.pulled ? "Pull" : tipHit ? "Crack" : "Hit");
            }
            if (hitbox.weaponId === "sledgehammer") {
              this.queueSound("sledge-impact");
            }
            if (knifeHit) {
              this.queueSound("knife-hit");
              this.addEffect("spark", target.x + target.width / 2, hitY, target.x + target.width / 2 + Math.sign(hitbox.knockback.x || 1) * 18, hitY, colorForWeapon(hitbox.weaponId), backstab ? "Backstab" : "Cut");
            }
            if (rodHit) {
              this.queueSound("lightning-shock");
              this.addEffect("lightning", target.x + target.width / 2, target.y + target.height / 2, target.x + target.width / 2, target.y - 80, colorForWeapon(hitbox.weaponId), "Zap");
            }
          }
        }
      }
    }
    removeWhere(this.hitboxes, (hitbox) => hitbox.age > hitbox.duration);
  }

  private updateTeleports(dt: number, players: PlayerPhysicsState[]): void {
    for (const pending of this.pendingTeleports.values()) {
      pending.timer = Math.max(0, pending.timer - dt);
      pending.pulseTimer -= dt;
      const projectile = this.projectiles.find((item) => item.id === pending.projectileId);
      if (!projectile) {
        this.pendingTeleports.delete(pending.ownerId);
        continue;
      }
      if (pending.pulseTimer <= 0) {
        pending.pulseTimer = 0.5;
        projectile.pulseTimer = (projectile.pulseTimer ?? 0) + 1;
        this.addEffect("teleport", projectile.x, projectile.y, projectile.x, projectile.y, "#b096ff", pending.timer.toFixed(1));
        this.queueSound("teleport-pulse");
      }
      if (pending.timer > 0) {
        continue;
      }

      const player = players.find((item) => item.id === pending.ownerId);
      const owner = this.combatants.get(pending.ownerId);
      const landingX = projectile.x - (player?.width ?? owner?.width ?? DEFAULT_PHYSICS.width) / 2;
      const landingY = Math.min(projectile.y - (player?.height ?? owner?.height ?? DEFAULT_PHYSICS.height), DEFAULT_PHYSICS.groundY - (player?.height ?? owner?.height ?? DEFAULT_PHYSICS.height));
      if (player) {
        player.x = landingX;
        player.y = landingY;
        player.velocityX = projectile.vx * 0.28;
        player.velocityY = Math.min(projectile.vy * 0.18, -180);
        player.grounded = false;
        player.groundSlamming = false;
        player.airDiving = false;
      }
      if (owner) {
        owner.x = landingX;
        owner.y = landingY;
        owner.velocityX = projectile.vx * 0.28;
        owner.velocityY = Math.min(projectile.vy * 0.18, -180);
      }
      this.addEffect("teleport", projectile.x, projectile.y, projectile.x, projectile.y, "#b096ff", "Arrival");
      this.queueSound("teleport-arrival");
      this.applyBurstDamage(pending.ownerId, projectile.x, projectile.y, 96, 8, 245, 0.18, "Teleport Burst", "teleport");
      removeWhere(this.projectiles, (item) => item.id === pending.projectileId);
      this.pendingTeleports.delete(pending.ownerId);
    }
  }

  private updateLightning(dt: number, players: PlayerPhysicsState[]): void {
    for (const [ownerId, state] of this.lightning.entries()) {
      state.strain = Math.max(0, state.strain - dt * 0.22);
      state.pulseTimer = Math.max(0, state.pulseTimer - dt);
      for (const [targetId, timer] of state.shockCooldowns.entries()) {
        const next = Math.max(0, timer - dt);
        if (next === 0) {
          state.shockCooldowns.delete(targetId);
        } else {
          state.shockCooldowns.set(targetId, next);
        }
      }

      if (state.chargeTimer > 0) {
        state.chargeTimer = Math.max(0, state.chargeTimer - dt);
        const owner = this.combatants.get(ownerId);
        if (owner) {
          this.addEffect("aura", owner.x + owner.width / 2, owner.y + 8, owner.x + owner.width / 2, owner.y - 110, "#ffd84d", "Raise");
        }
        if (state.chargeTimer === 0) {
          this.resolveLightningStrike(ownerId, state);
        }
      }

      const owner = this.combatants.get(ownerId);
      const player = players.find((item) => item.id === ownerId);
      if (!owner || !owner.statuses.some((status) => status.id === "empowered")) {
        continue;
      }
      state.empoweredTimer = Math.max(0, state.empoweredTimer - dt);
      if (player) {
        player.velocityX *= player.grounded ? 1.012 : 1.006;
      }
      if (state.pulseTimer === 0) {
        state.pulseTimer = 0.34;
        this.addEffect("aura", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y - 20, "#ffd84d", "Zap");
        this.queueSound("lightning-pulse");
      }
      for (const target of this.combatants.values()) {
        if (target.id === ownerId || target.respawnTimer > 0 || !intersectsRect(owner, target) || state.shockCooldowns.has(target.id)) {
          continue;
        }
        const previousInvulnerable = target.invulnerable;
        target.invulnerable = 0;
        const hit = this.applyDamage({
          sourceId: ownerId,
          targetId: target.id,
          damage: 7,
          knockback: { x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * 160, y: -120 },
          stun: 0.24,
          label: "Shock",
          status: "shock",
        });
        if (!hit.applied) {
          target.invulnerable = previousInvulnerable;
        }
        state.shockCooldowns.set(target.id, 0.55);
      }
    }
  }

  private updateBodyContact(_dt: number, players: PlayerPhysicsState[]): void {
    for (const player of players) {
      const owner = this.combatants.get(player.id);
      if (!owner) {
        continue;
      }
      for (const target of this.combatants.values()) {
        if (target.id === player.id || target.respawnTimer > 0) {
          continue;
        }

        if ((player.sliding || player.action === "slide" || player.action === "lowSlide") && intersectsRect(owner, target)) {
          const low = player.lowSliding || player.action === "lowSlide";
          this.applyBodyHit(player.id, target, low ? "low-slide" : "slide", {
            damage: low ? 11 : 7,
            knockback: { x: player.facing * (low ? 610 : 390), y: low ? COMBAT_TUNING.lowSlideTripPopUpForce : COMBAT_TUNING.slideTripPopUpForce },
            stun: low ? 0.72 : 0.48,
            label: low ? "Low Slide Trip" : "Slide Trip",
            status: "tripped",
            sound: low ? "low-slide" : "player-stunned",
            effect: "trip",
          });
        }

        const playerBottom = owner.y + owner.height;
        const horizontalOverlap = owner.x < target.x + target.width && owner.x + owner.width > target.x;
        const stompWindow = horizontalOverlap && player.velocityY > 180 && playerBottom >= target.y && playerBottom <= target.y + 28 && owner.y < target.y;
        if (stompWindow) {
          const hit = this.applyBodyHit(player.id, target, "stomp", {
            damage: COMBAT_TUNING.headStomp.damage,
            knockback: { x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * 110, y: COMBAT_TUNING.headStomp.targetKnockdownForce },
            stun: 0.34,
            label: "Head Stomp",
            status: "daze",
            sound: "head-stomp",
            effect: "stomp",
          });
          if (hit) {
            player.velocityY = COMBAT_TUNING.headStomp.bounceForce;
            player.jumpsUsed = 1;
            player.airDiveUsed = false;
            player.grounded = false;
            owner.velocityY = COMBAT_TUNING.headStomp.bounceForce;
          }
        }

        if ((player.airDiving || player.action === "airDive") && intersectsRect(owner, target)) {
          this.applyBodyHit(player.id, target, "air-dive", {
            damage: 12,
            knockback: { x: player.facing * 380, y: -130 },
            stun: COMBAT_TUNING.diveHitStunDuration,
            label: "Dive Hit",
            status: "daze",
            sound: "dive-hit",
            effect: "spark",
          });
        }

        if (player.groundSlamming && intersectsRect(owner, target)) {
          this.applyBodyHit(player.id, target, "ground-slam-body", {
            damage: 15,
            knockback: { x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * 210, y: -280 },
            stun: 0.48,
            label: "Ground Slam",
            status: "daze",
            sound: "ground-slam-impact",
            effect: "slam",
          });
        }

        if (player.justSlamLanded) {
          const centerX = owner.x + owner.width / 2;
          const targetX = target.x + target.width / 2;
          if (Math.abs(targetX - centerX) <= COMBAT_TUNING.groundSlam.radius && Math.abs((target.y + target.height) - DEFAULT_PHYSICS.groundY) <= 90) {
            this.applyBodyHit(player.id, target, "ground-slam-wave", {
              damage: COMBAT_TUNING.groundSlam.damage,
              knockback: { x: Math.sign(targetX - centerX || 1) * COMBAT_TUNING.groundSlam.knockback, y: -320 },
              stun: COMBAT_TUNING.groundSlam.stun,
              label: "Slam Wave",
              status: "daze",
              sound: "ground-slam-impact",
              effect: "shockwave",
            });
          }
        }
      }
    }
  }

  private updateContactCooldowns(dt: number): void {
    for (const [key, value] of this.bodyContactCooldowns.entries()) {
      const next = Math.max(0, value - dt);
      if (next === 0) {
        this.bodyContactCooldowns.delete(key);
      } else {
        this.bodyContactCooldowns.set(key, next);
      }
    }
  }

  private updateDroppedWeapons(dt: number): void {
    for (const dropped of this.droppedWeapons) {
      dropped.age += dt;
      if (dropped.weaponId === "knife" && dropped.pickupable && dropped.vx === 0 && dropped.vy === 0 && dropped.age < 0.75) {
        continue;
      }
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

  private createEvent(
    ownerId: string,
    weaponId: WeaponId,
    action: CombatEventPacket["action"],
    origin: Vec2,
    aim: Vec2,
    label: string,
    now: number,
    extra: Partial<Pick<CombatEventPacket, "targetId" | "damage" | "kx" | "ky" | "stun" | "status" | "hitLocation">> = {},
  ): CombatEventPacket {
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
      ...extra,
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

  private queueSound(id: SoundId): void {
    this.sounds.push(id);
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

function isWhipTipHit(hitbox: Hitbox, target: Combatant): boolean {
  const targetCenter = target.x + target.width / 2;
  if (hitbox.width <= 0) {
    return false;
  }
  const leftEdge = hitbox.x;
  const rightEdge = hitbox.x + hitbox.width;
  const tipStart = hitbox.knockback.x >= 0 ? rightEdge - 56 : leftEdge + 56;
  return hitbox.knockback.x >= 0 ? targetCenter >= tipStart : targetCenter <= tipStart;
}

const neutralLocationModifier = {
  damageScale: 1,
  knockbackScale: 1,
  verticalScale: 1,
  stunBonus: 0,
};

function classifyHitLocation(target: Combatant, hitY?: number): HitLocation | undefined {
  if (typeof hitY !== "number") {
    return undefined;
  }
  const ratio = clamp((hitY - target.y) / Math.max(target.height, 1), 0, 1);
  if (ratio <= 0.25) {
    return "head";
  }
  if (ratio >= 0.7) {
    return "leg";
  }
  return "body";
}

function modifierForHitLocation(location?: HitLocation): typeof neutralLocationModifier {
  switch (location) {
    case "head":
      return { damageScale: 1.8, knockbackScale: 1.28, verticalScale: 1.18, stunBonus: 0.14 };
    case "leg":
      return { damageScale: 0.65, knockbackScale: 0.72, verticalScale: 0.42, stunBonus: 0 };
    case "body":
    default:
      return neutralLocationModifier;
  }
}

function labelForHitLocation(location?: HitLocation): string {
  switch (location) {
    case "head":
      return "HEAD";
    case "leg":
      return "LEG";
    case "body":
      return "BODY";
    default:
      return "HIT";
  }
}

function statusForHit(weaponId: WeaponId | undefined, location: HitLocation | undefined, status: string | undefined): string | undefined {
  if (location !== "leg") {
    return status;
  }
  if (weaponId === "sniper") {
    return "legShotSlow";
  }
  if (weaponId === "minigun") {
    return "suppressed";
  }
  return status ?? "legStagger";
}

function isBackstab(owner: Combatant, target: Combatant, attackDirection: number): boolean {
  const direction = Math.sign(attackDirection || target.x - owner.x || 1);
  const ownerCenter = owner.x + owner.width / 2;
  const targetCenter = target.x + target.width / 2;
  const ownerBehind = direction > 0 ? ownerCenter < targetCenter : ownerCenter > targetCenter;
  const targetFacingGuess = Math.sign(target.velocityX);
  return ownerBehind && targetFacingGuess !== 0 && targetFacingGuess === direction;
}

function colorForWeapon(id: WeaponId): string {
  switch (id) {
    case "slingshot":
      return "#7cff6b";
    case "laser-blaster":
      return "#5ad7ff";
    case "revolver":
      return "#ffd0a6";
    case "minigun":
      return "#ffcf5a";
    case "sniper":
      return "#d6f2ff";
    case "lightning-rod":
      return "#ffd84d";
    case "teleport-ball":
      return "#b096ff";
    case "sledgehammer":
      return "#ff8f3d";
    case "whip":
      return "#f65bd8";
    case "knife":
      return "#d8f0ff";
    default:
      return "#ffffff";
  }
}

function dryFireSoundFor(id: WeaponId): SoundId {
  switch (id) {
    case "pistol":
    case "revolver":
    case "slingshot":
    case "sniper":
    case "minigun":
      return "pistol-empty";
    case "laser-blaster":
      return "laser-vent";
    default:
      return "weapon-drop";
  }
}

function projectileLabelFor(id: WeaponId, slot: "primary" | "secondary"): string {
  switch (id) {
    case "slingshot":
      return slot === "secondary" ? "Scatter Pebble" : "Charged Stone";
    case "laser-blaster":
      return "Laser Bolt";
    case "revolver":
      return slot === "secondary" ? "Fan Fire" : "Revolver";
    case "minigun":
      return "Suppressing Round";
    case "sniper":
      return "Sniper Shot";
    case "knife":
      return "Knife throw";
    default:
      return weaponRegistry.get(id).name;
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
    case "steady":
      return { id, label: "Steady", duration: COMBAT_TUNING.sniper.invisibilitySeconds, stacks: 1 };
    case "legShotSlow":
      return { id, label: "Leg Shot", duration: COMBAT_TUNING.sniper.legShotSlowDuration, stacks: 1 };
    case "legStagger":
      return { id, label: "Leg Stagger", duration: 2.4, stacks: 1 };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
