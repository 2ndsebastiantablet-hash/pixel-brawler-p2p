import { DEFAULT_PHYSICS, VOID_DEATH_Y, isOverPlatform, type PlayerPhysicsState } from "../Physics";
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

export interface AmmoPickup {
  id: string;
  weaponId: WeaponId;
  x: number;
  y: number;
  age: number;
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
    | "blood"
    | "explosion";
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
  ammoPickups: AmmoPickup[];
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

export type SuperLegsKickKind = "neutral" | "forward" | "downward" | "back" | "slam" | "bounce";

interface CombatOptions {
  mode: "offline" | "network";
}

const maxHp = 100;
const respawnDelay = 2;
const respawnInvulnerabilityDuration = 2;
const teleportDelay = 3;
const whipComboWindow = 0.55;
const knifeContactDamage = 4;
const knifeContactCooldown = 0.42;
const wingGustRadius = 130;
const wingGustCooldown = 0.14;
const superLegsArmorDamageScale = 0.38;
const superLegsStatusRefresh = 0.35;
const axeRushRange = 940;
const axeRushSpeed = 1320;
const axeRushMaxTime = 0.72;
const axeRushHitDistance = 78;
const virginBloodBuffDuration = 25;
const virginBloodReviveWingDuration = 30;
const virginBloodCooldown = 52;
const deathAuraBaseRadius = 84;
const deathAuraMaxRadius = 300;
const deathAuraBaseDamage = 2;
const deathAuraMaxDamage = 8;
const deathAuraBaseFreeze = 0.22;
const deathAuraMaxFreeze = 0.96;
const deathAuraActiveDuration = 60;
const deathAuraCooldownDuration = 40;
const deathAuraSufferingForMaxPower = 90;
const deathFrozenGravityMultiplier = 2.2;
const rocketExplosionRadius = 300;
const rocketExplosionCenterDamage = 82;
const rocketExplosionEdgeDamage = 34;
const rocketExplosionCenterKnockback = 1600;
const rocketExplosionEdgeKnockback = 760;
const rocketExplosionCenterStun = 0.74;
const rocketExplosionEdgeStun = 0.42;
const rocketLaunchSpeed = 660;
const rocketChaosSpeed = 850;
const holyBazookaAmmoSpawnSeconds = 10;
const holyBazookaMaxAmmoPickups = 4;
const holyBazookaMaxLoadedAmmo = 6;
const holyBazookaPickupRadius = 48;
const holyBazookaMissileSpeed = 620;
const holyBazookaMissileMaxSpeed = 820;
const holyBazookaHomingStrength = 3.7;
const holyBazookaExplosionRadius = 440;
const holyBazookaExplosionCenterDamage = 122;
const holyBazookaExplosionEdgeDamage = 42;
const holyBazookaExplosionCenterKnockback = 2200;
const holyBazookaExplosionEdgeKnockback = 960;
const holyBazookaExplosionCenterStun = 0.96;
const holyBazookaExplosionEdgeStun = 0.52;
const holyBazookaMaxHpCap = 260;
const handsMissingDuration = 40;
const handSummonCount = 5;
const macheteHitGrowth = 12;
const macheteKoGrowth = 60;
const macheteKoDamageBonus = 3;
const lightningStrikeReach = 620;
const lightningDefaultEmpoweredDuration = 9;
const lightningMaxHoldSeconds = 4.2;
const empoweredDamageScale = 1.22;
const empoweredKnockbackScale = 1.18;

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

interface MacheteGrowthState {
  rangeBonus: number;
  damageBonus: number;
}

interface AxeRushState {
  targetId: string;
  timer: number;
}

interface VirginBloodState {
  reviveAvailable: boolean;
}

interface DeathAuraState {
  active: boolean;
  activeTimer: number;
  cooldownTimer: number;
  suffering: number;
  pulseTimer: number;
  tickCooldowns: Map<string, number>;
}

interface HandAttachmentState {
  ownerId: string;
  attached: number;
  resist: number;
}

export interface WeaponRuntimeState {
  charge: number;
  heat: number;
  spin: number;
  steady: number;
  chamber: number;
  charging: boolean;
  overheated: boolean;
  rangeBonus: number;
  damageBonus: number;
  redness: number;
  axeThrown: boolean;
  axeReturning: boolean;
  deathAuraActive: boolean;
  rocketActive: boolean;
  rocketLit: boolean;
  rocketRiding: boolean;
  attachedHands: number;
}

export interface MacheteRuntimeState extends MacheteGrowthState {
  redness: number;
}

export class CombatSystem {
  private inventory: WeaponInventoryState = createDefaultInventory();
  private readonly combatants = new Map<string, Combatant>();
  private readonly projectiles: Projectile[] = [];
  private readonly hitboxes: Hitbox[] = [];
  private readonly droppedWeapons: DroppedWeapon[] = [];
  private readonly ammoPickups: AmmoPickup[] = [];
  private readonly damageNumbers: DamageNumber[] = [];
  private readonly effects: CombatEffect[] = [];
  private readonly recentEvents: CombatEventPacket[] = [];
  private readonly appliedRemoteEvents = new Set<string>();
  private readonly sounds: SoundId[] = [];
  private readonly pendingTeleports = new Map<string, PendingTeleport>();
  private readonly lightning = new Map<string, LightningState>();
  private readonly machetes = new Map<string, MacheteGrowthState>();
  private readonly axeRushes = new Map<string, AxeRushState>();
  private readonly axeThrows = new Map<string, string>();
  private readonly virginBlood = new Map<string, VirginBloodState>();
  private readonly deathAuras = new Map<string, DeathAuraState>();
  private readonly rockets = new Map<string, string>();
  private readonly handAttachments = new Map<string, HandAttachmentState>();
  private readonly buffVisualTimers = new Map<string, number>();
  private readonly bodyContactCooldowns = new Map<string, number>();
  private holyBazookaAmmoSpawnTimer = holyBazookaAmmoSpawnSeconds;
  private holyBazookaAmmoSpawnIndex = 0;
  private nextId = 0;

  constructor(_options: CombatOptions) {}

  start(inventory: WeaponInventoryState = createDefaultInventory()): void {
    this.inventory = inventory;
    this.combatants.clear();
    this.projectiles.length = 0;
    this.hitboxes.length = 0;
    this.droppedWeapons.length = 0;
    this.ammoPickups.length = 0;
    this.damageNumbers.length = 0;
    this.effects.length = 0;
    this.recentEvents.length = 0;
    this.appliedRemoteEvents.clear();
    this.sounds.length = 0;
    this.pendingTeleports.clear();
    this.lightning.clear();
    this.machetes.clear();
    this.axeRushes.clear();
    this.axeThrows.clear();
    this.virginBlood.clear();
    this.deathAuras.clear();
    this.rockets.clear();
    this.handAttachments.clear();
    this.buffVisualTimers.clear();
    this.bodyContactCooldowns.clear();
    this.holyBazookaAmmoSpawnTimer = holyBazookaAmmoSpawnSeconds;
    this.holyBazookaAmmoSpawnIndex = 0;
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
      maxHp: existing?.maxHp ?? maxHp,
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
    invulnerable?: number;
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
      invulnerable: player.invulnerable ?? existing?.invulnerable ?? 0,
      respawnTimer: player.respawnTimer ?? existing?.respawnTimer ?? 0,
      color: player.color,
      statuses: player.statuses ? player.statuses.map((status) => createStatus(status)) : existing?.statuses ?? [],
    };
    this.combatants.set(player.id, next);
    return next;
  }

  setEquipmentStatus(id: string, status: Extract<StatusEffectId, "superLegs">, enabled: boolean): void {
    const target = this.combatants.get(id);
    if (!target) {
      return;
    }
    if (!enabled) {
      target.statuses = target.statuses.filter((item) => item.id !== status);
      return;
    }
    target.statuses = upsertStatusEffect(target.statuses, createStatus(status));
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

  setEquippedWeapon(weaponId: WeaponId): void {
    this.inventory.equippedWeapon = weaponId;
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
    if (this.hasMissingHands(context.ownerId)) {
      return { kind: "blocked", weaponId: this.inventory.equippedWeapon, label: "No hands" };
    }
    if (this.inventory.equippedWeapon === "wings") {
      return { kind: "blocked", weaponId: "wings", label: "Wings passive" };
    }
    if (this.inventory.equippedWeapon === "super-legs") {
      return { kind: "blocked", weaponId: "super-legs", label: "Super Legs passive" };
    }
    if (this.inventory.equippedWeapon === "virgin-blood") {
      return this.activateVirginBlood(context.ownerId, context.player, context.now);
    }
    if (this.inventory.equippedWeapon === "death-aura") {
      return this.useDeathAura(context);
    }
    if (this.inventory.equippedWeapon === "rocket") {
      return this.placeRocket(context);
    }
    if (this.inventory.equippedWeapon === "holy-bazooka") {
      return this.fireHolyBazooka(context);
    }
    if (this.inventory.equippedWeapon === "hands") {
      return this.spawnHands(context);
    }
    if (this.inventory.equippedWeapon === "axe") {
      return this.useAxePrimary(context);
    }
    if (this.inventory.equippedWeapon === "lightning-rod") {
      return this.callLightningSkyStrike(context);
    }
    return this.useAttack(context, "primary");
  }

  useSecondary(context: WeaponUseContext): WeaponUseResult {
    const weapon = weaponRegistry.get(this.inventory.equippedWeapon);
    if (this.hasMissingHands(context.ownerId)) {
      return { kind: "blocked", weaponId: weapon.id, label: "No hands" };
    }
    if (weapon.id === "wings") {
      return { kind: "blocked", weaponId: weapon.id, label: "Wings passive" };
    }
    if (weapon.id === "super-legs") {
      return { kind: "blocked", weaponId: weapon.id, label: "Super Legs passive" };
    }
    if (weapon.id === "virgin-blood") {
      return this.activateVirginBlood(context.ownerId, context.player, context.now);
    }
    if (weapon.id === "death-aura") {
      return this.useDeathAura(context);
    }
    if (weapon.id === "rocket") {
      return this.lightRocket(context);
    }
    if (weapon.id === "holy-bazooka") {
      return { kind: "blocked", weaponId: weapon.id, label: "Use primary" };
    }
    if (weapon.id === "hands") {
      return this.spawnHands(context);
    }
    if (weapon.id === "pistol" || weapon.id === "knife") {
      return this.throwCurrentWeapon(context.ownerId, context.player, context.aim, context.now, weapon.id === "pistol" && this.inventory.ammo.pistol?.magazine === 0);
    }
    if (weapon.id === "axe") {
      return this.throwAxe(context);
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

  useSuperLegsKick(context: WeaponUseContext, kind: SuperLegsKickKind): WeaponUseResult {
    const weaponId: WeaponId = "super-legs";
    const cooldown = this.inventory.cooldowns[weaponId] ?? 0;
    if (cooldown > 0) {
      return { kind: "blocked", weaponId, label: "Kick cooldown" };
    }

    const kick = superLegsKickProfile(kind);
    const aimFacing = facingFromAim(context.aim.x, context.player.facing);
    const facing = kind === "back" ? -aimFacing : aimFacing;
    const centerX = context.player.x + context.player.width / 2;
    const centerY = context.player.y + context.player.height / 2;
    const box = superLegsKickBox(context.player, kind, facing, kick.range);
    const hitbox: Hitbox = {
      id: this.makeId("super-legs"),
      ownerId: context.ownerId,
      weaponId,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      damage: kick.damage,
      knockback: { x: facing * kick.knockbackX, y: kick.knockbackY },
      stun: kick.stun,
      age: 0,
      duration: 0.14,
      label: kick.label,
      color: colorForWeapon(weaponId),
      status: kick.status,
      heavy: kind === "slam",
      hits: [],
    };
    this.hitboxes.push(hitbox);
    this.inventory.cooldowns[weaponId] = kick.cooldown;
    this.addSuperLegsSelfMotion(context.player, kind, facing);
    this.addEffect(kind === "slam" ? "slam" : "stomp", centerX, centerY + 18, centerX + facing * 36, centerY + 8, colorForWeapon(weaponId), kick.label);
    if (kind === "downward" || kind === "slam") {
      this.addEffect("shockwave", centerX, context.player.y + context.player.height, centerX + facing * 42, context.player.y + context.player.height, colorForWeapon(weaponId), "Leg Impact");
    }
    this.queueSound(kind === "downward" || kind === "slam" ? "ground-slam-impact" : "dash");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", { x: centerX, y: centerY }, { x: facing, y: kind === "downward" || kind === "slam" ? 1 : 0 }, kick.label, context.now));
    return { kind: "hitbox", weaponId, label: kick.label };
  }

  reload(ownerId: string, now: number): WeaponUseResult {
    const weapon = weaponRegistry.get(this.inventory.equippedWeapon);
    if (this.hasMissingHands(ownerId)) {
      return { kind: "blocked", weaponId: weapon.id, label: "No hands" };
    }
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
    if (this.hasMissingHands(ownerId)) {
      return { kind: "blocked", weaponId: this.inventory.equippedWeapon, label: "No hands" };
    }
    if (this.inventory.equippedWeapon === "wings") {
      return { kind: "blocked", weaponId: "wings", label: "Wings passive" };
    }
    if (this.inventory.equippedWeapon === "super-legs") {
      return { kind: "blocked", weaponId: "super-legs", label: "Super Legs passive" };
    }
    if (this.inventory.equippedWeapon === "virgin-blood") {
      return { kind: "blocked", weaponId: "virgin-blood", label: "Click to bless" };
    }
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
    const superLegsArmor = hitLocation === "leg" && target.statuses.some((status) => status.id === "superLegs");
    let finalStatus = statusForHit(request.weaponId, hitLocation, request.status);
    if (superLegsArmor && (finalStatus === "legShotSlow" || finalStatus === "legStagger")) {
      finalStatus = undefined;
    }
    const finalLabel = hitLocation ? `${labelForHitLocation(hitLocation)} ${request.label}` : request.label;
    const source = this.combatants.get(request.sourceId);
    const steadyResist = target.statuses.some((status) => status.id === "steady") && request.sourceId !== target.id;
    const empoweredAttack = !request.skipSourceScaling
      && request.sourceId !== target.id
      && request.sourceId !== "status"
      && Boolean(source?.statuses.some((status) => status.id === "empowered"));
    const holyAttack = !request.skipSourceScaling
      && request.sourceId !== target.id
      && request.sourceId !== "status"
      && Boolean(source?.statuses.some((status) => status.id === "holyBuff"));
    const holyResist = target.statuses.some((status) => status.id === "holyBuff") && request.sourceId !== target.id;
    const damageScale = (steadyResist ? COMBAT_TUNING.sniper.steadyDamageResistance : 1)
      * (holyResist ? 0.72 : 1)
      * (empoweredAttack ? empoweredDamageScale : 1)
      * (holyAttack ? 1.2 : 1)
      * (superLegsArmor ? superLegsArmorDamageScale : 1);
    const knockbackScale = request.label === "DOT" ? 1 : COMBAT_TUNING.enemyKnockbackMultiplier
      * (steadyResist ? 0.25 : 1)
      * locationModifier.knockbackScale
      * (empoweredAttack ? empoweredKnockbackScale : 1)
      * (holyAttack ? 1.16 : 1);
    const verticalLift = request.damage >= 20 ? -26 : effectiveStun >= 0.3 ? -16 : 0;
    const damage = Math.max(1, Math.round(request.damage * damageScale * locationModifier.damageScale));
    target.hp = Math.max(0, target.hp - damage);
    this.recordDeathAuraSuffering(target.id, damage);
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
      if (this.consumeVirginBloodRevive(target)) {
        return { applied: true, remainingHp: target.hp, hitLocation };
      }
      this.startRespawn(target, "KO");
    }

    return { applied: true, remainingHp: target.hp, hitLocation };
  }

  killCombatant(id: string, label = "VOID"): boolean {
    const target = this.combatants.get(id);
    if (!target || target.respawnTimer > 0 || target.hp <= 0) {
      return false;
    }
    this.startRespawn(target, label);
    return true;
  }

  update(dt: number, players: PlayerPhysicsState[]): void {
    for (const player of players) {
      const combatant = this.combatants.get(player.id);
      if (combatant && combatant.respawnTimer <= 0) {
        combatant.x = player.x;
        combatant.y = player.y;
        combatant.width = player.width;
        combatant.height = player.height;
      }
    }

    this.updateTimedVisuals(dt);
    this.updateInventory(dt);
    this.updateHolyBazookaAmmo(dt, players);
    this.updateCombatants(dt);
    this.updateProjectiles(dt, players);
    this.updateTeleports(dt, players);
    this.updateAxeRushes(dt, players);
    this.updateHitboxes(dt);
    this.updateLightning(dt, players);
    this.updateDeathAuras(dt);
    this.updateHandAttachments();
    this.updatePositiveBuffVisuals(dt);
    this.updateContactCooldowns(dt);
    this.updateBodyContact(dt, players);
    this.updateDroppedWeapons(dt);
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

  getMacheteState(ownerId: string): MacheteRuntimeState {
    const state = this.machetes.get(ownerId) ?? { rangeBonus: 0, damageBonus: 0 };
    return {
      ...state,
      redness: macheteRedness(state),
    };
  }

  isMovementLocked(ownerId: string): boolean {
    return this.axeRushes.has(ownerId);
  }

  getVirginBloodState(ownerId: string): { reviveAvailable: boolean; cooldown: number } {
    return {
      reviveAvailable: this.virginBlood.get(ownerId)?.reviveAvailable ?? false,
      cooldown: this.inventory.cooldowns["virgin-blood"] ?? 0,
    };
  }

  getDeathAuraState(ownerId: string): { active: boolean; radius: number; power: number; activeTimer: number; cooldownTimer: number; suffering: number } {
    const owner = this.combatants.get(ownerId);
    const state = this.deathAuras.get(ownerId);
    const power = owner ? deathAuraPower(owner, state) : deathAuraPowerFromSuffering(state?.suffering ?? 0);
    return {
      active: state?.active ?? false,
      radius: deathAuraRadius(power),
      power,
      activeTimer: state?.activeTimer ?? 0,
      cooldownTimer: state?.cooldownTimer ?? 0,
      suffering: state?.suffering ?? 0,
    };
  }

  getRocketState(ownerId: string): { active: boolean; lit: boolean; riding: boolean } {
    const projectile = this.activeRocket(ownerId);
    return {
      active: Boolean(projectile),
      lit: projectile?.state === "lit" || projectile?.state === "chaotic",
      riding: projectile?.riderId === ownerId,
    };
  }

  getHandsState(id: string): { attached: number; missing: number; active: number } {
    const attached = this.handAttachments.get(id)?.attached ?? 0;
    const missing = this.combatants.get(id)?.statuses.find((status) => status.id === "handsMissing")?.duration ?? 0;
    const active = this.projectiles.filter((projectile) => projectile.weaponId === "hands" && projectile.ownerId === id).length;
    return { attached, missing, active };
  }

  resistAttachedHands(targetId: string, effort = 1): boolean {
    const attachment = this.handAttachments.get(targetId);
    const target = this.combatants.get(targetId);
    if (!attachment || !target) {
      return false;
    }
    attachment.resist += effort;
    if (attachment.resist < 5) {
      return false;
    }
    this.handAttachments.delete(targetId);
    target.statuses = target.statuses.filter((status) => status.id !== "scrambled");
    this.addEffect("spark", target.x + target.width / 2, target.y + 12, target.x + target.width / 2, target.y - 36, colorForWeapon("hands"), "FLICKED");
    this.queueSound("hand-flick");
    return true;
  }

  jumpOffRocket(ownerId: string, player: PlayerPhysicsState): boolean {
    const rocket = this.activeRocket(ownerId);
    if (!rocket || rocket.riderId !== ownerId) {
      return false;
    }
    rocket.riderId = undefined;
    rocket.state = "chaotic";
    rocket.chaos = Math.max(rocket.chaos ?? 0, 1.2);
    player.velocityY = Math.min(player.velocityY, -520);
    player.velocityX += -Math.sign(rocket.vx || player.facing || 1) * 130;
    this.addEffect("spark", rocket.x, rocket.y - 20, rocket.x, rocket.y - 60, colorForWeapon("rocket"), "Jump Off");
    return true;
  }

  getWeaponRuntimeState(id: WeaponId = this.inventory.equippedWeapon, ownerId = "local"): WeaponRuntimeState {
    const charge = this.inventory.charge[id];
    const heat = charge?.heat ?? 0;
    const machete = id === "machete" ? this.getMacheteState(ownerId) : { rangeBonus: 0, damageBonus: 0, redness: 0 };
    const axeProjectileId = this.axeThrows.get(ownerId);
    const axeProjectile = axeProjectileId ? this.projectiles.find((projectile) => projectile.id === axeProjectileId) : undefined;
    const rocket = this.activeRocket(ownerId);
    return {
      charge: charge?.charge ?? 0,
      heat,
      spin: id === "minigun" ? charge?.charge ?? 0 : 0,
      steady: id === "sniper" ? charge?.charge ?? 0 : 0,
      chamber: this.inventory.cooldowns[id] ?? 0,
      charging: charge?.charging ?? false,
      overheated: heat >= (id === "laser-blaster" ? COMBAT_TUNING.laser.overheatThreshold : 0.95),
      rangeBonus: machete.rangeBonus,
      damageBonus: machete.damageBonus,
      redness: machete.redness,
      axeThrown: Boolean(axeProjectile),
      axeReturning: axeProjectile?.label === "RETURNING AXE",
      deathAuraActive: this.deathAuras.get(ownerId)?.active ?? false,
      rocketActive: Boolean(rocket),
      rocketLit: rocket?.state === "lit" || rocket?.state === "chaotic",
      rocketRiding: rocket?.riderId === ownerId,
      attachedHands: this.handAttachments.get(ownerId)?.attached ?? 0,
    };
  }

  activateVirginBlood(ownerId: string, player: PlayerPhysicsState, now: number): WeaponUseResult {
    const weaponId: WeaponId = "virgin-blood";
    if (this.inventory.equippedWeapon !== weaponId) {
      return { kind: "blocked", weaponId, label: "Not equipped" };
    }
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Blessing cooldown" };
    }
    const owner = this.combatants.get(ownerId);
    if (!owner || owner.respawnTimer > 0) {
      return { kind: "blocked", weaponId, label: "No vessel" };
    }
    owner.hp = owner.maxHp;
    owner.invulnerable = Math.max(owner.invulnerable, 0.45);
    owner.statuses = upsertStatusEffect(owner.statuses, createStatus("holyBuff"));
    owner.statuses = upsertStatusEffect(owner.statuses, createStatus("blessed"));
    this.virginBlood.set(ownerId, { reviveAvailable: true });
    this.inventory.cooldowns[weaponId] = virginBloodCooldown;
    const center = this.muzzle(player);
    this.addEffect("aura", center.x, center.y, center.x, center.y - 80, colorForWeapon(weaponId), "BLESSED");
    this.addEffect("shockwave", center.x, center.y, center.x, center.y - 120, colorForWeapon(weaponId), "FULL HEAL");
    this.queueSound("virgin-blood-activate");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "equip", center, { x: 0, y: -1 }, "Blessed", now));
    return { kind: "utility", weaponId, label: "Blessed" };
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
          skipSourceScaling: true,
          emitEvent: false,
        });
        if (!hit.applied) {
          target.invulnerable = previousInvulnerable;
        } else if (event.weaponId === "machete") {
          this.growMachete(event.ownerId, hit.remainingHp <= 0);
        }
      }
    }
    if (event.action !== "hit" && !this.appliedRemoteEvents.has(event.id)) {
      this.appliedRemoteEvents.add(event.id);
      this.spawnRemoteVisualFromEvent(event);
    }
    const lightningPrimary = event.weaponId === "lightning-rod" && (event.label === "Sky Strike" || event.label === "Giant Strike");
    this.addEffect(
      event.action === "reload"
        ? "reload"
        : lightningPrimary
          ? "lightning"
          : weapon.kind === "beam"
            ? "laser"
            : weapon.kind === "melee"
              ? "whip"
              : "tracer",
      event.x,
      event.y,
      lightningPrimary ? event.x + event.ax * lightningStrikeReach : event.x + event.ax * weapon.primary.range,
      lightningPrimary ? event.y + event.ay * lightningStrikeReach : event.y + event.ay * weapon.primary.range,
      event.weaponId === "machete" ? macheteColor(this.getMacheteState(event.ownerId).redness) : colorForWeapon(event.weaponId),
      event.label,
    );
  }

  private spawnRemoteVisualFromEvent(event: CombatEventPacket): void {
    const weapon = weaponRegistry.get(event.weaponId);
    const aim = normalize({ x: event.ax, y: event.ay });
    if (event.action === "throw") {
      const speed = weapon.throw.speed || weapon.secondary.speed || 720;
      if (speed > 0) {
        this.projectiles.push(this.createRemoteVisualProjectile(event, aim, speed, weapon.secondary.radius ?? 7, Math.max(0.28, weapon.secondary.range / speed), event.label));
      }
      return;
    }

    if (event.weaponId === "rocket") {
      this.spawnRemoteRocketVisual(event, aim);
      return;
    }
    if (event.weaponId === "hands" && (event.action === "primary" || event.action === "secondary")) {
      this.spawnRemoteHandsVisual(event, aim);
      return;
    }
    if (event.weaponId === "super-legs") {
      this.addEffect("stomp", event.x, event.y, event.x + aim.x * 46, event.y + aim.y * 24, colorForWeapon("super-legs"), event.label);
      return;
    }

    if (event.action !== "primary" && event.action !== "secondary") {
      return;
    }
    const profile = event.action === "secondary" ? weapon.secondary : weapon.primary;
    const speed = profile.speed ?? (weapon.kind === "projectile" || weapon.kind === "beam" ? 760 : 0);
    if (speed <= 0 || profile.range <= 0) {
      return;
    }
    this.projectiles.push(this.createRemoteVisualProjectile(event, aim, speed, profile.radius ?? 6, Math.max(0.16, profile.range / speed), event.label));
  }

  private createRemoteVisualProjectile(
    event: CombatEventPacket,
    aim: Vec2,
    speed: number,
    radius: number,
    lifetime: number,
    label: string,
  ): Projectile {
    return {
      id: `remote-${event.id}`,
      ownerId: event.ownerId,
      weaponId: event.weaponId,
      x: event.x,
      y: event.y,
      vx: aim.x * speed,
      vy: aim.y * speed,
      radius,
      damage: 0,
      knockback: { x: 0, y: 0 },
      stun: 0,
      age: 0,
      lifetime,
      gravity: event.weaponId === "slingshot" || event.weaponId === "teleport-ball" ? 760 : event.action === "throw" ? 620 : 0,
      bounces: 0,
      pierce: 0,
      label,
      color: colorForWeapon(event.weaponId),
      trailColor: colorForWeapon(event.weaponId),
      originX: event.x,
      originY: event.y,
      ownerFacing: aim.x >= 0 ? 1 : -1,
      visualOnly: true,
      hits: [],
    };
  }

  private spawnRemoteRocketVisual(event: CombatEventPacket, aim: Vec2): void {
    const existingId = this.rockets.get(event.ownerId);
    const existing = existingId ? this.projectiles.find((projectile) => projectile.id === existingId) : undefined;
    const facing = facingFromAim(aim.x, 1);
    const rocket = existing ?? {
      id: `remote-rocket-${event.id}`,
      ownerId: event.ownerId,
      weaponId: "rocket" as WeaponId,
      x: event.x,
      y: event.y,
      vx: 0,
      vy: 0,
      radius: 15,
      damage: 0,
      knockback: { x: 0, y: 0 },
      stun: 0,
      age: 0,
      lifetime: 4,
      gravity: 0,
      bounces: 0,
      pierce: 0,
      label: "ROCKET RESTING",
      color: colorForWeapon("rocket"),
      trailColor: "#ffcf5a",
      state: "resting" as const,
      ownerFacing: facing,
      visualOnly: true,
      hits: [],
    };
    rocket.x = event.x;
    rocket.y = event.y;
    rocket.ownerFacing = facing;
    if (event.action === "secondary") {
      rocket.state = "lit";
      rocket.label = "ROCKET LIT";
      rocket.vx = facing * rocketLaunchSpeed;
      rocket.vy = -34;
      rocket.lifetime = 1.2;
      rocket.age = 0;
    }
    if (!existing) {
      this.projectiles.push(rocket);
    }
    this.rockets.set(event.ownerId, rocket.id);
  }

  private spawnRemoteHandsVisual(event: CombatEventPacket, aim: Vec2): void {
    const facing = facingFromAim(aim.x, 1);
    for (let index = 0; index < 5; index += 1) {
      this.projectiles.push({
        id: `remote-hand-${event.id}-${index}`,
        ownerId: event.ownerId,
        weaponId: "hands",
        x: event.x + facing * (12 + index * 7),
        y: COMBAT_TUNING.projectiles.floorY - 8,
        vx: facing * (120 + index * 8),
        vy: 0,
        radius: 8,
        damage: 0,
        knockback: { x: 0, y: 0 },
        stun: 0,
        age: 0,
        lifetime: 1.5,
        gravity: 0,
        bounces: 0,
        pierce: 0,
        label: "MINI HAND",
        color: colorForWeapon("hands"),
        trailColor: colorForWeapon("hands"),
        ownerFacing: facing,
        visualOnly: true,
        hits: [],
      });
    }
  }

  getSnapshot(): CombatSnapshot {
    return {
      projectiles: this.projectiles,
      hitboxes: this.hitboxes,
      combatants: [...this.combatants.values()],
      droppedWeapons: this.droppedWeapons,
      ammoPickups: this.ammoPickups,
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
    if (weapon.id === "machete") {
      this.queueSound(slot === "secondary" ? "machete-chop" : "machete-slash");
    }
    if (weapon.id === "axe") {
      this.queueSound("axe-swing");
    }

    this.spawnMeleeHitbox(context, chargedProfile, meleeLabelFor(weapon.id, slot, weapon.name));
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

  private useAxePrimary(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "axe";
    if (this.activeAxeProjectile(context.ownerId)) {
      return { kind: "blocked", weaponId, label: "Axe thrown" };
    }
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Cooldown" };
    }
    const target = this.findNearestAxeTarget(context.ownerId, context.player);
    if (!target || target.distance <= 150 || target.distance > axeRushRange) {
      return this.useAttack(context, "primary");
    }

    const direction = normalize({
      x: target.combatant.x + target.combatant.width / 2 - (context.player.x + context.player.width / 2),
      y: target.combatant.y + target.combatant.height / 2 - (context.player.y + context.player.height / 2),
    });
    context.player.facing = direction.x >= 0 ? 1 : -1;
    context.player.velocityX = direction.x * axeRushSpeed;
    context.player.velocityY = Math.min(context.player.velocityY, direction.y * axeRushSpeed * 0.22);
    this.axeRushes.set(context.ownerId, { targetId: target.combatant.id, timer: axeRushMaxTime });
    this.inventory.cooldowns[weaponId] = 0.2;
    this.addEffect("tracer", context.player.x + context.player.width / 2, context.player.y + 24, target.combatant.x + target.combatant.width / 2, target.combatant.y + 24, colorForWeapon(weaponId), "Axe Rush");
    this.queueSound("axe-rush");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", this.muzzle(context.player), direction, "Axe Rush", context.now));
    return { kind: "utility", weaponId, label: "Axe Rush" };
  }

  private findNearestAxeTarget(ownerId: string, player: PlayerPhysicsState): { combatant: Combatant; distance: number } | null {
    const ownerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
    let nearest: { combatant: Combatant; distance: number } | null = null;
    for (const combatant of this.combatants.values()) {
      if (combatant.id === ownerId || combatant.respawnTimer > 0 || combatant.hp <= 0) {
        continue;
      }
      const center = { x: combatant.x + combatant.width / 2, y: combatant.y + combatant.height / 2 };
      const distance = Math.hypot(center.x - ownerCenter.x, center.y - ownerCenter.y);
      if (!nearest || distance < nearest.distance) {
        nearest = { combatant, distance };
      }
    }
    return nearest;
  }

  private getOrCreateDeathAuraState(ownerId: string): DeathAuraState {
    const existing = this.deathAuras.get(ownerId);
    if (existing) {
      return existing;
    }
    const state: DeathAuraState = {
      active: false,
      activeTimer: 0,
      cooldownTimer: 0,
      suffering: 0,
      pulseTimer: 0,
      tickCooldowns: new Map<string, number>(),
    };
    this.deathAuras.set(ownerId, state);
    return state;
  }

  private recordDeathAuraSuffering(ownerId: string, damage: number): void {
    if (damage <= 0) {
      return;
    }
    const state = this.getOrCreateDeathAuraState(ownerId);
    state.suffering = Math.min(deathAuraSufferingForMaxPower, state.suffering + damage);
  }

  private useDeathAura(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "death-aura";
    const state = this.getOrCreateDeathAuraState(context.ownerId);
    if (state.active) {
      return { kind: "blocked", weaponId, label: "Aura active" };
    }
    if (state.cooldownTimer > 0) {
      return { kind: "blocked", weaponId, label: "Aura cooldown" };
    }
    state.active = true;
    state.activeTimer = deathAuraActiveDuration;
    state.pulseTimer = 0;
    state.tickCooldowns.clear();
    this.inventory.cooldowns[weaponId] = 0;
    const owner = this.combatants.get(context.ownerId);
    const cx = owner ? owner.x + owner.width / 2 : context.player.x + context.player.width / 2;
    const cy = owner ? owner.y + owner.height / 2 : context.player.y + context.player.height / 2;
    const aura = this.getDeathAuraState(context.ownerId);
    this.addEffect("aura", cx, cy, cx, cy - aura.radius, deathAuraColor(aura.power), "DEATH RELEASE");
    this.queueSound("death-aura");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", { x: cx, y: cy }, { x: 0, y: -1 }, "Death Aura", context.now));
    return { kind: "utility", weaponId, label: "Death Aura" };
  }

  private placeRocket(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "rocket";
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Rocket cooldown" };
    }
    const existing = this.activeRocket(context.ownerId);
    if (existing) {
      return { kind: "blocked", weaponId, label: "Rocket active" };
    }
    const facing = facingFromAim(context.aim.x, context.player.facing);
    const rocket: Projectile = {
      id: this.makeId("rocket"),
      ownerId: context.ownerId,
      weaponId,
      x: context.player.x + context.player.width / 2 + facing * 10,
      y: COMBAT_TUNING.projectiles.floorY - 12,
      vx: 0,
      vy: 0,
      radius: 18,
      damage: 0,
      knockback: { x: 0, y: 0 },
      stun: 0,
      age: 0,
      lifetime: 8,
      gravity: 0,
      bounces: 0,
      pierce: 0,
      label: "ROCKET RESTING",
      color: colorForWeapon(weaponId),
      trailColor: "#ff8f3d",
      originX: context.player.x,
      originY: context.player.y,
      state: "resting",
      ownerFacing: facing,
      hits: [],
    };
    this.projectiles.push(rocket);
    this.rockets.set(context.ownerId, rocket.id);
    this.inventory.cooldowns[weaponId] = weaponRegistry.get(weaponId).primary.cooldown;
    this.addEffect("pickup", rocket.x, rocket.y, rocket.x, rocket.y - 22, colorForWeapon(weaponId), "Rocket");
    this.queueSound("rocket-place");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", { x: rocket.x, y: rocket.y }, { x: facing, y: 0 }, "Rocket Placed", context.now));
    return { kind: "utility", weaponId, label: "Rocket Placed" };
  }

  private lightRocket(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "rocket";
    const rocket = this.activeRocket(context.ownerId);
    if (!rocket) {
      return { kind: "blocked", weaponId, label: "No rocket" };
    }
    if (rocket.state === "lit" || rocket.state === "chaotic") {
      return { kind: "blocked", weaponId, label: "Already lit" };
    }
    const facing = facingFromAim(context.aim.x, rocket.ownerFacing ?? context.player.facing);
    const riderClose = Math.abs((context.player.x + context.player.width / 2) - rocket.x) < 54
      && Math.abs((context.player.y + context.player.height) - rocket.y) < 42;
    rocket.state = "lit";
    rocket.label = "ROCKET LIT";
    rocket.age = 0;
    rocket.vx = facing * rocketLaunchSpeed;
    rocket.vy = -34;
    rocket.damage = rocketExplosionCenterDamage;
    rocket.knockback = { x: facing * rocketExplosionCenterKnockback, y: -360 };
    rocket.stun = rocketExplosionCenterStun;
    rocket.riderId = riderClose ? context.ownerId : undefined;
    rocket.ownerFacing = facing;
    this.addEffect("tracer", rocket.x, rocket.y, rocket.x - facing * 54, rocket.y + 4, "#ff8f3d", "Rocket Fire");
    this.queueSound("rocket-light");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "secondary", { x: rocket.x, y: rocket.y }, { x: facing, y: 0 }, "Rocket Lit", context.now));
    return { kind: "utility", weaponId, label: "Rocket Lit" };
  }

  private fireHolyBazooka(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "holy-bazooka";
    const weapon = weaponRegistry.get(weaponId);
    const cooldown = this.inventory.cooldowns[weaponId] ?? 0;
    if (cooldown > 0) {
      return { kind: "blocked", weaponId, label: "Cooldown" };
    }

    const ammo = this.inventory.ammo[weaponId];
    if (!ammo || ammo.magazine <= 0) {
      const dry = this.muzzle(context.player);
      this.addEffect("dry-fire", dry.x, dry.y, dry.x + context.aim.x * 18, dry.y + context.aim.y * 18, "#fff4a8", "EMPTY");
      this.queueSound("pistol-empty");
      return { kind: "dry-fire", weaponId, label: "Dry fire" };
    }

    const aim = normalize(context.aim);
    const start = this.muzzle(context.player);
    ammo.magazine = Math.max(0, ammo.magazine - 1);
    ammo.reloadTimer = 0;
    this.inventory.cooldowns[weaponId] = weapon.primary.cooldown;
    this.projectiles.push({
      id: this.makeId("holy"),
      ownerId: context.ownerId,
      weaponId,
      x: start.x,
      y: start.y,
      vx: aim.x * holyBazookaMissileSpeed,
      vy: aim.y * holyBazookaMissileSpeed,
      radius: weapon.primary.radius ?? 18,
      damage: 0,
      knockback: { x: 0, y: 0 },
      stun: 0,
      age: 0,
      lifetime: weapon.primary.range / holyBazookaMissileSpeed,
      gravity: 0,
      bounces: 0,
      pierce: 0,
      label: "HOLY MISSILE",
      color: colorForWeapon(weaponId),
      trailColor: "#ffffff",
      originX: start.x,
      originY: start.y,
      homingStrength: holyBazookaHomingStrength,
      ownerFacing: aim.x >= 0 ? 1 : -1,
      hits: [],
    });
    this.applySelfRecoil(context.player, aim, 430, 245);
    this.addEffect("muzzle", start.x, start.y, start.x + aim.x * 48, start.y + aim.y * 48, colorForWeapon(weaponId), "HOLY FIRE");
    this.addEffect("tracer", start.x, start.y, start.x - aim.x * 52, start.y - aim.y * 52, "#fff4a8", "RECOIL");
    this.queueSound("holy-bazooka-fire");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", start, aim, "Holy Bazooka", context.now));
    return { kind: "fired", weaponId, label: "Holy Bazooka" };
  }

  private spawnHands(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "hands";
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Hands cooldown" };
    }
    const owner = this.combatants.get(context.ownerId);
    if (!owner) {
      return { kind: "blocked", weaponId, label: "No owner" };
    }
    const facing = context.player.facing || (context.aim.x >= 0 ? 1 : -1);
    for (let index = 0; index < handSummonCount; index += 1) {
      const offset = (index - 2) * 9;
      this.projectiles.push({
        id: this.makeId("hand"),
        ownerId: context.ownerId,
        weaponId,
        x: owner.x + owner.width / 2 + offset,
        y: COMBAT_TUNING.projectiles.floorY - 7,
        vx: facing * (64 + index * 8),
        vy: 0,
        radius: 7,
        damage: 1,
        knockback: { x: facing * 45, y: -25 },
        stun: 0.05,
        age: 0,
        lifetime: 12,
        gravity: 0,
        bounces: 0,
        pierce: 0,
        label: "MINI HAND",
        color: colorForWeapon(weaponId),
        trailColor: colorForWeapon(weaponId),
        ownerFacing: facing,
        hits: [],
      });
    }
    owner.statuses = upsertStatusEffect(owner.statuses, createStatus("handsMissing"));
    this.inventory.cooldowns[weaponId] = weaponRegistry.get(weaponId).primary.cooldown;
    this.addEffect("aura", owner.x + owner.width / 2, owner.y + 12, owner.x + owner.width / 2, owner.y - 34, colorForWeapon(weaponId), "NO HANDS");
    this.queueSound("hand-spawn");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", this.muzzle(context.player), { x: facing, y: 0 }, "Hands", context.now));
    return { kind: "utility", weaponId, label: "Hands" };
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

    if (weaponId === "machete") {
      const dashCleave = context.player.sliding || context.player.lowSliding || context.player.action === "slide" || context.player.action === "lowSlide";
      const airSlash = !context.player.grounded;
      const growth = this.getMacheteState(context.ownerId);
      if (airSlash && slot === "primary") {
        context.player.velocityY = Math.min(context.player.velocityY, 90);
      }
      if (airSlash && slot === "secondary") {
        context.player.velocityY = Math.max(context.player.velocityY, 180);
      }
      return {
        ...profile,
        damage: profile.damage + growth.damageBonus,
        range: profile.range + growth.rangeBonus + (dashCleave ? 24 : 0),
        knockback: profile.knockback * (slot === "secondary" ? 1.12 : dashCleave ? 1.22 : 1) * (1 + growth.damageBonus * 0.025),
        stun: profile.stun + (slot === "secondary" ? 0.05 : 0) + Math.min(0.18, growth.damageBonus * 0.01),
      };
    }

    if (weaponId === "axe") {
      const slideCleave = context.player.sliding || context.player.lowSliding || context.player.action === "slide" || context.player.action === "lowSlide";
      const airChop = !context.player.grounded;
      const fallingChop = airChop && (context.player.velocityY > 120 || context.aim.y > 0.45);
      if (airChop && slot === "primary") {
        context.player.velocityY = Math.max(context.player.velocityY, fallingChop ? 360 : 160);
      }
      return {
        ...profile,
        damage: profile.damage + (fallingChop ? 5 : 0),
        range: profile.range + (slot === "primary" ? 46 : 0) + (slideCleave ? 18 : 0),
        knockback: profile.knockback * (1 + (slideCleave ? 0.24 : 0) + (fallingChop ? 0.16 : 0)),
        stun: profile.stun + (fallingChop ? 0.07 : slideCleave ? 0.04 : 0),
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

  private callLightningSkyStrike(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "lightning-rod";
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Lightning cooldown" };
    }
    const owner = this.combatants.get(context.ownerId);
    if (!owner) {
      return { kind: "blocked", weaponId, label: "No target" };
    }

    const aim = normalize(context.aim);
    const center = this.muzzle(context.player);
    const source = {
      x: center.x + aim.x * lightningStrikeReach,
      y: center.y + aim.y * lightningStrikeReach,
    };
    const state = this.lightning.get(context.ownerId) ?? {
      chargeTimer: 0,
      empoweredTimer: 0,
      strain: 0,
      pulseTimer: 0,
      shockCooldowns: new Map<string, number>(),
    };
    const upwardSelfCharge = aim.y < -0.86 && Math.abs(aim.x) < 0.36;
    const heldSeconds = clamp(context.heldMs / 1000, 0.16, lightningMaxHoldSeconds);
    const chargeColor = lightningChargeColorForHold(heldSeconds);
    state.chargeTimer = 0;
    state.strain = Math.min(1.8, state.strain + (upwardSelfCharge ? 0.18 + heldSeconds * 0.18 : 0.16));
    state.pulseTimer = 0;
    this.lightning.set(context.ownerId, state);
    this.inventory.cooldowns[weaponId] = upwardSelfCharge ? 0.82 + heldSeconds * 0.12 : 0.86;

    if (upwardSelfCharge) {
      const empoweredDuration = lightningDurationForHold(heldSeconds);
      const selfDamage = lightningSelfDamageForHold(heldSeconds);
      state.empoweredTimer = empoweredDuration;
      const previousInvulnerable = owner.invulnerable;
      owner.invulnerable = 0;
      this.applyDamage({
        sourceId: context.ownerId,
        targetId: context.ownerId,
        damage: selfDamage,
        knockback: { x: 0, y: -180 - heldSeconds * 22 },
        stun: 0.08 + heldSeconds * 0.035,
        label: "SKY CHARGE",
        weaponId,
      });
      owner.invulnerable = Math.max(owner.invulnerable, previousInvulnerable);
      owner.statuses = upsertStatusEffect(owner.statuses, { id: "empowered", label: "Empowered", duration: empoweredDuration, stacks: 1 });
      this.addEffect("lightning", owner.x + owner.width / 2, owner.y + 18, owner.x + owner.width / 2, owner.y - 190 - heldSeconds * 34, chargeColor, "FORMING LIGHTNING");
      this.addEffect("aura", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y - 70 - heldSeconds * 18, chargeColor, "Energized");
      if (heldSeconds > 1.25) {
        this.addEffect("shockwave", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y - 36, chargeColor, "Charge");
      }
      this.queueSound("lightning-pulse");
    } else {
      state.empoweredTimer = 0;
      this.clearStatus(context.ownerId, "empowered");
    }

    this.addEffect("lightning", center.x, center.y + 12, source.x, source.y, upwardSelfCharge ? chargeColor : "#ffd84d", "Sky Strike");
    this.applyLightningLineDamage(context.ownerId, source, center, upwardSelfCharge ? 18 + Math.round(heldSeconds * 2) : 24, upwardSelfCharge ? 360 : 430, upwardSelfCharge ? 0.24 : 0.3, "Sky Strike");
    this.queueSound("lightning-strike");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", center, aim, "Sky Strike", context.now));
    return { kind: "utility", weaponId, label: "Sky Strike" };
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
    const empoweredDuration = lightningDefaultEmpoweredDuration + state.strain * 8;
    const selfDamage = Math.round(12 + state.strain * 12);
    const previousInvulnerable = owner.invulnerable;
    owner.invulnerable = 0;
    this.applyDamage({
      sourceId: ownerId,
      targetId: ownerId,
      damage: selfDamage,
      knockback: { x: 0, y: -140 },
      stun: state.strain > 0.95 ? 0.35 : 0.05,
      label: "SELF STRIKE",
      weaponId: "lightning-rod",
    });
    owner.invulnerable = Math.max(owner.invulnerable, previousInvulnerable);
    owner.statuses = upsertStatusEffect(owner.statuses, { id: "empowered", label: "Empowered", duration: empoweredDuration, stacks: 1 });
    if (state.strain > 1) {
      owner.statuses = upsertStatusEffect(owner.statuses, { id: "daze", label: "Strained", duration: 0.55, stacks: 1 });
      owner.hitstun = Math.max(owner.hitstun, 0.55);
    }
    state.empoweredTimer = empoweredDuration;
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

  private addSuperLegsSelfMotion(player: PlayerPhysicsState, kind: SuperLegsKickKind, facing: number): void {
    switch (kind) {
      case "forward":
        player.velocityX += facing * 380;
        player.velocityY = Math.min(player.velocityY, -190);
        break;
      case "back":
        player.velocityX -= facing * 250;
        player.velocityY = Math.min(player.velocityY, -150);
        break;
      case "downward":
        player.velocityY = Math.max(player.velocityY, 1040);
        break;
      case "slam":
        player.velocityY = Math.max(player.velocityY, 1280);
        break;
      case "bounce":
        player.velocityY = Math.min(player.velocityY, -840);
        player.jumpsUsed = Math.min(player.jumpsUsed, 1);
        break;
      case "neutral":
      default:
        player.velocityY = Math.min(player.velocityY, -520);
        break;
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
    if (!this.inventory.weaponInventory.includes(dropped.weaponId)) {
      this.inventory.weaponInventory.push(dropped.weaponId);
    }
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

  private removeThrownWeaponFromInventory(weaponId: WeaponId): void {
    const index = this.inventory.weaponInventory.indexOf(weaponId);
    if (index < 0) {
      return;
    }
    this.inventory.weaponInventory.splice(index, 1);
    if (this.inventory.equippedWeapon !== weaponId) {
      return;
    }
    const fallback = this.inventory.weaponInventory[Math.min(index, this.inventory.weaponInventory.length - 1)]
      ?? this.inventory.weaponInventory[this.inventory.weaponInventory.length - 1];
    if (fallback) {
      this.inventory.equippedWeapon = fallback;
      return;
    }
    this.inventory.weaponInventory.push("knife");
    this.inventory.equippedWeapon = "knife";
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

  private applyExplosionDamage(options: {
    sourceId: string;
    weaponId: WeaponId;
    x: number;
    y: number;
    radius: number;
    centerDamage: number;
    edgeDamage: number;
    centerKnockback: number;
    edgeKnockback: number;
    centerStun: number;
    edgeStun: number;
    label: string;
  }): void {
    for (const target of this.combatants.values()) {
      if (target.respawnTimer > 0) {
        continue;
      }
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height / 2;
      const distance = Math.hypot(tx - options.x, ty - options.y);
      if (distance > options.radius) {
        continue;
      }
      const falloff = 1 - distance / options.radius;
      const damage = Math.round(lerp(options.edgeDamage, options.centerDamage, falloff));
      const knockback = lerp(options.edgeKnockback, options.centerKnockback, falloff);
      const stun = lerp(options.edgeStun, options.centerStun, falloff);
      const direction = normalize({
        x: tx - options.x || (target.id === options.sourceId ? -1 : 1),
        y: ty - options.y || -0.35,
      });
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: options.sourceId,
        targetId: target.id,
        weaponId: options.weaponId,
        damage,
        knockback: {
          x: direction.x * knockback,
          y: -Math.abs(direction.y * knockback) - lerp(180, 360, falloff),
        },
        stun,
        label: options.label,
        status: "daze",
        skipHitLocationScaling: true,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
      }
    }
    const holy = options.weaponId === "holy-bazooka";
    this.addEffect("explosion", options.x, options.y, options.x + options.radius, options.y, holy ? "#fff4a8" : "#ff8f3d", holy ? "HOLY EXPLOSION" : "EXPLOSION");
    this.addEffect("explosion", options.x, options.y, options.x + options.radius * 0.7, options.y, holy ? "#ffffff" : "#fff4a8", holy ? "HOLY FIREBALL" : "FIREBALL");
    this.addEffect("aura", options.x, options.y, options.x + options.radius * 0.9, options.y, holy ? "#d9f7ff" : "#2b2b32", holy ? "HOLY SMOKE" : "SMOKE CLOUD");
    this.addEffect("shockwave", options.x, options.y, options.x + options.radius, options.y, holy ? "#ffffff" : "#ffcf5a", holy ? "HOLY BOOM" : "BOOM");
    for (let index = 0; index < (holy ? 18 : 12); index += 1) {
      const angle = (Math.PI * 2 * index) / (holy ? 18 : 12);
      const reach = options.radius * (0.24 + (index % 4) * 0.12);
      this.addEffect("spark", options.x, options.y, options.x + Math.cos(angle) * reach, options.y + Math.sin(angle) * reach, holy ? (index % 2 === 0 ? "#ffffff" : "#fff4a8") : index % 2 === 0 ? "#ffcf5a" : "#ff8f3d", holy ? "HOLY DEBRIS" : "DEBRIS");
    }
  }

  private applyLightningLineDamage(sourceId: string, from: Vec2, to: Vec2, damage: number, knockback: number, stun: number, label: string): void {
    const strike = { x: to.x - from.x, y: to.y - from.y };
    const lengthSquared = Math.max(1, strike.x * strike.x + strike.y * strike.y);
    const strikeDirection = normalize(strike);
    for (const target of this.combatants.values()) {
      if (target.id === sourceId || target.respawnTimer > 0) {
        continue;
      }
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height / 2;
      const t = clamp(((tx - from.x) * strike.x + (ty - from.y) * strike.y) / lengthSquared, 0, 1);
      const closest = {
        x: from.x + strike.x * t,
        y: from.y + strike.y * t,
      };
      const distance = Math.hypot(tx - closest.x, ty - closest.y);
      if (distance > 46) {
        continue;
      }
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId,
        targetId: target.id,
        damage,
        knockback: { x: strikeDirection.x * knockback, y: strikeDirection.y * knockback - 130 },
        stun,
        label,
        status: "shock",
        weaponId: "lightning-rod",
        hitY: closest.y,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
      }
    }
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
      weaponId?: WeaponId;
      color?: string;
      cooldown?: number;
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
      weaponId: request.weaponId,
    });
    if (!hit.applied) {
      target.invulnerable = previousInvulnerable;
      return false;
    }
    this.bodyContactCooldowns.set(key, request.cooldown ?? (kind === "stomp" ? COMBAT_TUNING.headStomp.cooldown : kind.includes("slam") ? 0.45 : 0.32));
    this.addEffect(request.effect, target.x + target.width / 2, target.y + target.height / 2, target.x + target.width / 2, target.y, request.color ?? (request.effect === "trip" ? "#7cff6b" : "#ffd84d"), request.label);
    this.queueSound(request.sound);
    return true;
  }

  private applyWingGust(sourceId: string, target: Combatant, knockback: Vec2): boolean {
    const key = `${sourceId}:${target.id}:wing-gust`;
    if (this.bodyContactCooldowns.has(key)) {
      return false;
    }
    target.velocityX += knockback.x * COMBAT_TUNING.enemyKnockbackMultiplier;
    target.velocityY += knockback.y * COMBAT_TUNING.enemyKnockbackMultiplier * 0.72;
    target.hitstun = Math.max(target.hitstun, 0.03);
    this.bodyContactCooldowns.set(key, wingGustCooldown);
    this.addEffect("shockwave", target.x + target.width / 2, target.y + target.height / 2, target.x + target.width / 2, target.y, colorForWeapon("wings"), "Wing Gust");
    this.queueSound("wing-gust");
    this.recentEvents.push(this.createEvent(
      sourceId,
      "wings",
      "hit",
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      normalize(knockback),
      "Wing Gust",
      performanceNow(),
      {
        targetId: target.id,
        damage: 0,
        kx: knockback.x,
        ky: knockback.y,
        stun: 0.03,
      },
    ));
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
    const isWhip = weaponId === "whip";
    const isKnife = weaponId === "knife";
    const isMachete = weaponId === "machete";
    const isAxe = weaponId === "axe";
    const isMacheteChop = isMachete && label === "Machete Chop";
    const isHammer = weaponId === "sledgehammer";
    const macheteState = isMachete ? this.getMacheteState(context.ownerId) : undefined;
    const attackColor = macheteState ? macheteColor(macheteState.redness) : colorForWeapon(weaponId);
    const knifeStep = isKnife ? this.registerKnifeSwing() : 0;
    const lowTrip = isWhip && (context.player.ducking || context.player.lowSliding || context.player.action === "duck" || context.player.action === "lowSlide");
    const range = isKnife ? profile.range + (knifeStep === 3 ? 10 : 0) : profile.range;
    const thickness = isWhip
      ? Math.max(32, (profile.radius ?? 14) * 2.4)
      : isKnife
        ? Math.max(24, (profile.radius ?? 14) * 2.2)
        : isMachete
          ? Math.max(40, (profile.radius ?? 20) * (isMacheteChop ? 2.6 : 2.1))
          : isAxe
            ? Math.max(42, (profile.radius ?? 22) * 2.2)
            : Math.max(22, (profile.radius ?? 14) * 2);
    const swing = aimedMeleeBox(context.player, aim, range, thickness, lowTrip);
    const x = swing.x;
    const y = swing.y;
    const hitLabel = isKnife ? (knifeStep === 3 ? "Knife Stab" : "Knife Slash") : lowTrip ? "Low Whip" : label;
    const knockbackY = isHammer && aim.y > 0
      ? Math.max(140, aim.y * profile.knockback - 20)
      : isMacheteChop && aim.y >= 0
      ? Math.max(70, aim.y * profile.knockback + 70)
      : aim.y * profile.knockback - 60;
    this.hitboxes.push({
      id: this.makeId("hit"),
      ownerId: context.ownerId,
      weaponId,
      x,
      y,
      width: swing.width,
      height: swing.height,
      damage: profile.damage,
      knockback: {
        x: aim.x * profile.knockback,
        y: knockbackY,
      },
      stun: profile.stun,
      age: 0,
      duration: Math.max(0.08, profile.cooldown * 0.46),
      label: hitLabel,
      color: attackColor,
      status: lowTrip ? "tripped" : profile.status,
      sweetSpot: isWhip || isMachete || isAxe ? "tip" : undefined,
      lowTrip,
      heavy: isHammer || isMacheteChop || isAxe,
      hits: [],
    });
    this.addEffect(weaponId === "sledgehammer" ? "slam" : weaponId === "lightning-rod" ? "lightning" : "whip", swing.start.x, swing.start.y, swing.end.x, swing.end.y, attackColor, hitLabel);
    if (isMacheteChop) {
      this.addEffect("spark", x + swing.width * 0.5, y + swing.height, x + swing.width * 0.5, y + swing.height + 18, attackColor, "Chop");
    }
    if (isAxe) {
      this.addEffect("spark", x + swing.width * 0.72, y + swing.height * 0.5, x + swing.width * 0.72, y + swing.height * 0.5 + 18, attackColor, "Heavy");
    }
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
      knockback: {
        x: context.aim.x * profile.knockback,
        y: this.inventory.equippedWeapon === "sledgehammer" && context.aim.y > 0
          ? Math.max(140, context.aim.y * profile.knockback - 20)
          : context.aim.y * profile.knockback - 80,
      },
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

  private throwAxe(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "axe";
    const weapon = weaponRegistry.get(weaponId);
    const existing = this.activeAxeProjectile(context.ownerId);
    if (existing) {
      if (existing.label === "RETURNING AXE") {
        return { kind: "blocked", weaponId, label: "Already returning" };
      }
      return this.recallAxe(context, existing);
    }
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Throw cooldown" };
    }
    const aim = normalize(context.aim);
    const start = this.muzzle(context.player);
    const slideThrow = context.player.sliding || context.player.lowSliding || context.player.action === "slide" || context.player.action === "lowSlide";
    const airThrow = !context.player.grounded;
    const fallingThrow = airThrow && context.player.velocityY > 80;
    const speedScale = slideThrow ? 1.12 : 1;
    const knockbackScale = slideThrow ? 1.24 : airThrow ? 1.08 : 1;
    this.inventory.cooldowns[weaponId] = weapon.secondary.cooldown;
    this.applySelfRecoil(context.player, aim, airThrow ? 112 : 84, airThrow ? 28 : 18);
    const projectile: Projectile = {
      id: this.makeId("throw"),
      ownerId: context.ownerId,
      weaponId,
      x: start.x,
      y: start.y,
      vx: aim.x * weapon.throw.speed * speedScale,
      vy: aim.y * weapon.throw.speed * speedScale - 70,
      radius: weapon.secondary.radius ?? 11,
      damage: weapon.throw.damage + (fallingThrow ? 3 : 0),
      knockback: { x: aim.x * weapon.throw.knockback * knockbackScale, y: aim.y * weapon.throw.knockback - 95 },
      stun: weapon.throw.stun + (slideThrow ? 0.04 : 0),
      age: 0,
      lifetime: weapon.secondary.range / Math.max(weapon.throw.speed, 1),
      gravity: weapon.secondary.gravity ?? 340,
      bounces: weapon.secondary.bounces ?? 1,
      pierce: 1,
      label: "Axe throw",
      color: colorForWeapon(weaponId),
      trailColor: colorForWeapon(weaponId),
      originX: start.x,
      originY: start.y,
      status: weapon.secondary.status,
      hits: [],
    };
    this.projectiles.push(projectile);
    this.axeThrows.set(context.ownerId, projectile.id);
    this.addEffect("tracer", start.x, start.y, start.x + aim.x * 92, start.y + aim.y * 92, colorForWeapon(weaponId), "Throw");
    this.queueSound("axe-throw");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "throw", start, aim, "Throw", context.now));
    return { kind: "fired", weaponId, label: "Throw" };
  }

  private activeAxeProjectile(ownerId: string): Projectile | undefined {
    const projectileId = this.axeThrows.get(ownerId);
    const projectile = projectileId ? this.projectiles.find((item) => item.id === projectileId) : undefined;
    if (!projectile) {
      this.axeThrows.delete(ownerId);
    }
    return projectile;
  }

  private activeRocket(ownerId: string): Projectile | undefined {
    const projectileId = this.rockets.get(ownerId);
    const projectile = projectileId ? this.projectiles.find((item) => item.id === projectileId) : undefined;
    if (!projectile) {
      this.rockets.delete(ownerId);
    }
    return projectile;
  }

  private hasMissingHands(ownerId: string): boolean {
    return this.combatants.get(ownerId)?.statuses.some((status) => status.id === "handsMissing") ?? false;
  }

  private recallAxe(context: WeaponUseContext, projectile: Projectile): WeaponUseResult {
    const owner = this.combatants.get(context.ownerId);
    const target = owner ?? {
      x: context.player.x,
      y: context.player.y,
      width: context.player.width,
      height: context.player.height,
    };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const direction = normalize({ x: targetCenter.x - projectile.x, y: targetCenter.y - projectile.y });
    projectile.vx = direction.x * 1120;
    projectile.vy = direction.y * 1120;
    projectile.gravity = 0;
    projectile.bounces = 0;
    projectile.pierce = 9;
    projectile.radius = Math.max(projectile.radius, 18);
    projectile.damage = 34;
    projectile.knockback = { x: direction.x * 560, y: direction.y * 300 - 120 };
    projectile.stun = 0.34;
    projectile.age = 0;
    projectile.lifetime = 2;
    projectile.label = "RETURNING AXE";
    projectile.color = "#d9f7ff";
    projectile.trailColor = "#5ad7ff";
    projectile.hits = [];
    this.addEffect("lightning", projectile.x, projectile.y, targetCenter.x, targetCenter.y, "#5ad7ff", "Recall");
    this.queueSound("axe-recall");
    this.recentEvents.push(this.createEvent(context.ownerId, "axe", "throw", { x: projectile.x, y: projectile.y }, direction, "Recall", context.now));
    return { kind: "utility", weaponId: "axe", label: "Recall" };
  }

  private throwCurrentWeapon(ownerId: string, player: PlayerPhysicsState, aimInput: Vec2, now: number, emptyToss: boolean): WeaponUseResult {
    const weaponId = this.inventory.equippedWeapon;
    const weapon = weaponRegistry.get(weaponId);
    const aim = normalize(aimInput);
    const start = this.muzzle(player);
    if (weaponId === "axe") {
      return this.throwAxe({ ownerId, player, aim: aimInput, now, heldMs: 0, isNewPress: true });
    }
    if (weaponId === "knife") {
      const cooldown = this.inventory.cooldowns.knife ?? 0;
      if (cooldown > 0) {
        return { kind: "blocked", weaponId, label: "Throw cooldown" };
      }
      this.inventory.cooldowns.knife = weapon.secondary.cooldown;
      this.applySelfRecoil(player, aim, 84, 22);
      this.addEffect("muzzle", start.x, start.y, start.x + aim.x * 28, start.y + aim.y * 18, colorForWeapon(weaponId), "Throw");
    }
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
      this.removeThrownWeaponFromInventory(weaponId);
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
      lifetime: weaponId === "knife" ? weapon.secondary.range / Math.max(weapon.throw.speed, 1) : 0.85,
      gravity: weaponId === "knife" ? 120 : 900,
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

  private updateHolyBazookaAmmo(dt: number, players: PlayerPhysicsState[]): void {
    const ammo = this.inventory.ammo["holy-bazooka"];
    if (!ammo) {
      return;
    }

    this.holyBazookaAmmoSpawnTimer -= dt;
    while (this.holyBazookaAmmoSpawnTimer <= 0) {
      this.holyBazookaAmmoSpawnTimer += holyBazookaAmmoSpawnSeconds;
      if (this.ammoPickups.length < holyBazookaMaxAmmoPickups) {
        this.spawnHolyBazookaAmmoPickup(players);
      }
    }

    for (const pickup of this.ammoPickups) {
      pickup.age += dt;
    }

    for (const pickup of [...this.ammoPickups]) {
      if (pickup.weaponId !== "holy-bazooka") {
        continue;
      }
      if (ammo.magazine >= holyBazookaMaxLoadedAmmo) {
        continue;
      }
      for (const player of players) {
        const center = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
        if (Math.hypot(center.x - pickup.x, center.y - pickup.y) > holyBazookaPickupRadius) {
          continue;
        }
        ammo.magazine = Math.min(holyBazookaMaxLoadedAmmo, ammo.magazine + 1);
        const index = this.ammoPickups.indexOf(pickup);
        if (index >= 0) {
          this.ammoPickups.splice(index, 1);
        }
        this.addEffect("pickup", pickup.x, pickup.y, pickup.x, pickup.y - 34, colorForWeapon("holy-bazooka"), "+1 HOLY");
        this.addEffect("aura", pickup.x, pickup.y, pickup.x, pickup.y - 32, "#ffffff", "AMMO");
        this.queueSound("holy-bazooka-pickup");
        break;
      }
    }

    removeWhere(this.ammoPickups, (pickup) => pickup.age > 45);
  }

  private spawnHolyBazookaAmmoPickup(players: PlayerPhysicsState[]): void {
    const offsets = [-760, -480, -180, 160, 460, 740, 0, 620];
    const anchor = players[this.holyBazookaAmmoSpawnIndex % Math.max(players.length, 1)];
    const anchorX = anchor ? anchor.x + anchor.width / 2 : 0;
    const x = clamp(anchorX + offsets[this.holyBazookaAmmoSpawnIndex % offsets.length], DEFAULT_PHYSICS.platformLeft + 80, DEFAULT_PHYSICS.platformRight - 80);
    const y = DEFAULT_PHYSICS.groundY - 20;
    this.holyBazookaAmmoSpawnIndex += 1;
    this.ammoPickups.push({
      id: this.makeId("ammo"),
      weaponId: "holy-bazooka",
      x,
      y,
      age: 0,
    });
    this.addEffect("aura", x, y, x, y - 42, colorForWeapon("holy-bazooka"), "HOLY AMMO");
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
          combatant.invulnerable = Math.max(combatant.invulnerable, respawnInvulnerabilityDuration);
          combatant.statuses = [];
        }
        continue;
      }
      if (combatant.y > VOID_DEATH_Y) {
        this.startRespawn(combatant, "VOID");
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
      if (combatant.statuses.some((status) => status.id === "deathFrozen")) {
        combatant.velocityX = 0;
        combatant.velocityY = Math.max(combatant.velocityY, 260);
        combatant.velocityY += DEFAULT_PHYSICS.gravity * dt * deathFrozenGravityMultiplier;
        combatant.hitstun = Math.max(combatant.hitstun, 0.1);
      }
      combatant.hitstun = Math.max(0, combatant.hitstun - dt);
      combatant.invulnerable = Math.max(0, combatant.invulnerable - dt);
      combatant.x += combatant.velocityX * dt;
      combatant.y += combatant.velocityY * dt;
      combatant.velocityX *= Math.max(0, 1 - dt * 5);
      combatant.velocityY += DEFAULT_PHYSICS.gravity * dt;
      const ground = DEFAULT_PHYSICS.groundY - combatant.height;
      if (combatant.y > ground && isOverPlatform(combatant)) {
        combatant.y = ground;
        combatant.velocityY = 0;
      }
      if (combatant.y > VOID_DEATH_Y) {
        this.startRespawn(combatant, "VOID");
      }
    }
  }

  private startRespawn(target: Combatant, label: string): void {
    target.hp = 0;
    target.respawnTimer = respawnDelay;
    target.hitstun = 0;
    target.invulnerable = respawnDelay;
    target.velocityX = 0;
    target.velocityY = 0;
    target.x = target.spawnX;
    target.y = target.spawnY;
    target.statuses = target.statuses.filter((status) => status.id === "holyBuff" || status.id === "blessed");
    this.addEffect("shockwave", target.spawnX + target.width / 2, target.spawnY + target.height / 2, target.spawnX + target.width / 2, target.spawnY - 72, "#72b7ff", label);
    this.queueSound("respawn");
  }

  private updateProjectiles(dt: number, players: PlayerPhysicsState[]): void {
    for (const projectile of this.projectiles) {
      if (projectile.weaponId === "rocket") {
        this.updateRocketProjectile(projectile, dt, players);
        continue;
      }
      if (projectile.weaponId === "holy-bazooka") {
        this.updateHolyBazookaProjectile(projectile, dt);
        continue;
      }
      if (projectile.weaponId === "hands") {
        this.updateHandProjectile(projectile, dt);
        continue;
      }
      projectile.age += dt;
      const returningAxe = projectile.weaponId === "axe" && projectile.label === "RETURNING AXE";
      if (returningAxe) {
        this.steerReturningAxe(projectile);
      }
      const previousX = projectile.x;
      const previousY = projectile.y;
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
          if (projectile.weaponId === "slingshot" || projectile.weaponId === "revolver" || projectile.weaponId === "axe") {
            projectile.damage = Math.max(1, Math.round(projectile.damage * 0.8));
            this.addEffect("spark", projectile.x, projectile.y, projectile.x + projectile.vx * 0.04, projectile.y - 12, colorForWeapon(projectile.weaponId), projectile.weaponId === "revolver" ? "Ricochet" : projectile.weaponId === "axe" ? "Axe Bounce" : "Bounce");
            this.queueSound(projectile.weaponId === "slingshot" ? "slingshot-bounce" : projectile.weaponId === "axe" ? "axe-impact" : "revolver-shot");
          }
        } else if (projectile.weaponId === "knife" && projectile.id.startsWith("throw")) {
          this.addEffect("spark", projectile.x, projectile.y, projectile.x, projectile.y - 18, colorForWeapon("knife"), "Stick");
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
      if (projectile.visualOnly) {
        continue;
      }
      for (const target of this.combatants.values()) {
        if (target.id === projectile.ownerId || projectile.hits.includes(target.id)) {
          continue;
        }
        const bounds = returningAxe ? sweptProjectileBounds(projectile, previousX, previousY) : projectileBounds(projectile);
        if (intersectsRect(bounds, target)) {
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
              this.addEffect("spark", projectile.x, projectile.y, projectile.x, projectile.y - 18, colorForWeapon("knife"), "Stick");
              this.queueSound("knife-hit");
            }
            if (projectile.weaponId === "axe" && projectile.id.startsWith("throw")) {
              this.addEffect(projectile.label === "RETURNING AXE" ? "lightning" : "spark", projectile.x, projectile.y, projectile.x + normalize(projectile.knockback).x * 30, projectile.y - 10, projectile.trailColor, projectile.label === "RETURNING AXE" ? "RETURNING AXE" : "Heavy Hit");
              this.queueSound("axe-hit");
              this.queueSound("axe-impact");
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
      if (returningAxe && projectile.age <= projectile.lifetime) {
        this.catchReturningAxe(projectile);
      }
    }
    const xLimit = 2400 + COMBAT_TUNING.projectiles.cleanupPadding;
    removeWhere(this.projectiles, (projectile) => projectile.age > projectile.lifetime
      || projectile.y > COMBAT_TUNING.projectiles.floorY + COMBAT_TUNING.projectiles.cleanupPadding
      || projectile.x < -xLimit
      || projectile.x > xLimit);
    for (const [ownerId, projectileId] of [...this.axeThrows.entries()]) {
      if (!this.projectiles.some((projectile) => projectile.id === projectileId)) {
        this.axeThrows.delete(ownerId);
      }
    }
    for (const [ownerId, projectileId] of [...this.rockets.entries()]) {
      if (!this.projectiles.some((projectile) => projectile.id === projectileId)) {
        this.rockets.delete(ownerId);
      }
    }
  }

  private updateHolyBazookaProjectile(projectile: Projectile, dt: number): void {
    projectile.age += dt;
    const previousX = projectile.x;
    const previousY = projectile.y;
    if (!projectile.visualOnly) {
      const target = this.findNearestHolyBazookaTarget(projectile);
      if (target) {
        const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height * 0.36 };
        const desired = normalize({ x: targetCenter.x - projectile.x, y: targetCenter.y - projectile.y });
        const current = normalize({ x: projectile.vx, y: projectile.vy });
        const turn = Math.min(1, (projectile.homingStrength ?? holyBazookaHomingStrength) * dt);
        const blended = normalize({
          x: lerp(current.x, desired.x, turn),
          y: lerp(current.y, desired.y, turn),
        });
        const speed = clamp(Math.hypot(projectile.vx, projectile.vy) + dt * 120, holyBazookaMissileSpeed, holyBazookaMissileMaxSpeed);
        projectile.vx = blended.x * speed;
        projectile.vy = blended.y * speed;
        projectile.targetId = target.id;
      }
    }

    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    const direction = normalize({ x: projectile.vx, y: projectile.vy });
    this.addEffect("tracer", projectile.x, projectile.y, projectile.x - direction.x * 74, projectile.y - direction.y * 44, projectile.visualOnly ? "#fff4a8" : colorForWeapon("holy-bazooka"), "HOLY TRAIL");

    if (projectile.visualOnly) {
      if (projectile.age > projectile.lifetime || projectile.y >= COMBAT_TUNING.projectiles.floorY - projectile.radius) {
        projectile.age = projectile.lifetime + 1;
      }
      return;
    }

    const swept = sweptProjectileBounds(projectile, previousX, previousY);
    for (const target of this.combatants.values()) {
      if (target.id === projectile.ownerId || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      if (intersectsRect(swept, target)) {
        projectile.x = target.x + target.width / 2;
        projectile.y = target.y + target.height / 2;
        this.explodeHolyBazooka(projectile);
        return;
      }
    }

    const groundY = COMBAT_TUNING.projectiles.floorY - projectile.radius;
    if (projectile.y >= groundY && projectile.age > 0.12) {
      projectile.y = groundY;
      this.explodeHolyBazooka(projectile);
      return;
    }
    if (projectile.age > projectile.lifetime) {
      this.explodeHolyBazooka(projectile);
    }
  }

  private findNearestHolyBazookaTarget(projectile: Projectile): Combatant | undefined {
    let nearest: { target: Combatant; distance: number } | undefined;
    for (const target of this.combatants.values()) {
      if (target.id === projectile.ownerId || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      const distance = Math.hypot(target.x + target.width / 2 - projectile.x, target.y + target.height / 2 - projectile.y);
      if (distance > 1500) {
        continue;
      }
      if (!nearest || distance < nearest.distance) {
        nearest = { target, distance };
      }
    }
    return nearest?.target;
  }

  private explodeHolyBazooka(projectile: Projectile): void {
    if (projectile.age > projectile.lifetime + 0.5) {
      return;
    }
    const before = new Map<string, number>();
    for (const target of this.combatants.values()) {
      if (target.id !== projectile.ownerId && target.respawnTimer <= 0 && target.hp > 0) {
        before.set(target.id, target.hp);
      }
    }
    this.applyExplosionDamage({
      sourceId: projectile.ownerId,
      weaponId: "holy-bazooka",
      x: projectile.x,
      y: projectile.y,
      radius: holyBazookaExplosionRadius,
      centerDamage: holyBazookaExplosionCenterDamage,
      edgeDamage: holyBazookaExplosionEdgeDamage,
      centerKnockback: holyBazookaExplosionCenterKnockback,
      edgeKnockback: holyBazookaExplosionEdgeKnockback,
      centerStun: holyBazookaExplosionCenterStun,
      edgeStun: holyBazookaExplosionEdgeStun,
      label: "Holy Bazooka Explosion",
    });
    let capturedHealth = 0;
    for (const [id, hpBefore] of before.entries()) {
      const target = this.combatants.get(id);
      capturedHealth += Math.max(0, hpBefore - (target?.hp ?? 0));
    }
    this.applyHolyBazookaHealthSteal(projectile.ownerId, capturedHealth);
    this.queueSound("holy-bazooka-explode");
    projectile.age = projectile.lifetime + 1;
  }

  private applyHolyBazookaHealthSteal(ownerId: string, capturedHealth: number): void {
    const owner = this.combatants.get(ownerId);
    if (!owner || capturedHealth <= 0) {
      return;
    }
    if (owner.respawnTimer > 0) {
      owner.respawnTimer = 0;
      owner.invulnerable = Math.max(owner.invulnerable, 0.6);
    }
    if (capturedHealth > Math.max(1, owner.hp)) {
      owner.maxHp = Math.min(holyBazookaMaxHpCap, owner.maxHp + Math.round(capturedHealth));
    }
    const heal = capturedHealth > owner.hp
      ? Math.max(45, Math.round(capturedHealth * 0.65))
      : Math.round(capturedHealth);
    owner.hp = Math.min(owner.maxHp, Math.max(1, owner.hp) + heal);
    owner.statuses = upsertStatusEffect(owner.statuses, createStatus("holyBuff"));
    const cx = owner.x + owner.width / 2;
    const cy = owner.y + owner.height / 2;
    this.addEffect("aura", cx, cy, cx, cy - 72, colorForWeapon("holy-bazooka"), "HEALTH STEAL");
    this.addEffect("spark", cx - 14, owner.y + owner.height - 4, cx - 14, owner.y - 24, "#fff4a8", `+${Math.round(capturedHealth)}`);
  }

  private updateRocketProjectile(projectile: Projectile, dt: number, players: PlayerPhysicsState[]): void {
    projectile.age += dt;
    const groundY = COMBAT_TUNING.projectiles.floorY - projectile.radius;
    if (projectile.visualOnly) {
      if (projectile.state === "resting") {
        projectile.y = groundY;
        return;
      }
      const facing = Math.sign(projectile.vx || projectile.ownerFacing || 1);
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      this.addEffect("tracer", projectile.x, projectile.y, projectile.x - facing * 58, projectile.y + 5, "#ff8f3d", projectile.state === "chaotic" ? "Chaotic" : "Rocket Fire");
      if (projectile.y >= groundY) {
        projectile.y = groundY;
        projectile.age = projectile.lifetime + 1;
      }
      return;
    }
    if (projectile.state === "resting") {
      projectile.y = groundY;
      if (projectile.age > projectile.lifetime) {
        projectile.age = projectile.lifetime + 1;
      }
      return;
    }

    const previousX = projectile.x;
    const previousY = projectile.y;
    if (projectile.age > 0.55 || projectile.state === "chaotic") {
      projectile.state = "chaotic";
      projectile.chaos = (projectile.chaos ?? 0) + dt;
      const facing = Math.sign(projectile.vx || projectile.ownerFacing || 1);
      projectile.vx = facing * (rocketChaosSpeed + Math.min(260, (projectile.chaos ?? 0) * 180));
      projectile.vy += Math.sin(projectile.age * 10 + projectile.id.length) * 260 * dt - 90 * dt;
      projectile.label = "ROCKET LIT";
      this.addEffect("tracer", projectile.x, projectile.y, projectile.x - facing * 70, projectile.y + Math.sin(projectile.age * 14) * 30, "#ffcf5a", "Chaotic");
    } else {
      this.addEffect("tracer", projectile.x, projectile.y, projectile.x - Math.sign(projectile.vx || 1) * 58, projectile.y + 5, "#ff8f3d", "Rocket Fire");
    }

    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    if (projectile.riderId) {
      const player = players.find((item) => item.id === projectile.riderId);
      const rider = this.combatants.get(projectile.riderId);
      const rideX = projectile.x - (player?.width ?? rider?.width ?? DEFAULT_PHYSICS.width) / 2;
      const rideY = projectile.y - (player?.height ?? rider?.height ?? DEFAULT_PHYSICS.height) - 7;
      if (player) {
        player.x = rideX;
        player.y = rideY;
        player.velocityX = projectile.vx;
        player.velocityY = projectile.vy;
        player.grounded = false;
      }
      if (rider) {
        rider.x = rideX;
        rider.y = rideY;
        rider.velocityX = projectile.vx;
        rider.velocityY = projectile.vy;
      }
    }

    const swept = sweptProjectileBounds(projectile, previousX, previousY);
    for (const target of this.combatants.values()) {
      if (target.id === projectile.ownerId || target.respawnTimer > 0) {
        continue;
      }
      if (intersectsRect(swept, target)) {
        projectile.x = target.x + target.width / 2;
        projectile.y = target.y + target.height / 2;
        this.explodeRocket(projectile);
        return;
      }
    }
    if (projectile.y >= groundY && projectile.age > 0.18) {
      projectile.y = groundY;
      this.explodeRocket(projectile);
      return;
    }
    if (projectile.age > projectile.lifetime) {
      this.explodeRocket(projectile);
    }
  }

  private explodeRocket(projectile: Projectile): void {
    if (projectile.age > projectile.lifetime + 0.5) {
      return;
    }
    this.applyExplosionDamage({
      sourceId: projectile.ownerId,
      weaponId: "rocket",
      x: projectile.x,
      y: projectile.y,
      radius: rocketExplosionRadius,
      centerDamage: rocketExplosionCenterDamage,
      edgeDamage: rocketExplosionEdgeDamage,
      centerKnockback: rocketExplosionCenterKnockback,
      edgeKnockback: rocketExplosionEdgeKnockback,
      centerStun: rocketExplosionCenterStun,
      edgeStun: rocketExplosionEdgeStun,
      label: "Rocket Explosion",
    });
    this.queueSound("rocket-explode");
    this.rockets.delete(projectile.ownerId);
    projectile.age = projectile.lifetime + 1;
  }

  private updateHandProjectile(projectile: Projectile, dt: number): void {
    projectile.age += dt;
    if (projectile.visualOnly) {
      projectile.x += projectile.vx * dt;
      projectile.y = COMBAT_TUNING.projectiles.floorY - projectile.radius;
      if (projectile.age % 0.5 < dt) {
        this.addEffect("spark", projectile.x, projectile.y, projectile.x - Math.sign(projectile.vx || 1) * 14, projectile.y, colorForWeapon("hands"), "Skitter");
      }
      return;
    }
    const target = this.findNearestHandTarget(projectile);
    if (!target) {
      projectile.x += projectile.vx * dt;
      projectile.y = COMBAT_TUNING.projectiles.floorY - projectile.radius;
      return;
    }
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height * 0.28 };
    const direction = normalize({ x: targetCenter.x - projectile.x, y: targetCenter.y - projectile.y });
    const lunge = Math.hypot(targetCenter.x - projectile.x, targetCenter.y - projectile.y) < 62;
    projectile.vx = direction.x * (lunge ? 210 : 118);
    projectile.vy = lunge ? direction.y * 180 - 60 : 0;
    projectile.x += projectile.vx * dt;
    projectile.y = lunge ? projectile.y + projectile.vy * dt : COMBAT_TUNING.projectiles.floorY - projectile.radius;
    this.addEffect("spark", projectile.x, projectile.y, projectile.x - direction.x * 14, projectile.y, colorForWeapon("hands"), lunge ? "LUNGE" : "Skitter");
    if (projectile.age % 0.5 < dt) {
      this.queueSound("hand-skitter");
    }
    if (intersectsRect(projectileBounds(projectile), target)) {
      this.attachHand(projectile, target);
    }
    if (projectile.age > projectile.lifetime) {
      projectile.age = projectile.lifetime + 1;
    }
  }

  private findNearestHandTarget(projectile: Projectile): Combatant | undefined {
    let nearest: { target: Combatant; distance: number } | undefined;
    for (const target of this.combatants.values()) {
      if (target.id === projectile.ownerId || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      const distance = Math.hypot(target.x + target.width / 2 - projectile.x, target.y + target.height / 2 - projectile.y);
      if (!nearest || distance < nearest.distance) {
        nearest = { target, distance };
      }
    }
    return nearest?.target;
  }

  private attachHand(projectile: Projectile, target: Combatant): void {
    const existing = this.handAttachments.get(target.id) ?? { ownerId: projectile.ownerId, attached: 0, resist: 0 };
    existing.attached = Math.min(5, existing.attached + 1);
    existing.ownerId = projectile.ownerId;
    existing.resist = 0;
    this.handAttachments.set(target.id, existing);
    target.statuses = upsertStatusEffect(target.statuses, createStatus("scrambled"));
    target.hitstun = Math.max(target.hitstun, 0.12);
    this.addEffect("stun", target.x + target.width / 2, target.y + 8, target.x + target.width / 2, target.y - 18, colorForWeapon("hands"), "FACE HAND");
    this.queueSound("hand-attach");
    this.recentEvents.push(this.createEvent(projectile.ownerId, "hands", "hit", { x: target.x + target.width / 2, y: target.y + 10 }, { x: 0, y: -1 }, "Hand Attach", performanceNow(), {
      targetId: target.id,
      damage: 0,
      kx: 0,
      ky: 0,
      stun: 0.12,
      status: "scrambled",
    }));
    projectile.age = projectile.lifetime + 1;
  }

  private steerReturningAxe(projectile: Projectile): void {
    const owner = this.combatants.get(projectile.ownerId);
    if (!owner) {
      return;
    }
    const ownerCenter = { x: owner.x + owner.width / 2, y: owner.y + owner.height / 2 };
    const direction = normalize({ x: ownerCenter.x - projectile.x, y: ownerCenter.y - projectile.y });
    projectile.vx = direction.x * 1120;
    projectile.vy = direction.y * 1120;
    projectile.gravity = 0;
    projectile.knockback = { x: direction.x * 560, y: direction.y * 300 - 120 };
    projectile.pulseTimer = (projectile.pulseTimer ?? 0) - 1 / 60;
    if ((projectile.pulseTimer ?? 0) <= 0) {
      this.addEffect("tracer", projectile.x, projectile.y, ownerCenter.x, ownerCenter.y, projectile.trailColor, "RETURNING AXE");
      projectile.pulseTimer = 0.08;
    }
  }

  private catchReturningAxe(projectile: Projectile): boolean {
    const owner = this.combatants.get(projectile.ownerId);
    if (!owner) {
      return false;
    }
    const ownerCenter = { x: owner.x + owner.width / 2, y: owner.y + owner.height / 2 };
    if (Math.hypot(ownerCenter.x - projectile.x, ownerCenter.y - projectile.y) > 34) {
      return false;
    }
    this.addEffect("spark", ownerCenter.x, ownerCenter.y, ownerCenter.x, ownerCenter.y - 28, projectile.trailColor, "Caught");
    this.queueSound("axe-recall");
    this.axeThrows.delete(projectile.ownerId);
    projectile.age = projectile.lifetime + 1;
    return true;
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
          const macheteHit = hitbox.weaponId === "machete";
          const axeHit = hitbox.weaponId === "axe";
          const superLegsHit = hitbox.weaponId === "super-legs";
          const tipHit = whipHit && isWhipTipHit(hitbox, target);
          const macheteTipHit = macheteHit && isWhipTipHit(hitbox, target);
          const axeTipHit = axeHit && hitbox.label !== "Axe Rush" && isWhipTipHit(hitbox, target);
          const combo = whipHit ? this.registerWhipHit(target.id) : { count: 0, pulled: false };
          const rodEmpowered = rodHit && owner?.statuses.some((status) => status.id === "empowered");
          const backstab = knifeHit && owner ? isBackstab(owner, target, hitbox.knockback.x) : false;
          const pull = whipHit && combo.pulled && owner
            ? {
                x: Math.sign((owner.x + owner.width / 2) - (target.x + target.width / 2)) * 380,
                y: -135,
              }
            : undefined;
          const damage = whipHit && tipHit
            ? hitbox.damage + 4
            : rodEmpowered
              ? hitbox.damage + 6
              : knifeHit && backstab
                ? hitbox.damage + 5
                : macheteTipHit
                  ? hitbox.damage + 4
                  : axeTipHit
                    ? hitbox.damage + 5
                    : hitbox.damage;
          const stun = whipHit && tipHit
            ? hitbox.stun + 0.14
            : rodEmpowered
              ? hitbox.stun + 0.12
              : knifeHit && backstab
                ? hitbox.stun + 0.08
                : macheteTipHit
                  ? hitbox.stun + 0.05
                  : axeTipHit
                    ? hitbox.stun + 0.07
                    : hitbox.lowTrip ? Math.max(hitbox.stun, 0.32) : hitbox.stun;
          const hitY = clamp(hitbox.y + hitbox.height / 2, target.y, target.y + target.height - 1);
          const hit = this.applyDamage({
            sourceId: hitbox.ownerId,
            targetId: target.id,
            damage,
            knockback: pull ?? (rodHit ? { x: hitbox.knockback.x * 1.28, y: hitbox.knockback.y - 75 } : hitbox.knockback),
            stun,
            label: combo.pulled ? "Whip Pull" : tipHit ? "Tip Crack" : rodHit ? "Electrocute" : knifeHit && backstab ? `${hitbox.label} Backstab` : macheteTipHit ? "Tip Cleave" : axeTipHit ? "Axe Head" : hitbox.label,
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
            if (macheteHit) {
              const growth = this.growMachete(hitbox.ownerId, hit.remainingHp <= 0);
              this.queueSound("machete-hit");
              this.addEffect("spark", target.x + target.width / 2, hitY, target.x + target.width / 2 + Math.sign(hitbox.knockback.x || 1) * 26, hitY, macheteColor(growth.redness), hit.remainingHp <= 0 ? "Growth KO" : macheteTipHit ? "Tip" : "Cleave");
            }
            if (axeHit) {
              this.queueSound("axe-hit");
              this.queueSound("axe-impact");
              this.addEffect("spark", target.x + target.width / 2, hitY, target.x + target.width / 2 + Math.sign(hitbox.knockback.x || 1) * 30, hitY, colorForWeapon(hitbox.weaponId), axeTipHit ? "Head" : "Chop");
            }
            if (superLegsHit) {
              this.queueSound(hitbox.heavy ? "ground-slam-impact" : "head-stomp");
              this.addEffect(hitbox.heavy ? "shockwave" : "stomp", target.x + target.width / 2, hitY, target.x + target.width / 2 + Math.sign(hitbox.knockback.x || 1) * 34, hitY + 10, colorForWeapon(hitbox.weaponId), hitbox.label);
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

  private updateAxeRushes(dt: number, players: PlayerPhysicsState[]): void {
    for (const [ownerId, rush] of [...this.axeRushes.entries()]) {
      const player = players.find((item) => item.id === ownerId);
      const owner = this.combatants.get(ownerId);
      const target = this.combatants.get(rush.targetId);
      if (!player || !owner || !target || target.hp <= 0 || target.respawnTimer > 0) {
        this.axeRushes.delete(ownerId);
        continue;
      }

      rush.timer -= dt;
      const playerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
      const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
      const delta = { x: targetCenter.x - playerCenter.x, y: targetCenter.y - playerCenter.y };
      const distance = Math.hypot(delta.x, delta.y);
      const direction = normalize(delta);
      player.facing = direction.x >= 0 ? 1 : -1;
      player.velocityX = direction.x * axeRushSpeed;
      player.velocityY = direction.y * axeRushSpeed * 0.18;
      const travel = Math.min(Math.max(0, distance - axeRushHitDistance), axeRushSpeed * dt);
      player.x += direction.x * travel;
      player.y += direction.y * travel;
      owner.x = player.x;
      owner.y = player.y;
      owner.velocityX = player.velocityX;
      owner.velocityY = player.velocityY;

      if (distance - travel <= axeRushHitDistance || rush.timer <= 0) {
        this.spawnAxeRushHitbox(ownerId, player, direction);
        this.inventory.cooldowns.axe = Math.max(this.inventory.cooldowns.axe ?? 0, 0.48);
        this.axeRushes.delete(ownerId);
      } else {
        this.axeRushes.set(ownerId, rush);
      }
    }
  }

  private spawnAxeRushHitbox(ownerId: string, player: PlayerPhysicsState, direction: Vec2): void {
    const center = this.muzzle(player);
    const width = 104;
    const height = 52;
    const facing = Math.sign(direction.x || player.facing) || 1;
    this.hitboxes.push({
      id: this.makeId("hit"),
      ownerId,
      weaponId: "axe",
      x: facing >= 0 ? center.x : center.x - width,
      y: center.y - height / 2,
      width,
      height,
      damage: 30,
      knockback: { x: facing * 430, y: -125 },
      stun: 0.34,
      age: 0,
      duration: 0.18,
      label: "Axe Rush",
      color: colorForWeapon("axe"),
      status: "bleed",
      heavy: true,
      hits: [],
    });
    this.addEffect("whip", center.x, center.y, center.x + facing * width, center.y, colorForWeapon("axe"), "Axe Rush");
    this.queueSound("axe-swing");
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
      if (state.empoweredTimer > 0) {
        state.empoweredTimer = Math.max(0, state.empoweredTimer - dt);
      }
      if (state.empoweredTimer === 0 && owner?.statuses.some((status) => status.id === "empowered")) {
        this.clearStatus(ownerId, "empowered");
      }
      if (!owner || state.empoweredTimer <= 0 || !owner.statuses.some((status) => status.id === "empowered")) {
        continue;
      }
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

  private updateDeathAuras(dt: number): void {
    for (const [ownerId, state] of this.deathAuras.entries()) {
      const owner = this.combatants.get(ownerId);
      if (state.cooldownTimer > 0 && !state.active) {
        state.cooldownTimer = Math.max(0, state.cooldownTimer - dt);
        this.inventory.cooldowns["death-aura"] = state.cooldownTimer;
      }
      if (!owner || owner.respawnTimer > 0 || !state.active) {
        continue;
      }
      state.activeTimer = Math.max(0, state.activeTimer - dt);
      const power = deathAuraPower(owner, state);
      const radius = deathAuraRadius(power);
      if (state.activeTimer === 0) {
        state.active = false;
        state.cooldownTimer = deathAuraCooldownDuration;
        this.inventory.cooldowns["death-aura"] = state.cooldownTimer;
        this.addEffect("aura", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y + owner.height / 2 - radius, deathAuraColor(power), "DEATH RECALL");
        this.queueSound("death-aura");
        continue;
      }
      for (const [targetId, timer] of [...state.tickCooldowns.entries()]) {
        const next = Math.max(0, timer - dt);
        if (next === 0) {
          state.tickCooldowns.delete(targetId);
        } else {
          state.tickCooldowns.set(targetId, next);
        }
      }
      state.pulseTimer = Math.max(0, state.pulseTimer - dt);
      if (state.pulseTimer === 0) {
        state.pulseTimer = 0.22;
        this.addEffect("aura", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y + owner.height / 2 - radius, deathAuraColor(power), "DEATH AURA");
      }
      for (const target of this.combatants.values()) {
        if (target.id === ownerId || target.respawnTimer > 0 || state.tickCooldowns.has(target.id)) {
          continue;
        }
        const ox = owner.x + owner.width / 2;
        const oy = owner.y + owner.height / 2;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        if (Math.hypot(tx - ox, ty - oy) > radius) {
          continue;
        }
        const previousInvulnerable = target.invulnerable;
        target.invulnerable = 0;
        target.velocityX = 0;
        target.velocityY = Math.max(target.velocityY, 190 + power * 170);
        const damage = Math.round(lerp(deathAuraBaseDamage, deathAuraMaxDamage, power));
        const stun = lerp(deathAuraBaseFreeze, deathAuraMaxFreeze, power);
        const hit = this.applyDamage({
          sourceId: ownerId,
          targetId: target.id,
          weaponId: "death-aura",
          damage,
          knockback: { x: Math.sign(tx - ox || 1) * (60 + power * 120), y: -40 },
          stun,
          label: "Death Aura",
          status: "deathFrozen",
          skipHitLocationScaling: true,
        });
        const frozen = target.statuses.find((status) => status.id === "deathFrozen");
        if (frozen) {
          frozen.duration = Math.max(frozen.duration, stun);
        }
        if (!hit.applied) {
          target.invulnerable = previousInvulnerable;
        }
        this.addEffect("stun", tx, target.y + 12, tx, target.y - 18, deathAuraColor(power), "FROZEN");
        this.queueSound("death-aura");
        state.tickCooldowns.set(target.id, lerp(0.68, 0.38, power));
      }
    }
  }

  private updateHandAttachments(): void {
    for (const [targetId, attachment] of [...this.handAttachments.entries()]) {
      const target = this.combatants.get(targetId);
      if (!target || target.respawnTimer > 0 || attachment.attached <= 0) {
        this.handAttachments.delete(targetId);
        continue;
      }
      if (!target.statuses.some((status) => status.id === "scrambled")) {
        target.statuses = upsertStatusEffect(target.statuses, createStatus("scrambled"));
      }
      this.addEffect("aura", target.x + target.width / 2, target.y + 9, target.x + target.width / 2, target.y - 18, colorForWeapon("hands"), "SCRAMBLED");
    }
  }

  private updatePositiveBuffVisuals(dt: number): void {
    for (const combatant of this.combatants.values()) {
      const timer = Math.max(0, (this.buffVisualTimers.get(combatant.id) ?? 0) - dt);
      if (timer > 0) {
        this.buffVisualTimers.set(combatant.id, timer);
        continue;
      }
      if (!hasPositiveBuff(combatant)) {
        continue;
      }
      this.buffVisualTimers.set(combatant.id, 0.22);
      const cx = combatant.x + combatant.width / 2;
      const cy = combatant.y + combatant.height / 2;
      this.addEffect("aura", cx, cy, cx, cy - 42, "#7cff6b", "BUFFED");
      this.addEffect("spark", cx - 12, combatant.y + combatant.height - 4, cx - 12, combatant.y - 10, "#7cff6b", "Buff");
    }
  }

  private updateBodyContact(_dt: number, players: PlayerPhysicsState[]): void {
    for (const player of players) {
      const owner = this.combatants.get(player.id);
      if (!owner) {
        continue;
      }
      const superLegsEquipped = owner.statuses.some((status) => status.id === "superLegs");
      for (const target of this.combatants.values()) {
        if (target.id === player.id || target.respawnTimer > 0) {
          continue;
        }

        if ((player.sliding || player.action === "slide" || player.action === "lowSlide") && intersectsRect(owner, target)) {
          const low = player.lowSliding || player.action === "lowSlide";
          this.applyBodyHit(player.id, target, low ? "low-slide" : "slide", {
            damage: superLegsEquipped ? (low ? 18 : 13) : low ? 11 : 7,
            knockback: {
              x: player.facing * (superLegsEquipped ? (low ? 760 : 540) : low ? 610 : 390),
              y: superLegsEquipped ? (low ? -780 : -560) : low ? COMBAT_TUNING.lowSlideTripPopUpForce : COMBAT_TUNING.slideTripPopUpForce,
            },
            stun: superLegsEquipped ? (low ? 0.88 : 0.62) : low ? 0.72 : 0.48,
            label: superLegsEquipped ? (low ? "Super Low Slide Trip" : "Super Slide Trip") : low ? "Low Slide Trip" : "Slide Trip",
            status: "tripped",
            sound: low ? "low-slide" : "player-stunned",
            effect: "trip",
            weaponId: superLegsEquipped ? "super-legs" : undefined,
            color: superLegsEquipped ? colorForWeapon("super-legs") : undefined,
          });
        }

        if (this.inventory.equippedWeapon === "knife" && intersectsRect(knifeContactRect(owner, player.facing), target)) {
          this.applyBodyHit(player.id, target, "knife-contact", {
            damage: knifeContactDamage,
            knockback: { x: player.facing * 92, y: -34 },
            stun: 0.06,
            label: "Knife Contact",
            status: "bleed",
            sound: "knife-contact",
            effect: "spark",
            weaponId: "knife",
            color: colorForWeapon("knife"),
            cooldown: knifeContactCooldown,
          });
        }

        if (this.inventory.equippedWeapon === "wings" && player.wingFlapping) {
          const ownerCenter = { x: owner.x + owner.width / 2, y: owner.y + owner.height / 2 };
          const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
          const dx = targetCenter.x - ownerCenter.x;
          const dy = targetCenter.y - ownerCenter.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= wingGustRadius) {
            const direction = normalize({ x: dx || player.facing || 1, y: dy || -0.25 });
            const heldScale = Math.min(1.45, 1 + (player.wingFlapHeldMs ?? 0) / 1400);
            const airScale = player.grounded ? 0.82 : 1.18;
            const force = 205 * heldScale * airScale;
            const pushed = this.applyWingGust(player.id, target, {
              x: direction.x * force,
              y: direction.y * force - 105,
            });
            if (pushed) {
              this.addEffect("aura", ownerCenter.x, ownerCenter.y, ownerCenter.x + direction.x * wingGustRadius, ownerCenter.y + direction.y * 18, colorForWeapon("wings"), "Wing Gust");
              this.addEffect("spark", targetCenter.x, targetCenter.y, targetCenter.x + direction.x * 34, targetCenter.y + direction.y * 20, colorForWeapon("wings"), "Wind");
            }
          }
        }

        const playerBottom = owner.y + owner.height;
        const horizontalOverlap = owner.x < target.x + target.width && owner.x + owner.width > target.x;
        const stompWindow = horizontalOverlap && player.velocityY > 180 && playerBottom >= target.y && playerBottom <= target.y + 28 && owner.y < target.y;
        if (stompWindow) {
          const hit = this.applyBodyHit(player.id, target, "stomp", {
            damage: superLegsEquipped ? 20 : COMBAT_TUNING.headStomp.damage,
            knockback: {
              x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * (superLegsEquipped ? 340 : 110),
              y: superLegsEquipped ? -620 : COMBAT_TUNING.headStomp.targetKnockdownForce,
            },
            stun: superLegsEquipped ? 0.5 : 0.34,
            label: superLegsEquipped ? "Super Head Stomp" : "Head Stomp",
            status: "daze",
            sound: "head-stomp",
            effect: "stomp",
            weaponId: superLegsEquipped ? "super-legs" : undefined,
            color: superLegsEquipped ? colorForWeapon("super-legs") : undefined,
          });
          if (hit) {
            player.velocityY = superLegsEquipped ? -980 : COMBAT_TUNING.headStomp.bounceForce;
            player.jumpsUsed = 1;
            player.airDiving = false;
            player.airDiveTimer = 0;
            player.airDiveUsed = false;
            player.groundSlamming = false;
            player.jumpBufferTimer = 0;
            player.coyoteTimer = 0;
            player.grounded = false;
            owner.velocityY = superLegsEquipped ? -980 : COMBAT_TUNING.headStomp.bounceForce;
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
            damage: superLegsEquipped ? 24 : 15,
            knockback: {
              x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * (superLegsEquipped ? 360 : 210),
              y: superLegsEquipped ? -560 : -280,
            },
            stun: superLegsEquipped ? 0.64 : 0.48,
            label: superLegsEquipped ? "Super Body Slam" : "Ground Slam",
            status: "daze",
            sound: "ground-slam-impact",
            effect: "slam",
            weaponId: superLegsEquipped ? "super-legs" : undefined,
            color: superLegsEquipped ? colorForWeapon("super-legs") : undefined,
          });
        }

        if (player.justSlamLanded) {
          const centerX = owner.x + owner.width / 2;
          const targetX = target.x + target.width / 2;
          const slamRadius = superLegsEquipped ? 235 : COMBAT_TUNING.groundSlam.radius;
          const distance = Math.abs(targetX - centerX);
          if (distance <= slamRadius && Math.abs((target.y + target.height) - DEFAULT_PHYSICS.groundY) <= 90) {
            const falloff = 1 - distance / slamRadius;
            const slamDamage = superLegsEquipped ? Math.round(lerp(16, 46, falloff)) : COMBAT_TUNING.groundSlam.damage;
            const slamKnockback = superLegsEquipped ? lerp(360, 760, falloff) : COMBAT_TUNING.groundSlam.knockback;
            const slamLift = superLegsEquipped ? -lerp(430, 720, falloff) : -320;
            this.applyBodyHit(player.id, target, "ground-slam-wave", {
              damage: slamDamage,
              knockback: { x: Math.sign(targetX - centerX || 1) * slamKnockback, y: slamLift },
              stun: superLegsEquipped ? lerp(0.5, 0.82, falloff) : COMBAT_TUNING.groundSlam.stun,
              label: superLegsEquipped ? "SUPER LEG SLAM" : "Slam Wave",
              status: "daze",
              sound: "ground-slam-impact",
              effect: "shockwave",
              weaponId: superLegsEquipped ? "super-legs" : undefined,
              color: superLegsEquipped ? colorForWeapon("super-legs") : undefined,
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

  private growMachete(ownerId: string, ko: boolean): MacheteRuntimeState {
    const state = this.machetes.get(ownerId) ?? { rangeBonus: 0, damageBonus: 0 };
    state.rangeBonus += ko ? macheteKoGrowth : macheteHitGrowth;
    if (ko) {
      state.damageBonus += macheteKoDamageBonus;
    }
    this.machetes.set(ownerId, state);
    return this.getMacheteState(ownerId);
  }

  private consumeVirginBloodRevive(target: Combatant): boolean {
    const state = this.virginBlood.get(target.id);
    if (!state?.reviveAvailable) {
      return false;
    }
    state.reviveAvailable = false;
    this.virginBlood.set(target.id, state);
    target.hp = target.maxHp;
    target.respawnTimer = 0;
    target.hitstun = 0;
    target.invulnerable = 1.15;
    target.velocityY = Math.min(target.velocityY, -360);
    target.statuses = target.statuses.filter((status) => status.id !== "blessed");
    target.statuses = upsertStatusEffect(target.statuses, createStatus("holyBuff"));
    target.statuses = upsertStatusEffect(target.statuses, createStatus("angelWings"));
    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    this.addEffect("shockwave", cx, cy, cx, cy - 150, colorForWeapon("virgin-blood"), "REVIVED");
    this.addEffect("aura", cx, cy, cx, cy - 90, "#ffffff", "Angel Wings");
    this.queueSound("virgin-blood-revive");
    return true;
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
    const rocketEffect = label === "Rocket Fire"
      || label === "Chaotic"
      || label === "BOOM"
      || label === "Smoke"
      || label === "EXPLOSION"
      || label === "FIREBALL"
      || label === "SMOKE CLOUD"
      || label === "DEBRIS"
      || label === "HOLY EXPLOSION"
      || label === "HOLY FIREBALL"
      || label === "HOLY SMOKE"
      || label === "HOLY BOOM"
      || label === "HOLY DEBRIS";
    const lingeringAura = label === "DEATH AURA" || label === "FROZEN" || label === "BUFFED";
    this.effects.push({
      id: this.makeId("fx"),
      kind,
      x,
      y,
      tx,
      ty,
      age: 0,
      duration: rocketEffect ? 1.35 : lingeringAura ? 0.9 : kind === "lightning" ? 0.42 : kind === "shockwave" ? 0.36 : kind === "aura" ? 0.34 : 0.24,
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

function aimedMeleeBox(
  player: PlayerPhysicsState,
  aim: Vec2,
  range: number,
  thickness: number,
  lowTrip: boolean,
): { x: number; y: number; width: number; height: number; start: Vec2; end: Vec2 } {
  const start = {
    x: player.x + player.width / 2,
    y: lowTrip ? player.y + player.height - 12 : player.y + 22,
  };
  const end = {
    x: start.x + aim.x * range,
    y: start.y + aim.y * range,
  };
  const padding = thickness / 2;
  const x = Math.min(start.x, end.x) - padding;
  const y = Math.min(start.y, end.y) - padding;
  return {
    x,
    y,
    width: Math.abs(end.x - start.x) + thickness,
    height: Math.abs(end.y - start.y) + thickness,
    start,
    end,
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

function knifeContactRect(owner: Combatant, facing: number): { x: number; y: number; width: number; height: number } {
  const reach = 20;
  const direction = Math.sign(facing || 1);
  return {
    x: direction >= 0 ? owner.x - 4 : owner.x - reach,
    y: owner.y + 4,
    width: owner.width + reach + 4,
    height: owner.height - 8,
  };
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
    case "machete":
      return "#9ee7c3";
    case "axe":
      return "#ffb35c";
    case "wings":
      return "#d9f7ff";
    case "virgin-blood":
      return "#fff4a8";
    case "death-aura":
      return "#08080c";
    case "rocket":
      return "#ff8f3d";
    case "holy-bazooka":
      return "#fff4a8";
    case "hands":
      return "#b8ffd0";
    case "super-legs":
      return "#7cff6b";
    default:
      return "#ffffff";
  }
}

function macheteRedness(state: MacheteGrowthState): number {
  return clamp(state.rangeBonus / 240 + state.damageBonus / 24, 0, 1);
}

function macheteColor(redness: number): string {
  const clamped = clamp(redness, 0, 1);
  const r = Math.round(158 + (255 - 158) * clamped);
  const g = Math.round(231 + (70 - 231) * clamped);
  const b = Math.round(195 + (88 - 195) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

function lightningDurationForHold(heldSeconds: number): number {
  const charge = clamp(heldSeconds, 0.16, lightningMaxHoldSeconds);
  return lightningDefaultEmpoweredDuration + charge * 11.5;
}

function lightningChargeColorForHold(heldSeconds: number): string {
  if (heldSeconds >= 3.8) {
    return "#b096ff";
  }
  if (heldSeconds >= 2.45) {
    return "#ff5c5c";
  }
  if (heldSeconds >= 1.25) {
    return "#5ad7ff";
  }
  return "#ffd84d";
}

function lightningSelfDamageForHold(heldSeconds: number): number {
  const charge = clamp(heldSeconds, 0.16, lightningMaxHoldSeconds);
  return Math.round(7 + charge * 10.5);
}

function deathAuraPower(owner: Combatant, state?: DeathAuraState): number {
  const missingHealthPower = 1 - owner.hp / Math.max(1, owner.maxHp);
  return clamp(Math.max(missingHealthPower, deathAuraPowerFromSuffering(state?.suffering ?? 0)), 0, 1);
}

function deathAuraPowerFromSuffering(suffering: number): number {
  return clamp(suffering / deathAuraSufferingForMaxPower, 0, 1);
}

function deathAuraRadius(power: number): number {
  return lerp(deathAuraBaseRadius, deathAuraMaxRadius, power);
}

function deathAuraColor(power: number): string {
  return power > 0.72 ? "#08080c" : power > 0.38 ? "#17101d" : "#23182b";
}

function facingFromAim(aimX: number, fallback: number): -1 | 1 {
  if (Math.abs(aimX) > 0.15) {
    return aimX < 0 ? -1 : 1;
  }
  return fallback < 0 ? -1 : 1;
}

function hasPositiveBuff(combatant: Combatant): boolean {
  return combatant.statuses.some((status) => status.id === "empowered"
    || status.id === "holyBuff"
    || status.id === "blessed"
    || status.id === "angelWings");
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
    case "axe":
      return "Axe throw";
    default:
      return weaponRegistry.get(id).name;
  }
}

function meleeLabelFor(id: WeaponId, slot: "primary" | "secondary", fallback: string): string {
  if (id === "machete") {
    return slot === "secondary" ? "Machete Chop" : "Machete Slash";
  }
  if (id === "axe") {
    return slot === "secondary" ? "Axe Throw" : "Axe Swing";
  }
  return slot === "secondary" ? "Heavy" : fallback;
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
      return { id, label: "Empowered", duration: lightningDefaultEmpoweredDuration, stacks: 1 };
    case "marked":
      return { id, label: "Marked", duration: 4, stacks: 1 };
    case "steady":
      return { id, label: "Steady", duration: COMBAT_TUNING.sniper.invisibilitySeconds, stacks: 1 };
    case "legShotSlow":
      return { id, label: "Leg Shot", duration: COMBAT_TUNING.sniper.legShotSlowDuration, stacks: 1 };
    case "legStagger":
      return { id, label: "Leg Stagger", duration: 2.4, stacks: 1 };
    case "holyBuff":
      return { id, label: "Holy Buff", duration: virginBloodBuffDuration, stacks: 1 };
    case "blessed":
      return { id, label: "Revive Ready", duration: virginBloodCooldown, stacks: 1 };
    case "angelWings":
      return { id, label: "Angel Wings", duration: virginBloodReviveWingDuration, stacks: 1 };
    case "deathFrozen":
      return { id, label: "Frozen", duration: 0.55, stacks: 1 };
    case "scrambled":
      return { id, label: "Scrambled", duration: 7.5, stacks: 1, tickDamage: 1, tickEvery: 1 };
    case "handsMissing":
      return { id, label: "No Hands", duration: handsMissingDuration, stacks: 1 };
    case "superLegs":
      return { id, label: "Super Legs", duration: superLegsStatusRefresh, stacks: 1 };
  }
}

function superLegsKickProfile(kind: SuperLegsKickKind): {
  label: string;
  damage: number;
  range: number;
  knockbackX: number;
  knockbackY: number;
  stun: number;
  cooldown: number;
  status?: string;
} {
  switch (kind) {
    case "forward":
      return { label: "Flying Kick", damage: 22, range: 108, knockbackX: 620, knockbackY: -180, stun: 0.34, cooldown: 0.42, status: "daze" };
    case "downward":
      return { label: "Stomp Kick", damage: 24, range: 70, knockbackX: 240, knockbackY: 720, stun: 0.42, cooldown: 0.48, status: "tripped" };
    case "back":
      return { label: "Back Kick", damage: 18, range: 78, knockbackX: 470, knockbackY: -130, stun: 0.28, cooldown: 0.36 };
    case "slam":
      return { label: "Leg Slam", damage: 34, range: 138, knockbackX: 720, knockbackY: -640, stun: 0.68, cooldown: 0.62, status: "tripped" };
    case "bounce":
      return { label: "Bounce Kick", damage: 18, range: 70, knockbackX: 280, knockbackY: 620, stun: 0.32, cooldown: 0.34 };
    case "neutral":
    default:
      return { label: "Rising Kick", damage: 18, range: 76, knockbackX: 360, knockbackY: -520, stun: 0.32, cooldown: 0.38 };
  }
}

function superLegsKickBox(player: PlayerPhysicsState, kind: SuperLegsKickKind, facing: number, range: number): { x: number; y: number; width: number; height: number } {
  const cx = player.x + player.width / 2;
  if (kind === "downward" || kind === "bounce") {
    return {
      x: cx - 29,
      y: player.y + player.height - 12,
      width: 58,
      height: 58,
    };
  }
  if (kind === "slam") {
    return {
      x: cx - range / 2,
      y: player.y + player.height - 30,
      width: range,
      height: 54,
    };
  }
  const width = range;
  return {
    x: facing > 0 ? cx + 2 : cx - width - 2,
    y: player.y + (kind === "neutral" ? 8 : 14),
    width,
    height: kind === "neutral" ? 42 : 36,
  };
}

function removeWhere<T>(items: T[], predicate: (item: T) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      items.splice(index, 1);
    }
  }
}

function sweptProjectileBounds(projectile: Projectile, previousX: number, previousY: number): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(previousX, projectile.x) - projectile.radius;
  const maxX = Math.max(previousX, projectile.x) + projectile.radius;
  const minY = Math.min(previousY, projectile.y) - projectile.radius;
  const maxY = Math.max(previousY, projectile.y) + projectile.radius;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
