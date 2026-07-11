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

type RectLike = Pick<Combatant, "x" | "y" | "width" | "height">;

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

export interface GrappleRopePoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface GrappleState {
  id: string;
  ownerId: string;
  state: "flying" | "attached";
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ropeLength: number;
  targetId?: string;
  anchorX: number;
  anchorY: number;
  maxRange: number;
  points: GrappleRopePoint[];
  pulling?: boolean;
  pullTimer?: number;
  visualOnly?: boolean;
}

export interface ZombieState {
  id: string;
  ownerId: string;
  strength: number;
  biteDamage: number;
  speed: number;
  age: number;
  riseTimer: number;
  riseDuration: number;
  biteTimer: number;
  biteAnim: number;
  wanderTimer: number;
  wanderDirection: -1 | 1;
  targetId?: string;
}

export interface SpikeState {
  id: string;
  ownerId: string;
  baseX: number;
  tipX: number;
  tipY: number;
  dirX: number;
  dirY: number;
  length: number;
  x: number;
  baseY: number;
  height: number;
  width: number;
  age: number;
  growDuration: number;
  disintegrating: boolean;
  disintegrateAge: number;
  impaledTargetIds: string[];
  visualOnly?: boolean;
}

export interface SpikeParticleState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  lifetime: number;
  color: string;
  angle?: number;
}

export interface CrossShieldState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  radius: number;
  knockback: number;
  age: number;
  duration: number;
  hits: string[];
  visualOnly?: boolean;
}

export interface JudgmentBeamState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
  warning: number;
  hits: string[];
  fired?: boolean;
  visualOnly?: boolean;
}

export type VanStateKind = "stored" | "emerging" | "active" | "absorbing" | "destroyed";

export interface VanState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  width: number;
  height: number;
  facing: -1 | 1;
  state: VanStateKind;
  health: number;
  maxHealth: number;
  gas: number;
  maxGas: number;
  speedLevel: number;
  occupantId?: string;
  honkCooldown: number;
  age: number;
  wheelSpin: number;
  damageFlash: number;
  smokeTimer: number;
  destroyedTimer: number;
  visualOnly?: boolean;
}

export interface VanDriverInput {
  left: boolean;
  right: boolean;
  shiftPressed: boolean;
  jumpPressed: boolean;
  honkPressed: boolean;
}

export interface SpiritFocusState {
  ownerId: string;
  active: boolean;
  timer: number;
  cooldownTimer: number;
  windedTimer: number;
  beatInterval: number;
  beatTimer: number;
  timingWindow: number;
  beatPattern: SpiritBeatPattern;
  beatLines: SpiritBeatLineState[];
  heartAssembleTimer: number;
  heartPulseTimer: number;
  heartShakeTimer: number;
  combo: number;
  perfectStreak: number;
  missesUsed: number;
  feedback: string;
  feedbackTimer: number;
}

export type SpiritBeatSide = "left" | "right";
export type SpiritBeatPattern = "normal" | "split" | "fast" | "slow" | "double" | "burst" | "unsynced" | "fake";

export interface SpiritBeatLineState {
  id: string;
  side: SpiritBeatSide;
  duration: number;
  timeToImpact: number;
  fake: boolean;
  hit: boolean;
  beatSounded: boolean;
}

export interface SpiritBeatLineRuntime {
  id: string;
  side: SpiritBeatSide;
  progress: number;
  fake: boolean;
  hit: boolean;
  timeToImpact: number;
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
  grapples: GrappleState[];
  zombies: ZombieState[];
  spikes: SpikeState[];
  spikeParticles: SpikeParticleState[];
  crossShields: CrossShieldState[];
  judgmentBeams: JudgmentBeamState[];
  vans: VanState[];
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
  range?: number;
}

export type SuperLegsKickKind = "neutral" | "forward" | "downward" | "back" | "slam" | "bounce";

interface CombatOptions {
  mode: "offline" | "network";
}

const maxHp = 100;
const respawnDelay = 2;
const respawnInvulnerabilityDuration = 2;
const teleportDelay = 3;
const teleportBallUpwardBoost = 500;
const teleportBallLifetime = teleportDelay + 2.4;
const teleportBallRollFriction = 0.58;
const teleportBallMinRollSpeed = 24;
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
const holyBazookaAmmoCallCooldown = 7;
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
const grappleHookSpeed = 980;
const grappleHookRange = 1350;
const grappleHookRadius = 8;
const grappleHookAttachDamage = 6;
const grappleHookAttachStun = 0.08;
const grappleHookPullForce = 1450;
const grappleHookMaxPullSpeed = 1040;
const grappleHookSnapDistance = 1600;
const grappleHookMaxRopeLength = 1450;
const grappleHookRopePoints = 9;
const chainsawOverheatSeconds = 15;
const chainsawCooldownSeconds = 5.5;
const chainsawTickInterval = 0.25;
const chainsawBaseDps = 8;
const chainsawMaxDps = 26;
const chainsawDamagePerDps = 50;
const chainsawRange = 66;
const chainsawThickness = 46;
const spikeModeDuration = 30;
const spikeModeCooldown = 60;
const spikeMaxActive = 60;
const spikeGrowDuration = 0.14;
const spikeDisintegrateDuration = 0.72;
const spikeHeight = 118;
const spikeWidth = 30;
const spikeMinLength = 96;
const spikeMaxLength = 520;
const spikeTipRadius = 26;
const spikeBodyPoisonCooldown = 0.18;
const spikeImpaleDamage = 3;
const spikeImpaleStun = 0.18;
const spikeBoundsPadding = 26;
const vanWidth = 118;
const vanHeight = 58;
const vanMaxHealth = 180;
const vanMaxGas = 100;
const vanGasRefillPerSecond = 9;
const vanStoredRepairPerSecond = 2.5;
const vanDestroyedRepairThreshold = 34;
const vanDriveAcceleration = 3600;
const vanFriction = 2.6;
const vanAirDrag = 0.58;
const vanMaxSpeedBase = 660;
const vanMaxSpeedStep = 160;
const vanGasDrainBase = 0.9;
const vanGasDrainStep = 0.18;
const vanRamCooldown = 0.28;
const vanHonkCooldownSeconds = 4.2;
const vanHonkRange = 230;
const vanExplosionRadius = 320;
const vanExplosionCenterDamage = 78;
const vanExplosionEdgeDamage = 32;
const vanExplosionCenterKnockback = 1180;
const vanExplosionEdgeKnockback = 520;
const vanExplosionCenterStun = 0.72;
const vanExplosionEdgeStun = 0.38;
const spiritMaxDuration = 25;
const spiritCooldownDuration = 60;
const spiritWindedDuration = 9;
const spiritInitialBeatInterval = 0.76;
const spiritMinimumBeatInterval = 0.56;
const spiritInitialTimingWindow = 0.18;
const spiritMinimumTimingWindow = 0.1;
const spiritPunchRange = 94;
const spiritGrabRange = 74;
const spiritLaneHalfWidth = 48;
const spiritFlashStepSpeed = 760;
const spiritMaxMisses = 3;
const crossShieldChargeCap = 10;
const crossShieldMinRadius = 58;
const crossShieldMaxRadius = 126;
const crossShieldMinKnockback = 420;
const crossShieldMaxKnockback = 1120;
const crossShieldMinDuration = 0.42;
const crossShieldMaxDuration = 0.95;
const crossShieldContactDamage = 1;
const crossJudgmentDuration = 60;
const crossRestDuration = 180;
const crossJudgmentBeamCount = 200;
const crossBeamWarningTime = 0.45;
const crossBeamDuration = 2.4;
const crossBeamDamage = 999;
const crossBeamRadius = 34;
const crossBeamTargetEvery = 9;
const zombieRiseDuration = 1.08;
const zombieDetectRange = 560;
const zombieBiteRange = 48;
const zombieBiteCooldown = 0.72;
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

interface CrossState {
  stopwatch: number;
  restTimer: number;
}

interface JudgmentDayState {
  ownerId: string;
  seed: number;
  timer: number;
  duration: number;
  beamIndex: number;
  beamAccumulator: number;
  beams: JudgmentBeamState[];
  visualOnly?: boolean;
}

type ChainsawMode = "idle" | "running" | "overheated";

interface ChainsawState {
  mode: ChainsawMode;
  activeTimer: number;
  cooldownTimer: number;
  tickTimer: number;
  damageTotal: number;
  aim: Vec2;
}

interface SpikeModeState {
  activeTimer: number;
  cooldownTimer: number;
  particleTimer: number;
}

interface SpikeImpaleState {
  spikeId: string;
  x: number;
  y: number;
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
  grappleActive: boolean;
  grappleAttached: boolean;
  grapplePulling: boolean;
  grappleRopeLength: number;
  chainsawMode: ChainsawMode;
  chainsawHeat: number;
  chainsawRev: number;
  chainsawDps: number;
  chainsawDamageTotal: number;
  spikeModeActive: boolean;
  spikeModeTimer: number;
  spikeCooldown: number;
  spikeCount: number;
  vanActive: boolean;
  vanStored: boolean;
  vanDestroyed: boolean;
  vanDriving: boolean;
  vanHealth: number;
  vanMaxHealth: number;
  vanGas: number;
  vanMaxGas: number;
  vanSpeedLevel: number;
  vanHonkCooldown: number;
  spiritActive: boolean;
  spiritTimer: number;
  spiritCooldown: number;
  spiritWindedTimer: number;
  spiritBeatProgress: number;
  spiritBeatWindow: number;
  spiritBeatPattern: SpiritBeatPattern;
  spiritBeatLines: SpiritBeatLineRuntime[];
  spiritHeartAssembling: boolean;
  spiritHeartPulse: number;
  spiritHeartShake: number;
  spiritCombo: number;
  spiritPerfectStreak: number;
  spiritMissesUsed: number;
  spiritMissesRemaining: number;
  spiritFeedback: string;
  crossStopwatch: number;
  crossRestTimer: number;
  crossJudgmentActive: boolean;
  crossJudgmentTimer: number;
  zombieCount: number;
  attachedHands: number;
}

export interface MacheteRuntimeState extends MacheteGrowthState {
  redness: number;
}

export class CombatSystem {
  private inventory: WeaponInventoryState = createDefaultInventory();
  private readonly combatants = new Map<string, Combatant>();
  private readonly projectiles: Projectile[] = [];
  private readonly grapples: GrappleState[] = [];
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
  private readonly rocketGuidance = new Map<string, Vec2>();
  private readonly handAttachments = new Map<string, HandAttachmentState>();
  private readonly chainsaws = new Map<string, ChainsawState>();
  private readonly chainsawVictimDamage = new Map<string, number>();
  private readonly zombies = new Map<string, ZombieState>();
  private readonly spikeModes = new Map<string, SpikeModeState>();
  private readonly spikes: SpikeState[] = [];
  private readonly spikeParticles: SpikeParticleState[] = [];
  private readonly spikeImpales = new Map<string, SpikeImpaleState>();
  private readonly vans: VanState[] = [];
  private readonly spiritFocusModes = new Map<string, SpiritFocusState>();
  private readonly crossStates = new Map<string, CrossState>();
  private readonly crossShields: CrossShieldState[] = [];
  private readonly judgmentDays = new Map<string, JudgmentDayState>();
  private readonly buffVisualTimers = new Map<string, number>();
  private readonly bodyContactCooldowns = new Map<string, number>();
  private holyBazookaAmmoCooldown = 0;
  private holyBazookaAmmoSpawnIndex = 0;
  private nextId = 0;

  constructor(_options: CombatOptions) {}

  start(inventory: WeaponInventoryState = createDefaultInventory()): void {
    this.inventory = inventory;
    this.combatants.clear();
    this.projectiles.length = 0;
    this.grapples.length = 0;
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
    this.rocketGuidance.clear();
    this.handAttachments.clear();
    this.chainsaws.clear();
    this.chainsawVictimDamage.clear();
    this.zombies.clear();
    this.spikeModes.clear();
    this.spikes.length = 0;
    this.spikeParticles.length = 0;
    this.spikeImpales.clear();
    this.vans.length = 0;
    this.spiritFocusModes.clear();
    this.crossStates.clear();
    this.crossShields.length = 0;
    this.judgmentDays.clear();
    this.buffVisualTimers.clear();
    this.bodyContactCooldowns.clear();
    this.holyBazookaAmmoCooldown = 0;
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
    maxHp?: number;
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
      hp: Math.min(player.maxHp ?? existing?.maxHp ?? maxHp, player.hp ?? existing?.hp ?? maxHp),
      maxHp: player.maxHp ?? existing?.maxHp ?? maxHp,
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
    this.releaseSpikeImpale(id);
    if (this.spikeModes.has(id)) {
      this.endSpikeMode(id, false);
      this.spikeModes.delete(id);
    }
    if (id.startsWith("zombie-")) {
      this.zombies.delete(id);
    }
    this.crossStates.delete(id);
    this.judgmentDays.delete(id);
    removeWhere(this.crossShields, (shield) => shield.ownerId === id);
    for (const zombie of this.zombies.values()) {
      if (zombie.targetId === id) {
        zombie.targetId = undefined;
      }
    }
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
    if (this.inventory.equippedWeapon === "spikes") {
      return this.activateSpikes(context);
    }
    if (this.inventory.equippedWeapon === "van") {
      return this.toggleVan(context);
    }
    if (this.inventory.equippedWeapon === "spirit-fighter") {
      return this.useSpiritPrimary(context);
    }
    if (this.inventory.equippedWeapon === "cross") {
      return this.useCrossShield(context);
    }
    if (this.inventory.equippedWeapon === "rocket") {
      return this.placeRocket(context);
    }
    if (this.inventory.equippedWeapon === "holy-bazooka") {
      return this.fireHolyBazooka(context);
    }
    if (this.inventory.equippedWeapon === "grappling-hook") {
      return this.fireGrapplingHook(context);
    }
    if (this.inventory.equippedWeapon === "chainsaw") {
      return this.useChainsawPrimary(context);
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
    if (weapon.id === "spikes") {
      return this.activateSpikes(context);
    }
    if (weapon.id === "van") {
      return { kind: "blocked", weaponId: weapon.id, label: "Van uses Q/E" };
    }
    if (weapon.id === "spirit-fighter") {
      return this.useSpiritSecondary(context);
    }
    if (weapon.id === "cross") {
      return this.useCrossJudgment(context);
    }
    if (weapon.id === "rocket") {
      return this.lightRocket(context);
    }
    if (weapon.id === "holy-bazooka") {
      return this.callHolyBazookaAmmo(context);
    }
    if (weapon.id === "grappling-hook") {
      return this.pullGrapplingHook(context);
    }
    if (weapon.id === "chainsaw") {
      return this.stopChainsaw(context.ownerId, context.now);
    }
    if (weapon.id === "hands") {
      return this.spawnHands(context);
    }
    if (weapon.id === "pistol") {
      return { kind: "blocked", weaponId: weapon.id, label: "No throw" };
    }
    if (weapon.id === "knife") {
      return this.throwCurrentWeapon(context.ownerId, context.player, context.aim, context.now, false);
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
    return this.reloadWeapon(ownerId, this.inventory.equippedWeapon, now);
  }

  reloadWeapon(ownerId: string, weaponId: WeaponId, now: number): WeaponUseResult {
    const weapon = weaponRegistry.get(weaponId);
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
    if (this.inventory.equippedWeapon === "pistol") {
      return { kind: "blocked", weaponId: "pistol", label: "No throw" };
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
    const chainsawDeathSource = request.weaponId === "chainsaw" && request.label !== "Zombie Bite" && !request.sourceId.startsWith("zombie-") && !target.id.startsWith("zombie-");
    if (chainsawDeathSource && request.sourceId !== target.id) {
      this.recordChainsawDamage(request.sourceId, target.id, damage);
    }
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
    if (finalStatus === "poison" || finalStatus === "spikePoison") {
      this.addEffect("aura", target.x + target.width / 2, target.y + target.height / 2, target.x + target.width / 2, target.y - 38, "#164f24", "POISON");
      this.addEffect("spark", target.x + 8, target.y + 10, target.x - 20, target.y - 10, "#7cff6b", "Poison");
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

    if (request.sourceId !== target.id && damage > 0) {
      this.failSpiritFocus(target.id, "HIT", true);
    }

    if (target.hp <= 0) {
      if (this.consumeVirginBloodRevive(target)) {
        return { applied: true, remainingHp: target.hp, hitLocation };
      }
      if (chainsawDeathSource) {
        this.spawnZombieFromChainsaw(request.sourceId, target, this.getChainsawContribution(request.sourceId, target.id), {
          x: target.x,
          y: target.y,
        });
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
    this.updateSpiritFocusModes(dt);
    this.updateHolyBazookaAmmo(dt, players);
    this.updateGrapples(dt, players);
    this.updateChainsaws(dt);
    this.updateZombies(dt);
    this.updateSpikes(dt, players);
    this.updateVans(dt, players);
    this.updateCombatants(dt);
    this.updateProjectiles(dt, players);
    this.updateCross(dt, players);
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
    return this.axeRushes.has(ownerId) || this.spikeImpales.has(ownerId) || Boolean(this.getVanDrivenBy(ownerId));
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

  setRocketGuidance(ownerId: string, aim: Vec2): void {
    this.rocketGuidance.set(ownerId, normalize(aim));
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

  placeSpikeAt(ownerId: string, player: PlayerPhysicsState, point: Vec2, now: number): WeaponUseResult {
    const weaponId: WeaponId = "spikes";
    const mode = this.spikeModes.get(ownerId);
    if (!mode || mode.activeTimer <= 0) {
      return { kind: "blocked", weaponId, label: "Spike mode inactive" };
    }
    const owner = this.combatants.get(ownerId);
    if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No owner" };
    }
    const geometry = buildSpikeGeometry(player, point);
    const spike: SpikeState = {
      id: this.makeId("spike"),
      ownerId,
      baseX: geometry.base.x,
      baseY: geometry.base.y,
      tipX: geometry.tip.x,
      tipY: geometry.tip.y,
      dirX: geometry.direction.x,
      dirY: geometry.direction.y,
      length: geometry.length,
      x: geometry.base.x,
      height: geometry.length,
      width: spikeWidth,
      age: 0,
      growDuration: spikeGrowDuration,
      disintegrating: false,
      disintegrateAge: 0,
      impaledTargetIds: [],
    };
    this.spikes.push(spike);
    this.trimOwnerSpikes(ownerId);
    this.spawnSpikeGrowParticles(spike);
    this.queueSound("spike-grow");
    this.recentEvents.push(this.createEvent(
      ownerId,
      weaponId,
      "primary",
      { x: spike.tipX, y: spike.tipY },
      { x: spike.dirX, y: spike.dirY },
      "Spike Spawn",
      now,
      { range: spike.length },
    ));
    this.applySpikeContacts(spike);
    return { kind: "utility", weaponId, label: "Spike Spawn" };
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
    const grapple = this.activeGrapple(ownerId);
    const chainsaw = this.chainsaws.get(ownerId);
    const chainsawMode = chainsaw?.mode ?? "idle";
    const spikeMode = this.spikeModes.get(ownerId);
    const ownedVan = this.getVanForOwner(ownerId);
    const drivenVan = this.getVanDrivenBy(ownerId);
    const van = ownedVan ?? drivenVan;
    const spirit = this.getOrCreateSpiritFocus(ownerId);
    const cross = this.getOrCreateCrossState(ownerId);
    const judgment = this.judgmentDays.get(ownerId);
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
      grappleActive: Boolean(grapple),
      grappleAttached: grapple?.state === "attached",
      grapplePulling: grapple?.pulling ?? false,
      grappleRopeLength: grapple?.ropeLength ?? 0,
      chainsawMode,
      chainsawHeat: chainsawMode === "overheated"
        ? 1
        : chainsawMode === "running"
          ? clamp((chainsaw?.activeTimer ?? 0) / chainsawOverheatSeconds, 0, 1)
          : 0,
      chainsawRev: 0,
      chainsawDps: this.chainsawDps(ownerId),
      chainsawDamageTotal: chainsaw?.damageTotal ?? 0,
      spikeModeActive: Boolean(spikeMode && spikeMode.activeTimer > 0),
      spikeModeTimer: spikeMode?.activeTimer ?? 0,
      spikeCooldown: spikeMode?.cooldownTimer ?? this.inventory.cooldowns.spikes ?? 0,
      spikeCount: this.spikes.filter((spike) => spike.ownerId === ownerId && !spike.disintegrating).length,
      vanActive: Boolean(van && (van.state === "active" || van.state === "emerging" || van.state === "absorbing")),
      vanStored: van?.state === "stored",
      vanDestroyed: van?.state === "destroyed",
      vanDriving: drivenVan?.occupantId === ownerId,
      vanHealth: van?.health ?? 0,
      vanMaxHealth: van?.maxHealth ?? vanMaxHealth,
      vanGas: van?.gas ?? vanMaxGas,
      vanMaxGas: van?.maxGas ?? vanMaxGas,
      vanSpeedLevel: van?.speedLevel ?? 0,
      vanHonkCooldown: van?.honkCooldown ?? 0,
      spiritActive: spirit.active,
      spiritTimer: spirit.active ? spirit.timer : 0,
      spiritCooldown: spirit.cooldownTimer,
      spiritWindedTimer: spirit.windedTimer,
      spiritBeatProgress: spirit.active ? spiritBeatProgress(spirit) : 0,
      spiritBeatWindow: spirit.timingWindow,
      spiritBeatPattern: spirit.beatPattern,
      spiritBeatLines: spirit.active ? spirit.beatLines.map((line) => ({
        id: line.id,
        side: line.side,
        progress: clamp(1 - Math.max(0, line.timeToImpact) / Math.max(0.01, line.duration), 0, 1),
        fake: line.fake,
        hit: line.hit,
        timeToImpact: line.timeToImpact,
      })) : [],
      spiritHeartAssembling: spirit.active && spirit.heartAssembleTimer > 0,
      spiritHeartPulse: spirit.heartPulseTimer,
      spiritHeartShake: spirit.heartShakeTimer,
      spiritCombo: spirit.combo,
      spiritPerfectStreak: spirit.perfectStreak,
      spiritMissesUsed: spirit.missesUsed,
      spiritMissesRemaining: Math.max(0, spiritMaxMisses - spirit.missesUsed),
      spiritFeedback: spirit.feedbackTimer > 0 ? spirit.feedback : "",
      crossStopwatch: cross.stopwatch,
      crossRestTimer: cross.restTimer,
      crossJudgmentActive: Boolean(judgment && judgment.timer > 0),
      crossJudgmentTimer: judgment?.timer ?? 0,
      zombieCount: [...this.zombies.values()].filter((zombie) => zombie.ownerId === ownerId).length,
      attachedHands: this.handAttachments.get(ownerId)?.attached ?? 0,
    };
  }

  getJudgmentDayState(): { active: boolean; timer: number; ownerId?: string } {
    const active = [...this.judgmentDays.values()]
      .filter((state) => state.timer > 0)
      .sort((left, right) => right.timer - left.timer)[0];
    return { active: Boolean(active), timer: active?.timer ?? 0, ownerId: active?.ownerId };
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

  private getOrCreateCrossState(ownerId: string): CrossState {
    let state = this.crossStates.get(ownerId);
    if (!state) {
      state = { stopwatch: 0, restTimer: 0 };
      this.crossStates.set(ownerId, state);
    }
    return state;
  }

  private useCrossShield(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "cross";
    const cross = this.getOrCreateCrossState(context.ownerId);
    if (cross.restTimer > 0 || (this.inventory.cooldowns[weaponId] ?? 0) > 90) {
      return { kind: "blocked", weaponId, label: "Cross resting" };
    }
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Cooldown" };
    }
    const owner = this.combatants.get(context.ownerId);
    if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No bearer" };
    }
    const aim = normalize(context.aim.x || context.aim.y ? context.aim : { x: context.player.facing, y: 0 });
    const chargeRatio = clamp(cross.stopwatch / crossShieldChargeCap, 0, 1);
    const radius = lerp(crossShieldMinRadius, crossShieldMaxRadius, chargeRatio);
    const knockback = lerp(crossShieldMinKnockback, crossShieldMaxKnockback, chargeRatio);
    const duration = lerp(crossShieldMinDuration, crossShieldMaxDuration, chargeRatio);
    const origin = {
      x: owner.x + owner.width / 2 + aim.x * (44 + radius * 0.32),
      y: owner.y + owner.height * 0.45 + aim.y * (24 + radius * 0.18),
    };
    this.crossShields.push({
      id: this.makeId("cross-shield"),
      ownerId: context.ownerId,
      x: origin.x,
      y: origin.y,
      dirX: aim.x,
      dirY: aim.y,
      radius,
      knockback,
      age: 0,
      duration,
      hits: [],
    });
    cross.stopwatch = 0;
    this.inventory.cooldowns[weaponId] = weaponRegistry.get(weaponId).primary.cooldown;
    this.addEffect("aura", origin.x, origin.y, origin.x + aim.x * radius, origin.y + aim.y * radius * 0.35, colorForWeapon(weaponId), "Crescent Shield");
    this.addEffect("shockwave", origin.x, origin.y, origin.x + radius, origin.y, colorForWeapon(weaponId), "Crescent Shield");
    this.queueSound("cross-shield");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", origin, aim, "Crescent Shield", context.now, {
      range: radius,
    }));
    return { kind: "utility", weaponId, label: "Crescent Shield" };
  }

  private useCrossJudgment(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "cross";
    const cross = this.getOrCreateCrossState(context.ownerId);
    if (cross.restTimer > 0 || (this.inventory.cooldowns[weaponId] ?? 0) > 90) {
      return { kind: "blocked", weaponId, label: "Cross resting" };
    }
    const owner = this.combatants.get(context.ownerId);
    if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No bearer" };
    }
    const seed = Math.floor((context.now || performanceNow()) + context.ownerId.length * 4099) % 1000000;
    const origin = { x: owner.x + owner.width / 2, y: owner.y + owner.height * 0.42 };
    this.startJudgmentDay(context.ownerId, origin, seed, false);
    cross.stopwatch = 0;
    cross.restTimer = crossRestDuration;
    this.inventory.cooldowns[weaponId] = crossRestDuration;
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "secondary", origin, normalize(context.aim.x || context.aim.y ? context.aim : { x: 0, y: -1 }), "Judgment Day", context.now, {
      range: seed,
    }));
    return { kind: "utility", weaponId, label: "Judgment Day" };
  }

  private startJudgmentDay(ownerId: string, origin: Vec2, seed: number, visualOnly: boolean): void {
    const state: JudgmentDayState = {
      ownerId,
      seed,
      timer: crossJudgmentDuration,
      duration: crossJudgmentDuration,
      beamIndex: 0,
      beamAccumulator: 0,
      beams: [],
      visualOnly,
    };
    this.judgmentDays.set(ownerId, state);
    this.spawnJudgmentBeam(state, origin.x, origin.y);
    this.addEffect("aura", origin.x, origin.y, origin.x, origin.y - 260, colorForWeapon("cross"), "JUDGMENT DAY");
    this.addEffect("shockwave", origin.x, DEFAULT_PHYSICS.groundY, origin.x + 240, DEFAULT_PHYSICS.groundY, colorForWeapon("cross"), "JUDGMENT DAY");
    if (!visualOnly) {
      this.queueSound("judgment-day");
    }
  }

  private updateCross(dt: number, _players: PlayerPhysicsState[]): void {
    let crossCooldown = this.inventory.cooldowns.cross ?? 0;
    for (const state of this.crossStates.values()) {
      state.restTimer = Math.max(0, state.restTimer - dt);
      if (state.restTimer > 0) {
        crossCooldown = Math.max(crossCooldown, state.restTimer);
      } else {
        state.stopwatch = Math.min(crossShieldChargeCap, state.stopwatch + dt);
      }
    }
    this.inventory.cooldowns.cross = crossCooldown;

    for (const shield of this.crossShields) {
      shield.age += dt;
      this.applyCrossShieldContacts(shield);
      this.deflectProjectilesWithCrossShield(shield);
    }
    removeWhere(this.crossShields, (shield) => shield.age >= shield.duration);

    for (const [ownerId, judgment] of [...this.judgmentDays.entries()]) {
      this.updateJudgmentDay(judgment, dt);
      if (judgment.timer <= 0 && judgment.beams.length === 0) {
        this.judgmentDays.delete(ownerId);
      }
    }
  }

  private applyCrossShieldContacts(shield: CrossShieldState): void {
    if (shield.visualOnly) {
      return;
    }
    for (const target of this.combatants.values()) {
      if (target.id === shield.ownerId || target.respawnTimer > 0 || target.hp <= 0 || shield.hits.includes(target.id)) {
        continue;
      }
      const center = { x: target.x + target.width / 2, y: target.y + target.height * 0.45 };
      const dx = center.x - shield.x;
      const dy = center.y - shield.y;
      const distance = Math.hypot(dx, dy);
      if (distance > shield.radius + Math.max(target.width, target.height) * 0.35) {
        continue;
      }
      const direction = normalize({ x: dx || shield.dirX || 1, y: dy || shield.dirY || -0.2 });
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: shield.ownerId,
        targetId: target.id,
        weaponId: "cross",
        damage: crossShieldContactDamage,
        knockback: { x: direction.x * shield.knockback, y: direction.y * shield.knockback * 0.42 - 170 },
        stun: 0.18,
        label: "Crescent Shield",
        status: "daze",
        skipHitLocationScaling: true,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
        continue;
      }
      shield.hits.push(target.id);
      this.queueSound("cross-bounce");
    }
    for (const van of this.damageableVans()) {
      if (van.ownerId === shield.ownerId || shield.hits.includes(van.id)) {
        continue;
      }
      const center = { x: van.x + van.width / 2, y: van.y + van.height / 2 };
      const distance = Math.hypot(center.x - shield.x, center.y - shield.y);
      if (distance > shield.radius + van.width * 0.42) {
        continue;
      }
      const direction = normalize({ x: center.x - shield.x || shield.dirX || 1, y: center.y - shield.y || -0.2 });
      if (this.damageVan(van.id, crossShieldContactDamage, shield.ownerId, performanceNow(), {
        x: direction.x * shield.knockback,
        y: direction.y * shield.knockback * 0.5 - 220,
      })) {
        shield.hits.push(van.id);
        this.queueSound("cross-bounce");
      }
    }
  }

  private deflectProjectilesWithCrossShield(shield: CrossShieldState): void {
    if (shield.visualOnly) {
      return;
    }
    for (const projectile of this.projectiles) {
      if (projectile.ownerId === shield.ownerId || projectile.visualOnly || projectile.age > projectile.lifetime || shield.hits.includes(`projectile:${projectile.id}`)) {
        continue;
      }
      const distance = Math.hypot(projectile.x - shield.x, projectile.y - shield.y);
      if (distance > shield.radius + projectile.radius) {
        continue;
      }
      const direction = normalize({ x: projectile.x - shield.x || shield.dirX || 1, y: projectile.y - shield.y || shield.dirY || -0.1 });
      const speed = clamp(Math.hypot(projectile.vx, projectile.vy) * 1.08 + 120, 520, 1500);
      projectile.ownerId = shield.ownerId;
      projectile.vx = direction.x * speed;
      projectile.vy = direction.y * speed - 70;
      projectile.knockback = { x: direction.x * Math.max(projectile.knockback.x || 0, shield.knockback * 0.56), y: direction.y * shield.knockback * 0.22 - 80 };
      projectile.hits = [];
      shield.hits.push(`projectile:${projectile.id}`);
      this.addEffect("spark", projectile.x, projectile.y, projectile.x + direction.x * 38, projectile.y + direction.y * 24, colorForWeapon("cross"), "DEFLECT");
      this.queueSound("cross-bounce");
    }
  }

  private updateJudgmentDay(state: JudgmentDayState, dt: number): void {
    state.timer = Math.max(0, state.timer - dt);
    for (const beam of state.beams) {
      const previousAge = beam.age;
      beam.age += dt;
      if (!beam.fired && previousAge < beam.warning && beam.age >= beam.warning) {
        beam.fired = true;
        this.addEffect("lightning", beam.x, DEFAULT_PHYSICS.groundY, beam.x, DEFAULT_PHYSICS.groundY - 560, colorForWeapon("cross"), "JUDGMENT");
        if (!beam.visualOnly) {
          this.queueSound("judgment-beam");
        }
      }
      this.applyJudgmentBeamDamage(beam);
    }
    removeWhere(state.beams, (beam) => beam.age >= beam.duration);
    if (state.timer <= 0) {
      return;
    }
    state.beamAccumulator += dt * (crossJudgmentBeamCount / crossJudgmentDuration);
    let spawned = 0;
    while (state.beamAccumulator >= 1 && spawned < 14) {
      state.beamAccumulator -= 1;
      this.spawnJudgmentBeam(state);
      spawned += 1;
    }
  }

  private spawnJudgmentBeam(state: JudgmentDayState, x?: number, y?: number): void {
    const index = state.beamIndex;
    state.beamIndex += 1;
    let beamX = x;
    if (typeof beamX !== "number") {
      const target = index % crossBeamTargetEvery === 0 ? this.pickJudgmentTarget(state.ownerId, index) : undefined;
      beamX = target ? target.x + target.width / 2 : lerp(DEFAULT_PHYSICS.platformLeft + 40, DEFAULT_PHYSICS.platformRight - 40, seededUnit(state.seed, index, 3));
    }
    const beamY = y ?? DEFAULT_PHYSICS.groundY - 260 - seededUnit(state.seed, index, 7) * 160;
    const radius = crossBeamRadius + Math.round(seededUnit(state.seed, index, 11) * 18);
    state.beams.push({
      id: this.makeId("judgment"),
      ownerId: state.ownerId,
      x: beamX,
      y: beamY,
      radius,
      age: 0,
      duration: crossBeamDuration,
      warning: crossBeamWarningTime,
      hits: [],
      visualOnly: state.visualOnly,
    });
  }

  private pickJudgmentTarget(ownerId: string, index: number): Combatant | undefined {
    const candidates = [...this.combatants.values()].filter((target) => target.respawnTimer <= 0 && target.hp > 0);
    if (candidates.length === 0) {
      return undefined;
    }
    const selected = Math.floor(seededUnit(ownerId.length * 9973, index, 17) * candidates.length) % candidates.length;
    return candidates[selected];
  }

  private applyJudgmentBeamDamage(beam: JudgmentBeamState): void {
    if (beam.visualOnly || beam.age < beam.warning) {
      return;
    }
    const active = clamp((beam.age - beam.warning) / 0.18, 0, 1);
    const radius = beam.radius * (0.75 + active * 0.8);
    for (const target of this.combatants.values()) {
      if (target.respawnTimer > 0 || target.hp <= 0 || beam.hits.includes(target.id)) {
        continue;
      }
      const centerX = target.x + target.width / 2;
      if (Math.abs(centerX - beam.x) > radius + target.width / 2) {
        continue;
      }
      const direction = Math.sign(centerX - beam.x || seededUnit(beam.x, beam.age, 5) - 0.5 || 1);
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: beam.ownerId,
        targetId: target.id,
        weaponId: "cross",
        damage: crossBeamDamage,
        knockback: { x: direction * 1220, y: -920 },
        stun: 1,
        label: "Judgment Beam",
        status: "daze",
        skipHitLocationScaling: true,
        skipSourceScaling: true,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
        continue;
      }
      beam.hits.push(target.id);
    }
    for (const van of this.damageableVans()) {
      if (beam.hits.includes(van.id)) {
        continue;
      }
      const centerX = van.x + van.width / 2;
      if (Math.abs(centerX - beam.x) > radius + van.width / 2) {
        continue;
      }
      const direction = Math.sign(centerX - beam.x || 1);
      if (this.damageVan(van.id, crossBeamDamage, beam.ownerId, performanceNow(), { x: direction * 1300, y: -760 })) {
        beam.hits.push(van.id);
      }
    }
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
        } else if (event.weaponId === "spikes" && event.label === "Spike Impale") {
          this.impaleTargetWithSpike(this.getOrCreateRemoteSpikeVisual(event), target, false);
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
    if (event.weaponId === "grappling-hook") {
      this.spawnRemoteGrappleVisual(event, aim);
      return;
    }
    if (event.weaponId === "hands" && (event.action === "primary" || event.action === "secondary")) {
      this.spawnRemoteHandsVisual(event, aim);
      return;
    }
    if (event.weaponId === "spikes" && (event.action === "primary" || event.action === "secondary")) {
      this.spawnRemoteSpikesVisual(event);
      return;
    }
    if (event.weaponId === "cross") {
      this.spawnRemoteCrossVisual(event, aim);
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

  private spawnRemoteCrossVisual(event: CombatEventPacket, aim: Vec2): void {
    if (event.label === "Judgment Day") {
      this.startJudgmentDay(event.ownerId, { x: event.x, y: event.y }, Math.floor(event.range ?? 1), true);
      return;
    }
    if (event.label === "Crescent Shield") {
      const radius = clamp(event.range ?? crossShieldMinRadius, crossShieldMinRadius, crossShieldMaxRadius);
      this.crossShields.push({
        id: `remote-cross-${event.id}`,
        ownerId: event.ownerId,
        x: event.x,
        y: event.y,
        dirX: aim.x,
        dirY: aim.y,
        radius,
        knockback: lerp(crossShieldMinKnockback, crossShieldMaxKnockback, (radius - crossShieldMinRadius) / Math.max(1, crossShieldMaxRadius - crossShieldMinRadius)),
        age: 0,
        duration: crossShieldMaxDuration,
        hits: [],
        visualOnly: true,
      });
      this.addEffect("aura", event.x, event.y, event.x + aim.x * radius, event.y + aim.y * radius * 0.35, colorForWeapon("cross"), "Crescent Shield");
    }
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

  private spawnRemoteGrappleVisual(event: CombatEventPacket, aim: Vec2): void {
    if (event.label === "Grapple Release") {
      removeWhere(this.grapples, (grapple) => grapple.ownerId === event.ownerId);
      this.addEffect("spark", event.x, event.y, event.x, event.y - 24, colorForWeapon("grappling-hook"), "Release");
      return;
    }
    if (event.action === "secondary") {
      const grapple = this.grapples.find((item) => item.ownerId === event.ownerId);
      if (grapple) {
        grapple.pulling = true;
        grapple.pullTimer = 0.18;
      }
      this.addEffect("tracer", event.x, event.y, event.x + aim.x * 80, event.y + aim.y * 80, colorForWeapon("grappling-hook"), "Grapple Pull");
      return;
    }
    if (event.action !== "primary") {
      return;
    }
    removeWhere(this.grapples, (grapple) => grapple.ownerId === event.ownerId);
    const start = { x: event.x, y: event.y };
    const end = {
      x: event.x + aim.x * 24,
      y: event.y + aim.y * 24,
    };
    this.grapples.push({
      id: `remote-grapple-${event.id}`,
      ownerId: event.ownerId,
      state: "flying",
      x: end.x,
      y: end.y,
      vx: aim.x * grappleHookSpeed,
      vy: aim.y * grappleHookSpeed,
      age: 0,
      ropeLength: 120,
      anchorX: end.x,
      anchorY: end.y,
      maxRange: grappleHookRange,
      points: createRopePoints(start, end, grappleHookRopePoints),
      visualOnly: true,
    });
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

  private spawnRemoteSpikesVisual(event: CombatEventPacket): void {
    if (event.label === "Spike Mode") {
      const owner = this.combatants.get(event.ownerId);
      if (owner) {
        owner.statuses = upsertStatusEffect(owner.statuses, createStatus("spikeMode"));
        this.spawnSpikeModeParticles(owner, 8);
      }
      this.addEffect("aura", event.x, event.y, event.x, event.y - 62, colorForWeapon("spikes"), "SPIKE MODE");
      return;
    }
    if (event.label !== "Spike Spawn") {
      return;
    }
    this.getOrCreateRemoteSpikeVisual(event);
  }

  private getOrCreateRemoteSpikeVisual(event: CombatEventPacket): SpikeState {
    const existing = this.spikes.find((spike) => spike.ownerId === event.ownerId && spike.visualOnly && Math.hypot(spike.tipX - event.x, spike.tipY - event.y) < 36);
    if (existing) {
      return existing;
    }
    const tip = clampSpikePoint({ x: event.x, y: event.y });
    const direction = normalize({ x: event.ax || 0, y: event.ay || -1 });
    const length = clamp(event.range ?? spikeHeight, spikeMinLength, spikeMaxLength);
    const base = {
      x: tip.x - direction.x * length,
      y: tip.y - direction.y * length,
    };
    const spike: SpikeState = {
      id: `remote-spike-${event.id}`,
      ownerId: event.ownerId,
      baseX: base.x,
      baseY: base.y,
      tipX: tip.x,
      tipY: tip.y,
      dirX: direction.x,
      dirY: direction.y,
      length,
      x: base.x,
      height: length,
      width: spikeWidth,
      age: 0,
      growDuration: spikeGrowDuration,
      disintegrating: false,
      disintegrateAge: 0,
      impaledTargetIds: [],
      visualOnly: true,
    };
    this.spikes.push(spike);
    this.spawnSpikeGrowParticles(spike);
    return spike;
  }

  getSnapshot(): CombatSnapshot {
    return {
      projectiles: this.projectiles,
      hitboxes: this.hitboxes,
      combatants: [...this.combatants.values()],
      droppedWeapons: this.droppedWeapons,
      ammoPickups: this.ammoPickups,
      grapples: this.grapples,
      zombies: [...this.zombies.values()],
      spikes: this.spikes,
      spikeParticles: this.spikeParticles,
      crossShields: this.crossShields,
      judgmentBeams: [...this.judgmentDays.values()].flatMap((state) => state.beams),
      vans: this.vans,
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

  private callHolyBazookaAmmo(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "holy-bazooka";
    if (this.holyBazookaAmmoCooldown > 0) {
      return { kind: "blocked", weaponId, label: "Ammo cooldown" };
    }
    if (this.ammoPickups.filter((pickup) => pickup.weaponId === weaponId).length >= holyBazookaMaxAmmoPickups) {
      return { kind: "blocked", weaponId, label: "Ammo cap" };
    }
    const pickup = this.spawnHolyBazookaAmmoPickup(context.player);
    this.holyBazookaAmmoCooldown = holyBazookaAmmoCallCooldown;
    this.queueSound("holy-bazooka-pickup");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "secondary", { x: pickup.x, y: pickup.y }, normalize(context.aim), "Holy Ammo", context.now));
    return { kind: "utility", weaponId, label: "Holy Ammo" };
  }

  private activateSpikes(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "spikes";
    const owner = this.combatants.get(context.ownerId);
    if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No owner" };
    }
    const state = this.getOrCreateSpikeMode(context.ownerId);
    if (state.cooldownTimer > 0) {
      return { kind: "blocked", weaponId, label: "Spike cooldown" };
    }
    state.activeTimer = spikeModeDuration;
    state.particleTimer = 0;
    state.cooldownTimer = 0;
    this.inventory.cooldowns[weaponId] = 0;
    owner.statuses = upsertStatusEffect(owner.statuses, createStatus("spikeMode"));
    const center = { x: owner.x + owner.width / 2, y: owner.y + owner.height * 0.42 };
    this.addEffect("aura", center.x, center.y, center.x, center.y - 62, colorForWeapon(weaponId), "SPIKE MODE");
    this.spawnSpikeModeParticles(owner, 10);
    this.queueSound("spike-mode");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", center, normalize(context.aim), "Spike Mode", context.now));
    return { kind: "utility", weaponId, label: "Spike Mode" };
  }

  private useSpiritPrimary(context: WeaponUseContext): WeaponUseResult {
    const state = this.getOrCreateSpiritFocus(context.ownerId);
    if (!state.active) {
      return this.activateSpiritFocus(context);
    }
    return this.resolveSpiritBeatAttack(context, "primary");
  }

  private useSpiritSecondary(context: WeaponUseContext): WeaponUseResult {
    const state = this.getOrCreateSpiritFocus(context.ownerId);
    if (!state.active) {
      return this.activateSpiritFocus(context);
    }
    return this.resolveSpiritBeatAttack(context, "secondary");
  }

  private activateSpiritFocus(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "spirit-fighter";
    const owner = this.combatants.get(context.ownerId);
    const state = this.getOrCreateSpiritFocus(context.ownerId);
    if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No fighter" };
    }
    if (state.windedTimer > 0 || owner.statuses.some((status) => status.id === "winded")) {
      return { kind: "blocked", weaponId, label: "Winded" };
    }
    if (state.cooldownTimer > 0 || (this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Spirit cooldown" };
    }
    state.active = true;
    state.timer = spiritMaxDuration;
    state.cooldownTimer = 0;
    state.windedTimer = 0;
    state.beatInterval = spiritInitialBeatInterval;
    state.beatTimer = spiritInitialBeatInterval;
    state.timingWindow = spiritInitialTimingWindow;
    state.beatPattern = "normal";
    state.beatLines = [];
    state.heartAssembleTimer = 0.78;
    state.heartPulseTimer = 0;
    state.heartShakeTimer = 0;
    state.combo = 0;
    state.perfectStreak = 0;
    state.missesUsed = 0;
    state.feedback = "FOCUS";
    state.feedbackTimer = 0.7;
    this.scheduleSpiritBeatPattern(state);
    owner.statuses = owner.statuses.filter((status) => status.id !== "winded");
    owner.statuses = upsertStatusEffect(owner.statuses, createStatus("spiritFocus"));
    const center = { x: owner.x + owner.width / 2, y: owner.y + owner.height / 2 };
    this.addEffect("aura", center.x, center.y, center.x, center.y - 70, colorForWeapon(weaponId), "BEAT FOCUS");
    this.queueSound("spirit-start");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "equip", center, normalize(context.aim), "Spirit Focus", context.now));
    return { kind: "utility", weaponId, label: "Spirit Focus" };
  }

  private resolveSpiritBeatAttack(context: WeaponUseContext, action: "primary" | "secondary"): WeaponUseResult {
    const weaponId: WeaponId = "spirit-fighter";
    const state = this.getOrCreateSpiritFocus(context.ownerId);
    const owner = this.combatants.get(context.ownerId);
    if (!state.active || !owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No focus" };
    }
    const grade = this.consumeSpiritBeat(context.ownerId);
    if (!grade) {
      this.registerSpiritMiss(context.ownerId, "MISS", true);
      return { kind: "blocked", weaponId, label: "Spirit Miss" };
    }

    const range = action === "secondary" ? spiritGrabRange : spiritPunchRange + Math.min(36, state.combo * 4);
    const target = this.findSpiritTarget(context.player, context.aim, range);
    if (!target) {
      this.registerSpiritMiss(context.ownerId, "WHIFF", true);
      return { kind: "blocked", weaponId, label: "Spirit Whiff" };
    }

    state.combo += 1;
    if (grade === "perfect") {
      state.perfectStreak += 1;
    }
    const finisher = action === "primary" && state.combo % 3 === 0;
    const precision = action === "primary" && state.perfectStreak >= 8;
    const flurry = action === "primary" && context.heldMs >= 420 && state.perfectStreak >= 4;
    const damage = action === "secondary"
      ? (grade === "perfect" ? 18 : 12)
      : precision
        ? 42
        : flurry
          ? 20
          : finisher
            ? (grade === "perfect" ? 28 : 22)
            : grade === "perfect"
              ? 12
              : 8;
    const direction = normalize(context.aim.x || context.aim.y ? context.aim : { x: context.player.facing, y: 0 });
    const knockback = action === "secondary"
      ? { x: direction.x * 460, y: -420 }
      : precision
        ? { x: direction.x * 980, y: -620 }
        : finisher
          ? { x: direction.x * 660, y: -460 }
          : flurry
            ? { x: direction.x * 300, y: -160 }
            : { x: direction.x * (grade === "perfect" ? 360 : 260), y: -130 };
    const previousInvulnerable = target.invulnerable;
    target.invulnerable = 0;
    const label = action === "secondary"
      ? `${grade === "perfect" ? "Spirit Perfect" : "Spirit Good"} Throw`
      : precision
        ? "Spirit Precision Finisher"
        : flurry
          ? "Spirit 100-Punch Flurry"
          : finisher
            ? "Spirit Triple Finisher"
            : `Spirit ${grade === "perfect" ? "Perfect" : "Good"} Punch`;
    const hit = this.applyDamage({
      sourceId: context.ownerId,
      targetId: target.id,
      weaponId,
      damage,
      knockback,
      stun: precision ? 0.72 : finisher ? 0.48 : action === "secondary" ? 0.42 : 0.18,
      label,
      status: action === "secondary" || finisher || precision ? "daze" : undefined,
      skipHitLocationScaling: true,
    });
    if (!hit.applied) {
      target.invulnerable = previousInvulnerable;
      this.registerSpiritMiss(context.ownerId, "WHIFF", true);
      return { kind: "blocked", weaponId, label: "Spirit Whiff" };
    }

    this.advanceSpiritBeat(state, grade, label);
    const ownerCenter = { x: owner.x + owner.width / 2, y: owner.y + owner.height * 0.45 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height * 0.45 };
    this.addEffect(precision ? "shockwave" : flurry ? "whip" : "spark", ownerCenter.x, ownerCenter.y, targetCenter.x, targetCenter.y, colorForWeapon(weaponId), grade.toUpperCase());
    this.queueSound(grade === "perfect" ? "spirit-perfect" : "spirit-hit");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, action, ownerCenter, direction, label, context.now, {
      targetId: target.id,
      damage,
      kx: knockback.x,
      ky: knockback.y,
      stun: precision ? 0.72 : finisher ? 0.48 : 0.18,
      status: action === "secondary" || finisher || precision ? "daze" : undefined,
    }));
    if (precision) {
      this.finishSpiritFocus(context.ownerId, "FINISHER");
    }
    return { kind: "hitbox", weaponId, label };
  }

  useSpiritFlashStep(ownerId: string, player: PlayerPhysicsState, direction: Vec2, now: number): WeaponUseResult {
    const weaponId: WeaponId = "spirit-fighter";
    const state = this.getOrCreateSpiritFocus(ownerId);
    if (!state.active) {
      return { kind: "blocked", weaponId, label: "No focus" };
    }
    const grade = this.consumeSpiritBeat(ownerId);
    if (!grade) {
      this.registerSpiritMiss(ownerId, "MISS", true);
      return { kind: "blocked", weaponId, label: "Spirit Miss" };
    }
    const step = normalize(direction.x || direction.y ? direction : { x: player.facing, y: 0 });
    player.velocityX = step.x * spiritFlashStepSpeed;
    player.velocityY = Math.min(player.velocityY, step.y * spiritFlashStepSpeed * 0.32 - 80);
    const owner = this.combatants.get(ownerId);
    if (owner) {
      owner.velocityX = player.velocityX;
      owner.velocityY = player.velocityY;
    }
    this.advanceSpiritBeat(state, grade, "Spirit Flash Step");
    this.addEffect("teleport", player.x + player.width / 2, player.y + player.height / 2, player.x + player.width / 2 + step.x * 46, player.y + player.height / 2 + step.y * 24, colorForWeapon(weaponId), "FLASH");
    this.queueSound("dash");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "secondary", { x: player.x + player.width / 2, y: player.y + player.height / 2 }, step, "Spirit Flash Step", now));
    return { kind: "utility", weaponId, label: "Spirit Flash Step" };
  }

  useSpiritRhythmAction(ownerId: string, player: PlayerPhysicsState, action: "move" | "jump", direction: Vec2, now: number): WeaponUseResult {
    const weaponId: WeaponId = "spirit-fighter";
    const state = this.getOrCreateSpiritFocus(ownerId);
    if (!state.active) {
      return { kind: "blocked", weaponId, label: "No focus" };
    }
    const grade = this.consumeSpiritBeat(ownerId);
    if (!grade) {
      this.registerSpiritMiss(ownerId, "MISS", true);
      return { kind: "blocked", weaponId, label: "Spirit Miss" };
    }
    const owner = this.combatants.get(ownerId);
    const step = normalize(direction.x || direction.y ? direction : { x: player.facing, y: 0 });
    if (action === "jump") {
      const lift = grade === "perfect" ? -640 : -520;
      player.velocityY = Math.min(player.velocityY, lift);
      player.grounded = false;
      if (owner) {
        owner.velocityY = player.velocityY;
      }
    } else {
      const boost = grade === "perfect" ? 360 : 245;
      player.velocityX = clamp(player.velocityX + step.x * boost, -spiritFlashStepSpeed, spiritFlashStepSpeed);
      if (owner) {
        owner.velocityX = player.velocityX;
      }
    }
    this.advanceSpiritBeat(state, grade, action === "jump" ? "Spirit Beat Jump" : "Spirit Beat Step");
    const center = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
    this.addEffect("teleport", center.x, center.y, center.x + step.x * 34, center.y + (action === "jump" ? -36 : 8), colorForWeapon(weaponId), grade === "perfect" ? "PERFECT STEP" : "GOOD STEP");
    this.queueSound(grade === "perfect" ? "spirit-perfect" : "dash");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "secondary", center, step, action === "jump" ? "Spirit Beat Jump" : "Spirit Beat Step", now));
    return { kind: "utility", weaponId, label: action === "jump" ? "Spirit Beat Jump" : "Spirit Beat Step" };
  }

  private consumeSpiritBeat(ownerId: string): "perfect" | "good" | undefined {
    const state = this.getOrCreateSpiritFocus(ownerId);
    const candidates = state.beatLines
      .filter((line) => !line.fake && !line.hit && Math.abs(line.timeToImpact) <= state.timingWindow)
      .sort((left, right) => Math.abs(left.timeToImpact) - Math.abs(right.timeToImpact));
    if (candidates.length === 0) {
      return undefined;
    }
    const nearest = candidates[0];
    const offset = Math.abs(nearest.timeToImpact);
    if (offset > state.timingWindow) {
      return undefined;
    }
    for (const line of state.beatLines) {
      if (!line.fake && !line.hit && Math.abs(line.timeToImpact - nearest.timeToImpact) <= 0.085 && Math.abs(line.timeToImpact) <= state.timingWindow) {
        line.hit = true;
      }
    }
    return offset <= state.timingWindow * 0.46 ? "perfect" : "good";
  }

  private advanceSpiritBeat(state: SpiritFocusState, grade: "perfect" | "good", feedback: string): void {
    state.beatInterval = clamp(spiritInitialBeatInterval - state.combo * 0.018, spiritMinimumBeatInterval, spiritInitialBeatInterval);
    state.timingWindow = clamp(spiritInitialTimingWindow - state.combo * 0.006, spiritMinimumTimingWindow, spiritInitialTimingWindow);
    state.heartPulseTimer = grade === "perfect" ? 0.42 : 0.28;
    state.heartShakeTimer = 0;
    state.beatLines = state.beatLines.filter((line) => !line.hit && (!line.fake || line.timeToImpact > -state.timingWindow));
    const hasPendingLine = state.beatLines.some((line) => !line.fake && !line.hit && line.timeToImpact > -state.timingWindow);
    if (!hasPendingLine) {
      this.scheduleSpiritBeatPattern(state);
    } else {
      this.syncSpiritBeatTimer(state);
    }
    state.feedback = grade === "perfect" ? "PERFECT" : "GOOD";
    if (feedback.includes("Flurry")) {
      state.feedback = "FLURRY";
    } else if (feedback.includes("Finisher")) {
      state.feedback = "FINISHER";
    }
    state.feedbackTimer = 0.65;
  }

  private updateSpiritFocusModes(dt: number): void {
    for (const [ownerId, state] of this.spiritFocusModes.entries()) {
      state.cooldownTimer = Math.max(0, state.cooldownTimer - dt);
      state.windedTimer = Math.max(0, state.windedTimer - dt);
      state.feedbackTimer = Math.max(0, state.feedbackTimer - dt);
      state.heartAssembleTimer = Math.max(0, state.heartAssembleTimer - dt);
      state.heartPulseTimer = Math.max(0, state.heartPulseTimer - dt);
      state.heartShakeTimer = Math.max(0, state.heartShakeTimer - dt);
      if (state.cooldownTimer > 0) {
        this.inventory.cooldowns["spirit-fighter"] = state.cooldownTimer;
      }
      const owner = this.combatants.get(ownerId);
      if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
        if (state.active) {
          this.failSpiritFocus(ownerId, "BROKEN", false);
        }
        continue;
      }
      if (state.windedTimer <= 0 && owner.statuses.some((status) => status.id === "winded")) {
        owner.statuses = owner.statuses.filter((status) => status.id !== "winded");
      }
      if (!state.active) {
        continue;
      }
      state.timer = Math.max(0, state.timer - dt);
      owner.statuses = upsertStatusEffect(owner.statuses, createStatus("spiritFocus"));
      if (state.beatLines.length === 0) {
        this.scheduleSpiritBeatPattern(state);
      }
      for (const line of state.beatLines) {
        const previousTime = line.timeToImpact;
        line.timeToImpact -= dt;
        if (previousTime > 0 && line.timeToImpact <= 0 && !line.beatSounded) {
          line.beatSounded = true;
          const cx = owner.x + owner.width / 2;
          const cy = owner.y + owner.height / 2;
          this.addEffect("aura", cx, cy, cx + (line.side === "left" ? -42 : 42), cy - 58, line.fake ? "#8d93a3" : colorForWeapon("spirit-fighter"), line.fake ? "FEINT" : "BEAT");
          if (!line.fake) {
            state.heartPulseTimer = Math.max(state.heartPulseTimer, 0.18);
            this.queueSound("spirit-beat");
          }
        }
      }
      if (state.timer <= 0) {
        this.finishSpiritFocus(ownerId, "COMPLETE");
        continue;
      }
      this.syncSpiritBeatTimer(state);
      if (state.beatLines.some((line) => !line.fake && !line.hit && line.timeToImpact < -state.timingWindow)) {
        this.registerSpiritMiss(ownerId, "MISS", true);
      }
    }
  }

  private registerSpiritMiss(ownerId: string, feedback: "MISS" | "WHIFF" | "BROKEN" | "HIT", winded: boolean): boolean {
    const state = this.getOrCreateSpiritFocus(ownerId);
    if (!state.active) {
      return false;
    }
    state.missesUsed = Math.min(spiritMaxMisses, state.missesUsed + 1);
    state.combo = 0;
    state.perfectStreak = 0;
    state.heartPulseTimer = 0;
    state.heartShakeTimer = 0.2 + state.missesUsed * 0.08;
    state.feedback = feedback;
    state.feedbackTimer = 0.82;
    const owner = this.combatants.get(ownerId);
    if (owner) {
      const center = { x: owner.x + owner.width / 2, y: owner.y + owner.height / 2 };
      this.addEffect("aura", center.x, center.y, center.x, center.y - 28, "#ff6f91", `${feedback} ${state.missesUsed}/${spiritMaxMisses}`);
    }
    this.queueSound("spirit-miss");
    if (state.missesUsed >= spiritMaxMisses) {
      this.failSpiritFocus(ownerId, feedback, winded);
      return true;
    }
    state.beatLines = [];
    state.beatInterval = spiritInitialBeatInterval;
    state.beatTimer = spiritInitialBeatInterval;
    state.timingWindow = spiritInitialTimingWindow;
    this.scheduleSpiritBeatPattern(state);
    return false;
  }

  private failSpiritFocus(ownerId: string, feedback: string, winded: boolean): void {
    const state = this.spiritFocusModes.get(ownerId);
    if (!state || (!state.active && (!winded || state.windedTimer > 0))) {
      return;
    }
    state.active = false;
    state.timer = 0;
    state.combo = 0;
    state.perfectStreak = 0;
    state.missesUsed = Math.max(state.missesUsed, feedback === "MISS" || feedback === "WHIFF" || feedback === "HIT" || feedback === "BROKEN" ? spiritMaxMisses : state.missesUsed);
    state.beatTimer = state.beatInterval;
    state.beatLines = [];
    state.heartPulseTimer = 0;
    state.heartShakeTimer = 0.42;
    state.feedback = feedback;
    state.feedbackTimer = 1.2;
    state.cooldownTimer = spiritCooldownDuration;
    this.inventory.cooldowns["spirit-fighter"] = spiritCooldownDuration;
    const owner = this.combatants.get(ownerId);
    if (owner) {
      owner.statuses = owner.statuses.filter((status) => status.id !== "spiritFocus");
      if (winded) {
        state.windedTimer = spiritWindedDuration;
        owner.statuses = upsertStatusEffect(owner.statuses, createStatus("winded"));
      }
      this.addEffect("aura", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2, owner.y - 36, "#ff6f91", feedback);
    }
    this.queueSound("spirit-miss");
  }

  private finishSpiritFocus(ownerId: string, feedback: string): void {
    const state = this.spiritFocusModes.get(ownerId);
    if (!state) {
      return;
    }
    state.active = false;
    state.timer = 0;
    state.combo = 0;
    state.perfectStreak = 0;
    state.missesUsed = 0;
    state.beatLines = [];
    state.heartPulseTimer = 0.32;
    state.heartShakeTimer = 0;
    state.feedback = feedback;
    state.feedbackTimer = 1;
    state.cooldownTimer = spiritCooldownDuration;
    this.inventory.cooldowns["spirit-fighter"] = spiritCooldownDuration;
    const owner = this.combatants.get(ownerId);
    if (owner) {
      owner.statuses = owner.statuses.filter((status) => status.id !== "spiritFocus");
      this.addEffect("shockwave", owner.x + owner.width / 2, owner.y + owner.height / 2, owner.x + owner.width / 2 + owner.velocityX * 0.08, owner.y, colorForWeapon("spirit-fighter"), feedback);
    }
    this.queueSound("spirit-perfect");
  }

  private findSpiritTarget(player: PlayerPhysicsState, aim: Vec2, range: number): Combatant | undefined {
    const direction = normalize(aim.x || aim.y ? aim : { x: player.facing, y: 0 });
    const origin = this.muzzle(player);
    let nearest: { target: Combatant; forward: number } | undefined;
    for (const target of this.combatants.values()) {
      if (target.id === player.id || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height * 0.45;
      const dx = tx - origin.x;
      const dy = ty - origin.y;
      const forward = dx * direction.x + dy * direction.y;
      const lateral = Math.abs(-direction.y * dx + direction.x * dy);
      if (forward < -14 || forward > range || lateral > spiritLaneHalfWidth) {
        continue;
      }
      if (!nearest || forward < nearest.forward) {
        nearest = { target, forward };
      }
    }
    return nearest?.target;
  }

  private getOrCreateSpiritFocus(ownerId: string): SpiritFocusState {
    let state = this.spiritFocusModes.get(ownerId);
    if (!state) {
      state = {
        ownerId,
        active: false,
        timer: 0,
        cooldownTimer: 0,
        windedTimer: 0,
        beatInterval: spiritInitialBeatInterval,
        beatTimer: spiritInitialBeatInterval,
        timingWindow: spiritInitialTimingWindow,
        beatPattern: "normal",
        beatLines: [],
        heartAssembleTimer: 0,
        heartPulseTimer: 0,
        heartShakeTimer: 0,
        combo: 0,
        perfectStreak: 0,
        missesUsed: 0,
        feedback: "",
        feedbackTimer: 0,
      };
      this.spiritFocusModes.set(ownerId, state);
    }
    return state;
  }

  private scheduleSpiritBeatPattern(state: SpiritFocusState): void {
    const difficulty = state.combo + Math.floor(state.perfectStreak / 2);
    const patterns: SpiritBeatPattern[] = difficulty < 2
      ? ["normal", "split", "slow"]
      : difficulty < 5
        ? ["normal", "split", "fast", "double", "slow"]
        : difficulty < 9
          ? ["split", "fast", "double", "burst", "unsynced"]
          : ["fast", "double", "burst", "unsynced", "fake"];
    const pattern = patterns[(state.combo + state.perfectStreak) % patterns.length];
    const base = clamp(spiritInitialBeatInterval - difficulty * 0.022, spiritMinimumBeatInterval, spiritInitialBeatInterval);
    const cues: Array<{ side: SpiritBeatSide; time: number; fake?: boolean }> = [];
    switch (pattern) {
      case "split":
        cues.push({ side: "left", time: base * 0.86 }, { side: "right", time: base * 1.08 });
        break;
      case "fast":
        cues.push({ side: "left", time: Math.max(spiritMinimumBeatInterval, base * 0.74) }, { side: "right", time: Math.max(spiritMinimumBeatInterval, base * 0.74) });
        break;
      case "slow":
        cues.push({ side: "left", time: base * 1.24 }, { side: "right", time: base * 1.24 });
        break;
      case "double":
        cues.push({ side: "left", time: base * 0.9 }, { side: "right", time: base * 0.9 }, { side: "left", time: base * 1.18 }, { side: "right", time: base * 1.18 });
        break;
      case "burst":
        cues.push({ side: "left", time: base * 0.72 }, { side: "right", time: base * 0.9 }, { side: "left", time: base * 1.08 }, { side: "right", time: base * 1.26 });
        break;
      case "unsynced":
        cues.push({ side: "left", time: base * 0.82 }, { side: "right", time: base * 1.22 });
        break;
      case "fake":
        cues.push({ side: "left", time: base * 0.72, fake: true }, { side: "right", time: base }, { side: "left", time: base * 1.18 });
        break;
      case "normal":
      default:
        cues.push({ side: "left", time: base }, { side: "right", time: base });
        break;
    }
    state.beatPattern = pattern;
    state.beatInterval = Math.max(...cues.filter((cue) => !cue.fake).map((cue) => cue.time), base);
    state.timingWindow = clamp(spiritInitialTimingWindow - difficulty * 0.006, spiritMinimumTimingWindow, spiritInitialTimingWindow);
    state.beatLines = cues.map((cue, index) => ({
      id: `${state.ownerId}-${state.combo}-${state.perfectStreak}-${pattern}-${index}`,
      side: cue.side,
      duration: cue.time,
      timeToImpact: cue.time,
      fake: Boolean(cue.fake),
      hit: false,
      beatSounded: false,
    }));
    this.syncSpiritBeatTimer(state);
  }

  private syncSpiritBeatTimer(state: SpiritFocusState): void {
    const next = state.beatLines
      .filter((line) => !line.fake && !line.hit)
      .sort((left, right) => Math.abs(left.timeToImpact) - Math.abs(right.timeToImpact))[0];
    state.beatTimer = next?.timeToImpact ?? state.beatInterval;
  }

  private toggleVan(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "van";
    const owner = this.combatants.get(context.ownerId);
    if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
      return { kind: "blocked", weaponId, label: "No driver" };
    }
    const van = this.getOrCreateVan(context.ownerId);
    if (van.state === "active" || van.state === "emerging" || van.state === "absorbing") {
      van.state = "absorbing";
      van.age = 0;
      van.occupantId = undefined;
      van.velocityX *= 0.45;
      van.velocityY *= 0.45;
      this.addEffect("tracer", van.x + van.width / 2, van.y + van.height / 2, owner.x + owner.width / 2, owner.y + owner.height / 2, colorForWeapon(weaponId), "VAN ABSORB");
      this.queueSound("van-absorb");
      this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "secondary", { x: van.x + van.width / 2, y: van.y + van.height / 2 }, { x: context.player.facing, y: 0 }, "Van Absorb", context.now));
      return { kind: "utility", weaponId, label: "Van Absorb" };
    }
    if (van.state === "destroyed" && van.health < vanDestroyedRepairThreshold) {
      return { kind: "blocked", weaponId, label: "Van wrecked" };
    }
    const facing = facingFromAim(context.aim.x, context.player.facing);
    const floorY = COMBAT_TUNING.projectiles.floorY - van.height;
    const bodyY = context.player.y + context.player.height / 2 - van.height / 2;
    van.state = "emerging";
    van.age = 0;
    van.facing = facing;
    van.x = context.player.x + context.player.width / 2 + facing * 38 - van.width / 2;
    van.y = context.player.grounded ? floorY : Math.min(bodyY, floorY - 1);
    van.velocityX = context.player.velocityX * 0.45 + facing * 420;
    van.velocityY = context.player.grounded ? -34 : Math.max(0, context.player.velocityY);
    van.occupantId = undefined;
    van.speedLevel = clamp(van.speedLevel, 0, 5);
    van.damageFlash = 0;
    van.smokeTimer = 0;
    this.addEffect("shockwave", van.x + van.width / 2, van.y + van.height, van.x + van.width / 2 + facing * 54, van.y + van.height, colorForWeapon(weaponId), "VAN SPAWN");
    this.queueSound("van-spawn");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", { x: van.x + van.width / 2, y: van.y + van.height / 2 }, { x: facing, y: 0 }, "Van Spawn", context.now));
    return { kind: "utility", weaponId, label: "Van Spawn" };
  }

  tryEnterVan(driverId: string, player: PlayerPhysicsState, point: Vec2, now: number): WeaponUseResult {
    const driverCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
    const van = this.vans.find((item) =>
      (item.state === "active" || item.state === "emerging")
      && (
        (point.x >= item.x - 18
          && point.x <= item.x + item.width + 18
          && point.y >= item.y - 18
          && point.y <= item.y + item.height + 20)
        || distanceRectToPoint(item, driverCenter) <= 150
        || intersectsRect(item, {
          x: player.x - 28,
          y: player.y - 18,
          width: player.width + 56,
          height: player.height + 36,
        })
      )
    );
    if (!van) {
      return { kind: "blocked", weaponId: "van", label: "No van" };
    }
    const driver = this.combatants.get(driverId);
    if (!driver || driver.respawnTimer > 0 || driver.hp <= 0) {
      return { kind: "blocked", weaponId: "van", label: "No driver" };
    }
    if (van.occupantId && van.occupantId !== driverId) {
      return { kind: "blocked", weaponId: "van", label: "Occupied" };
    }
    const vanCenter = { x: van.x + van.width / 2, y: van.y + van.height / 2 };
    if (Math.hypot(driverCenter.x - vanCenter.x, driverCenter.y - vanCenter.y) > 230) {
      return { kind: "blocked", weaponId: "van", label: "Too far" };
    }
    van.occupantId = driverId;
    this.placeDriverInVan(van, player);
    this.placeCombatantDriverInVan(van, driver);
    this.addEffect("pickup", vanCenter.x, vanCenter.y, vanCenter.x, vanCenter.y - 28, colorForWeapon("van"), "ENTER");
    this.queueSound("van-enter");
    this.recentEvents.push(this.createEvent(driverId, "van", "equip", vanCenter, { x: van.facing, y: 0 }, "Enter Van", now));
    return { kind: "utility", weaponId: "van", label: "Enter Van" };
  }

  handleVanDriverInput(driverId: string, input: VanDriverInput, player: PlayerPhysicsState, now: number): WeaponUseResult | null {
    const van = this.getVanDrivenBy(driverId);
    if (!van || van.state !== "active") {
      return null;
    }
    if (input.jumpPressed) {
      this.exitVan(van, player, now);
      return { kind: "utility", weaponId: "van", label: "Exit Van" };
    }
    if (input.shiftPressed) {
      van.speedLevel = (van.speedLevel + 1) % 6;
      this.addEffect("muzzle", van.x + van.width / 2, van.y + 20, van.x + van.width / 2 + van.facing * 34, van.y + 20, colorForWeapon("van"), `SPEED ${van.speedLevel}`);
      this.queueSound("van-shift");
    }
    const throttle = Number(input.right) - Number(input.left);
    if (throttle !== 0 && van.gas > 0) {
      van.facing = throttle < 0 ? -1 : 1;
      van.velocityX += throttle * (vanDriveAcceleration / 60 + van.speedLevel * 22);
      this.addEffect("tracer", van.x + van.width / 2 - van.facing * 36, van.y + van.height - 8, van.x + van.width / 2 - van.facing * 70, van.y + van.height - 5, "#b8bfd7", "DUST");
    }
    if (input.honkPressed) {
      return this.honkVan(van, driverId, now);
    }
    return null;
  }

  damageVan(vanId: string, damage: number, sourceId: string, now = performanceNow(), force?: Vec2): boolean {
    const van = this.vans.find((item) => item.id === vanId);
    if (!van || van.state === "stored" || van.state === "destroyed" || van.health <= 0) {
      return false;
    }
    van.health = Math.max(0, van.health - damage);
    van.damageFlash = 0.22;
    if (force) {
      van.velocityX += force.x * 0.34;
      van.velocityY += force.y * 0.34;
    } else {
      van.velocityX += Math.sign((van.x + van.width / 2) - (this.combatants.get(sourceId)?.x ?? van.x) || 1) * Math.min(260, damage * 4);
    }
    this.addEffect("spark", van.x + van.width / 2, van.y + van.height * 0.45, van.x + van.width / 2, van.y, colorForWeapon("van"), "VAN HIT");
    this.queueSound("van-hit");
    if (van.health > 0) {
      return true;
    }
    this.explodeVan(van, sourceId, now);
    return true;
  }

  private fireGrapplingHook(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "grappling-hook";
    if (this.activeGrapple(context.ownerId)) {
      return this.releaseGrapplingHook(context.ownerId, context.now, "primary");
    }
    if ((this.inventory.cooldowns[weaponId] ?? 0) > 0) {
      return { kind: "blocked", weaponId, label: "Cooldown" };
    }
    const aim = normalize(context.aim);
    const start = this.muzzle(context.player);
    const end = {
      x: start.x + aim.x * 24,
      y: start.y + aim.y * 24,
    };
    const grapple: GrappleState = {
      id: this.makeId("grapple"),
      ownerId: context.ownerId,
      state: "flying",
      x: end.x,
      y: end.y,
      vx: aim.x * grappleHookSpeed,
      vy: aim.y * grappleHookSpeed,
      age: 0,
      ropeLength: 120,
      anchorX: end.x,
      anchorY: end.y,
      maxRange: grappleHookRange,
      points: createRopePoints(start, end, grappleHookRopePoints),
    };
    this.grapples.push(grapple);
    this.inventory.cooldowns[weaponId] = weaponRegistry.get(weaponId).primary.cooldown;
    this.addEffect("tracer", start.x, start.y, start.x + aim.x * 92, start.y + aim.y * 92, colorForWeapon(weaponId), "Grapple Fire");
    this.queueSound("grapple-fire");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", start, aim, "Grapple Fire", context.now));
    return { kind: "fired", weaponId, label: "Grapple Fire" };
  }

  private pullGrapplingHook(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "grappling-hook";
    const grapple = this.activeGrapple(context.ownerId);
    if (!grapple) {
      return { kind: "blocked", weaponId, label: "No grapple" };
    }
    if (grapple.state !== "attached") {
      return { kind: "blocked", weaponId, label: "Hook flying" };
    }
    grapple.pulling = true;
    grapple.pullTimer = 0.18;
    grapple.ropeLength = Math.max(82, grapple.ropeLength - 18);
    const ownerAnchor = this.ownerRopeAnchor(context.ownerId, [context.player]) ?? this.muzzle(context.player);
    this.addEffect("tracer", ownerAnchor.x, ownerAnchor.y, grapple.anchorX, grapple.anchorY, colorForWeapon(weaponId), "Grapple Pull");
    this.queueSound("grapple-attach");
    this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "secondary", ownerAnchor, normalize({ x: grapple.anchorX - ownerAnchor.x, y: grapple.anchorY - ownerAnchor.y }), "Grapple Pull", context.now));
    return { kind: "utility", weaponId, label: "Grapple Pull" };
  }

  private releaseGrapplingHook(ownerId: string, now: number, action: "primary" | "secondary" = "primary"): WeaponUseResult {
    const weaponId: WeaponId = "grappling-hook";
    const grapple = this.activeGrapple(ownerId);
    if (!grapple) {
      return { kind: "blocked", weaponId, label: "No grapple" };
    }
    const point = { x: grapple.x, y: grapple.y };
    removeWhere(this.grapples, (item) => item.ownerId === ownerId);
    this.inventory.cooldowns[weaponId] = Math.max(this.inventory.cooldowns[weaponId] ?? 0, weaponRegistry.get(weaponId).secondary.cooldown);
    this.addEffect("spark", point.x, point.y, point.x, point.y - 28, colorForWeapon(weaponId), "Release");
    this.queueSound("grapple-release");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, action, point, { x: 0, y: -1 }, "Grapple Release", now));
    return { kind: "utility", weaponId, label: "Grapple Release" };
  }

  private useChainsawPrimary(context: WeaponUseContext): WeaponUseResult {
    const weaponId: WeaponId = "chainsaw";
    const state = this.getOrCreateChainsaw(context.ownerId);
    state.aim = normalize(context.aim);
    if (state.mode === "overheated") {
      if (state.cooldownTimer > 0) {
        return { kind: "blocked", weaponId, label: "Overheated" };
      }
      state.mode = "idle";
      state.activeTimer = 0;
      state.tickTimer = 0;
    }
    if (state.mode === "idle") {
      state.mode = "running";
      state.activeTimer = 0;
      state.tickTimer = 0;
      this.inventory.cooldowns[weaponId] = Math.max(this.inventory.cooldowns[weaponId] ?? 0, 0.04);
      this.addEffect("muzzle", context.player.x + context.player.width / 2, context.player.y + 22, context.player.x + context.player.width / 2 + state.aim.x * 48, context.player.y + 22 + state.aim.y * 18, colorForWeapon(weaponId), "RUNNING");
      this.recentEvents.push(this.createEvent(context.ownerId, weaponId, "primary", this.muzzle(context.player), state.aim, "Chainsaw Running", context.now));
    }
    this.queueSound("chainsaw-run");
    return { kind: "utility", weaponId, label: "Running" };
  }

  private stopChainsaw(ownerId: string, now: number): WeaponUseResult {
    const weaponId: WeaponId = "chainsaw";
    const state = this.chainsaws.get(ownerId);
    if (!state || state.mode === "idle") {
      return { kind: "blocked", weaponId, label: "Chainsaw idle" };
    }
    if (state.mode === "overheated" && state.cooldownTimer > 0) {
      return { kind: "blocked", weaponId, label: "Overheated" };
    }
    state.mode = "idle";
    state.activeTimer = 0;
    state.tickTimer = 0;
    this.inventory.cooldowns[weaponId] = Math.max(this.inventory.cooldowns[weaponId] ?? 0, weaponRegistry.get(weaponId).secondary.cooldown);
    const owner = this.combatants.get(ownerId);
    const center = owner ? { x: owner.x + owner.width / 2, y: owner.y + 22 } : { x: 0, y: 0 };
    this.addEffect("spark", center.x, center.y, center.x, center.y - 20, colorForWeapon(weaponId), "Stop");
    this.recentEvents.push(this.createEvent(ownerId, weaponId, "secondary", center, { x: 0, y: -1 }, "Chainsaw Stop", now));
    return { kind: "utility", weaponId, label: "Chainsaw Stop" };
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
    for (const van of this.vans) {
      if (van.state === "stored" || van.state === "destroyed" || van.health <= 0) {
        continue;
      }
      const vx = van.x + van.width / 2;
      const vy = van.y + van.height / 2;
      const distance = Math.hypot(vx - options.x, vy - options.y);
      if (distance > options.radius) {
        continue;
      }
      const falloff = 1 - distance / options.radius;
      const damage = Math.round(lerp(options.edgeDamage, options.centerDamage, falloff) * 0.82);
      const knockback = lerp(options.edgeKnockback, options.centerKnockback, falloff);
      const direction = normalize({ x: vx - options.x || 1, y: vy - options.y || -0.2 });
      this.damageVan(van.id, damage, options.sourceId, performanceNow(), {
        x: direction.x * knockback * 0.62,
        y: -Math.abs(direction.y * knockback) * 0.62 - lerp(260, 520, falloff),
      });
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
      const projectileSpeed = (profile.speed ?? 600) * speedBonus;
      const isTeleportBall = weaponId === "teleport-ball";
      const projectileVx = shot.x * projectileSpeed;
      const projectileVy = shot.y * projectileSpeed - (isTeleportBall ? teleportBallUpwardBoost : 0);
      this.projectiles.push({
        id: projectileId,
        ownerId: context.ownerId,
        weaponId,
        x: muzzle.x,
        y: muzzle.y,
        vx: projectileVx,
        vy: projectileVy,
        radius: (profile.radius ?? 5) * Math.min(chargeMultiplier, 2.6),
        damage: Math.round(profile.damage * Math.min(chargeMultiplier, 3)),
        knockback: { x: shot.x * profile.knockback * speedBonus, y: shot.y * profile.knockback - 30 },
        stun: profile.stun,
        age: 0,
        lifetime: isTeleportBall ? teleportBallLifetime : profile.range / Math.max(profile.speed ?? 600, 1),
        gravity: profile.gravity ?? 0,
        bounces: profile.bounces ?? 0,
        pierce: profile.pierce ?? 0,
        label: projectileLabelFor(weaponId, slot),
        color: colorForWeapon(weaponId),
        trailColor: colorForWeapon(weaponId),
        originX: muzzle.x,
        originY: muzzle.y,
        teleportsOwner: isTeleportBall,
        pulseTimer: 0,
        status: profile.status,
        hits: [],
      });
      if (isTeleportBall) {
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

    this.holyBazookaAmmoCooldown = Math.max(0, this.holyBazookaAmmoCooldown - dt);

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

  private spawnHolyBazookaAmmoPickup(player: PlayerPhysicsState): AmmoPickup {
    const anchorX = player.x + player.width / 2;
    const anchorY = player.y + player.height / 2;
    const left = DEFAULT_PHYSICS.platformLeft + 90;
    const right = DEFAULT_PHYSICS.platformRight - 90;
    let x = left;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const seed = (this.holyBazookaAmmoSpawnIndex * 997 + attempt * 431 + 193) % 1000;
      x = left + (right - left) * (seed / 1000);
      if (Math.abs(x - anchorX) > 180) {
        break;
      }
    }
    if (Math.abs(x - anchorX) <= 180) {
      x = clamp(anchorX + (anchorX < (left + right) / 2 ? 260 : -260), left, right);
    }
    const y = DEFAULT_PHYSICS.groundY - 20;
    if (Math.hypot(x - anchorX, y - anchorY) < 120) {
      x = clamp(anchorX + 220, left, right);
    }
    this.holyBazookaAmmoSpawnIndex += 1;
    const pickup: AmmoPickup = {
      id: this.makeId("ammo"),
      weaponId: "holy-bazooka",
      x,
      y,
      age: 0,
    };
    this.ammoPickups.push(pickup);
    this.addEffect("aura", x, y, x, y - 42, colorForWeapon("holy-bazooka"), "HOLY AMMO");
    return pickup;
  }

  private activeGrapple(ownerId: string): GrappleState | undefined {
    return this.grapples.find((grapple) => grapple.ownerId === ownerId);
  }

  private updateGrapples(dt: number, players: PlayerPhysicsState[]): void {
    for (const grapple of [...this.grapples]) {
      const ownerAnchor = this.ownerRopeAnchor(grapple.ownerId, players);
      if (!ownerAnchor) {
        removeWhere(this.grapples, (item) => item === grapple);
        continue;
      }
      grapple.age += dt;
      grapple.pullTimer = Math.max(0, (grapple.pullTimer ?? 0) - dt);
      grapple.pulling = (grapple.pullTimer ?? 0) > 0;

      if (grapple.state === "flying") {
        const previousX = grapple.x;
        const previousY = grapple.y;
        grapple.x += grapple.vx * dt;
        grapple.y += grapple.vy * dt;
        grapple.vy += 120 * dt;
        grapple.anchorX = grapple.x;
        grapple.anchorY = grapple.y;
        this.addEffect("tracer", grapple.x, grapple.y, previousX, previousY, colorForWeapon("grappling-hook"), "Rope");

        const target = grapple.visualOnly ? undefined : this.findGrappleTarget(grapple, previousX, previousY);
        if (target) {
          this.attachGrappleToTarget(grapple, target);
        } else if (grapple.y >= DEFAULT_PHYSICS.groundY - grappleHookRadius && grapple.x >= DEFAULT_PHYSICS.platformLeft && grapple.x <= DEFAULT_PHYSICS.platformRight) {
          this.attachGrappleToPoint(grapple, grapple.x, DEFAULT_PHYSICS.groundY - grappleHookRadius);
        } else if (grapple.x <= DEFAULT_PHYSICS.platformLeft || grapple.x >= DEFAULT_PHYSICS.platformRight) {
          this.attachGrappleToPoint(grapple, clamp(grapple.x, DEFAULT_PHYSICS.platformLeft, DEFAULT_PHYSICS.platformRight), grapple.y);
        } else if (Math.hypot(grapple.x - ownerAnchor.x, grapple.y - ownerAnchor.y) > grapple.maxRange) {
          removeWhere(this.grapples, (item) => item === grapple);
          this.addEffect("spark", grapple.x, grapple.y, grapple.x, grapple.y - 18, colorForWeapon("grappling-hook"), "Miss");
          this.queueSound("grapple-release");
          continue;
        }
      }

      if (grapple.state === "attached") {
        if (grapple.targetId) {
          const target = this.combatants.get(grapple.targetId);
          if (!target || target.respawnTimer > 0 || target.hp <= 0) {
            removeWhere(this.grapples, (item) => item === grapple);
            continue;
          }
          grapple.anchorX = target.x + target.width / 2;
          grapple.anchorY = target.y + target.height * 0.34;
          grapple.x = grapple.anchorX;
          grapple.y = grapple.anchorY;
        }
        if (grapple.pulling) {
          grapple.ropeLength = Math.max(82, grapple.ropeLength - dt * 440);
        }
        if (!grapple.visualOnly) {
          this.applyGrapplePull(grapple, players, dt);
        }
        if (Math.hypot(grapple.anchorX - ownerAnchor.x, grapple.anchorY - ownerAnchor.y) > grappleHookSnapDistance) {
          removeWhere(this.grapples, (item) => item === grapple);
          this.addEffect("spark", grapple.anchorX, grapple.anchorY, grapple.anchorX, grapple.anchorY - 28, colorForWeapon("grappling-hook"), "Snap");
          this.queueSound("grapple-release");
          continue;
        }
      }

      this.syncGrappleRope(grapple, ownerAnchor, { x: grapple.anchorX, y: grapple.anchorY }, dt);
    }
  }

  private updateChainsaws(dt: number): void {
    for (const [ownerId, state] of this.chainsaws.entries()) {
      const owner = this.combatants.get(ownerId);
      if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
        state.mode = "idle";
        continue;
      }
      if (state.mode === "idle") {
        continue;
      }
      if (state.mode === "overheated") {
        state.cooldownTimer = Math.max(0, state.cooldownTimer - dt);
        this.inventory.cooldowns["chainsaw"] = state.cooldownTimer;
        if (state.cooldownTimer === 0) {
          state.mode = "idle";
          state.activeTimer = 0;
        }
        continue;
      }
      const activeDt = dt;
      state.activeTimer += activeDt;
      state.tickTimer -= activeDt;
      if (state.activeTimer >= chainsawOverheatSeconds) {
        state.mode = "overheated";
        state.cooldownTimer = chainsawCooldownSeconds;
        state.tickTimer = 0;
        this.inventory.cooldowns["chainsaw"] = chainsawCooldownSeconds;
        this.addEffect("shockwave", owner.x + owner.width / 2, owner.y + 22, owner.x + owner.width / 2, owner.y - 24, colorForWeapon("chainsaw"), "OVERHEAT");
        this.queueSound("chainsaw-overheat");
        continue;
      }
      if (state.activeTimer % 0.42 < activeDt) {
        this.addEffect("tracer", owner.x + owner.width / 2, owner.y + 22, owner.x + owner.width / 2 + state.aim.x * 58, owner.y + 22 + state.aim.y * 22, colorForWeapon("chainsaw"), "Saw");
        this.queueSound("chainsaw-run");
      }
      while (state.tickTimer <= 0) {
        state.tickTimer += chainsawTickInterval;
        this.applyChainsawTick(ownerId, owner, state);
      }
    }
  }

  private applyChainsawTick(ownerId: string, owner: Combatant, state: ChainsawState): void {
    const dps = this.chainsawDps(ownerId);
    const damage = dps * chainsawTickInterval;
    const origin = { x: owner.x + owner.width / 2, y: owner.y + owner.height * 0.48 };
    const sawTip = { x: origin.x + state.aim.x * chainsawRange, y: origin.y + state.aim.y * chainsawRange };
    let hitAny = false;
    for (const target of this.combatants.values()) {
      if (target.id === ownerId || target.respawnTimer > 0 || target.hp <= 0 || target.id.startsWith("zombie-")) {
        continue;
      }
      if (!isTargetInChainsawArc(target, origin, state.aim)) {
        continue;
      }
      const previousInvulnerable = target.invulnerable;
      const hpBefore = target.hp;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: ownerId,
        targetId: target.id,
        weaponId: "chainsaw",
        damage,
        knockback: { x: 0, y: 0 },
        stun: 0.04,
        label: "Chainsaw",
        status: "bleed",
        skipHitLocationScaling: true,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
        continue;
      }
      hitAny = true;
      state.damageTotal += Math.max(0, hpBefore - target.hp);
      this.addEffect("spark", target.x + target.width / 2, target.y + target.height / 2, sawTip.x, sawTip.y, colorForWeapon("chainsaw"), "SAW HIT");
    }
    if (hitAny) {
      this.queueSound("chainsaw-hit");
    }
  }

  private updateZombies(dt: number): void {
    for (const [id, zombie] of [...this.zombies.entries()]) {
      const body = this.combatants.get(id);
      if (!body) {
        this.zombies.delete(id);
        continue;
      }
      if (body.respawnTimer > 0 || body.hp <= 0) {
        this.removeZombiePermanently(id, "ZOMBIE DOWN");
        continue;
      }
      zombie.age += dt;
      zombie.biteTimer = Math.max(0, zombie.biteTimer - dt);
      zombie.biteAnim = Math.max(0, zombie.biteAnim - dt);
      zombie.wanderTimer = Math.max(0, zombie.wanderTimer - dt);
      if (zombie.riseTimer > 0) {
        zombie.riseTimer = Math.max(0, zombie.riseTimer - dt);
        const progress = 1 - zombie.riseTimer / zombie.riseDuration;
        body.x = body.spawnX;
        body.y = body.spawnY + body.height * (1 - easeOutCubic(progress)) * 0.72;
        body.velocityX = 0;
        body.velocityY = 0;
        body.hitstun = Math.max(body.hitstun, 0.12);
        body.invulnerable = Math.max(body.invulnerable, zombie.riseTimer + 0.08);
        if (zombie.age % 0.18 < dt) {
          this.addEffect("spark", body.x + body.width / 2, body.spawnY + body.height - 4, body.x + body.width / 2 + zombie.wanderDirection * 24, body.spawnY + body.height - 22, "#5a3a22", "DIRT");
        }
        if (zombie.riseTimer === 0) {
          body.y = body.spawnY;
          body.invulnerable = 0.12;
          this.addEffect("aura", body.x + body.width / 2, body.y + body.height - 6, body.x + body.width / 2, body.y - 44, "#164f24", "ZOMBIE UP");
        }
        continue;
      }
      const target = this.findZombieTarget(zombie, body);
      if (target) {
        zombie.targetId = target.id;
        const bodyCenter = { x: body.x + body.width / 2, y: body.y + body.height / 2 };
        const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
        const dx = targetCenter.x - bodyCenter.x;
        const distance = Math.hypot(dx, targetCenter.y - bodyCenter.y);
        const direction = dx >= 0 ? 1 : -1;
        zombie.wanderDirection = direction;
        body.velocityX = direction * zombie.speed * (distance < 96 ? 1.2 : 1);
        if (distance <= zombieBiteRange && zombie.biteTimer === 0) {
          this.applyZombieBite(zombie, body, target, direction);
        } else if (zombie.age % 0.36 < dt) {
          this.addEffect("spark", body.x + body.width / 2, body.y + body.height - 8, body.x + body.width / 2 - direction * 30, body.y + body.height - 4, "#164f24", "Zombie Run");
        }
      } else {
        zombie.targetId = undefined;
        if (zombie.wanderTimer === 0) {
          zombie.wanderTimer = 0.7 + (Math.sin(zombie.age * 2.7 + id.length) + 1) * 0.65;
          zombie.wanderDirection = Math.sin(zombie.age * 3.1 + id.length) >= 0 ? 1 : -1;
        }
        body.velocityX = zombie.wanderDirection * Math.max(48, zombie.speed * 0.24);
      }
    }
  }

  private updateSpikes(dt: number, players: PlayerPhysicsState[]): void {
    for (const [ownerId, mode] of [...this.spikeModes.entries()]) {
      const owner = this.combatants.get(ownerId);
      if (mode.activeTimer > 0) {
        if (!owner || owner.respawnTimer > 0 || owner.hp <= 0) {
          this.endSpikeMode(ownerId, false);
          continue;
        }
        mode.activeTimer = Math.max(0, mode.activeTimer - dt);
        mode.particleTimer -= dt;
        owner.statuses = upsertStatusEffect(owner.statuses, createStatus("spikeMode"));
        if (mode.particleTimer <= 0) {
          mode.particleTimer += 0.16;
          this.spawnSpikeModeParticles(owner, 3);
        }
        if (mode.activeTimer === 0) {
          this.endSpikeMode(ownerId, true);
        }
        continue;
      }
      if (mode.cooldownTimer > 0) {
        mode.cooldownTimer = Math.max(0, mode.cooldownTimer - dt);
        this.inventory.cooldowns.spikes = mode.cooldownTimer;
      }
    }

    for (const spike of this.spikes) {
      if (spike.disintegrating) {
        spike.disintegrateAge += dt;
        continue;
      }
      spike.age += dt;
      if (spike.visualOnly && spike.age >= spikeModeDuration) {
        this.disintegrateSpike(spike);
        continue;
      }
      this.applySpikeContacts(spike);
    }

    for (const [targetId, impale] of [...this.spikeImpales.entries()]) {
      const target = this.combatants.get(targetId);
      const spike = this.spikes.find((item) => item.id === impale.spikeId);
      if (!target || target.respawnTimer > 0 || target.hp <= 0 || !spike || spike.disintegrating) {
        this.releaseSpikeImpale(targetId);
        continue;
      }
      const pin = spikeCurrentTip(spike);
      const x = pin.x - target.width / 2 - spike.dirX * 8;
      const y = pin.y - target.height / 2 - spike.dirY * 10;
      impale.x = x;
      impale.y = y;
      target.x = x;
      target.y = y;
      target.velocityX = 0;
      target.velocityY = 0;
      target.hitstun = Math.max(target.hitstun, 0.12);
      target.statuses = upsertStatusEffect(target.statuses, createStatus("spikePoison"));
      const player = players.find((item) => item.id === targetId);
      if (player) {
        player.x = x;
        player.y = y;
        player.velocityX = 0;
        player.velocityY = 0;
      }
    }

    for (const particle of this.spikeParticles) {
      particle.age += dt;
      particle.vy += 780 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.y > COMBAT_TUNING.projectiles.floorY) {
        particle.y = COMBAT_TUNING.projectiles.floorY;
        particle.vy *= -0.18;
        particle.vx *= 0.68;
      }
    }

    removeWhere(this.spikes, (spike) => {
      const expired = spike.disintegrating && spike.disintegrateAge >= spikeDisintegrateDuration;
      if (expired) {
        this.releaseSpikeTargets(spike);
      }
      return expired;
    });
    removeWhere(this.spikeParticles, (particle) => particle.age >= particle.lifetime);
  }

  private applyZombieBite(zombie: ZombieState, body: Combatant, target: Combatant, direction: -1 | 1): void {
    const previousInvulnerable = target.invulnerable;
    target.invulnerable = 0;
    const hit = this.applyDamage({
      sourceId: zombie.id,
      targetId: target.id,
      weaponId: "chainsaw",
      damage: zombie.biteDamage,
      knockback: { x: direction * 180, y: -90 },
      stun: 0.24,
      label: "Zombie Bite",
      status: "poison",
      skipHitLocationScaling: true,
    });
    if (!hit.applied) {
      target.invulnerable = previousInvulnerable;
      return;
    }
    zombie.biteTimer = zombieBiteCooldown;
    zombie.biteAnim = 0.28;
    body.velocityX = direction * zombie.speed * 1.45;
    body.velocityY = Math.min(body.velocityY, -180);
    this.addEffect("stomp", target.x + target.width / 2, target.y + 18, target.x + target.width / 2 + direction * 28, target.y + 12, "#7cff6b", "Zombie Bite");
    this.queueSound("zombie-bite");
  }

  private getOrCreateChainsaw(ownerId: string): ChainsawState {
    const existing = this.chainsaws.get(ownerId);
    if (existing) {
      return existing;
    }
    const state: ChainsawState = {
      mode: "idle",
      activeTimer: 0,
      cooldownTimer: 0,
      tickTimer: 0,
      damageTotal: 0,
      aim: { x: 1, y: 0 },
    };
    this.chainsaws.set(ownerId, state);
    return state;
  }

  private chainsawDps(ownerId: string): number {
    const total = this.chainsaws.get(ownerId)?.damageTotal ?? 0;
    return clamp(chainsawBaseDps + Math.floor(total / chainsawDamagePerDps), chainsawBaseDps, chainsawMaxDps);
  }

  private getOrCreateSpikeMode(ownerId: string): SpikeModeState {
    const existing = this.spikeModes.get(ownerId);
    if (existing) {
      return existing;
    }
    const state: SpikeModeState = {
      activeTimer: 0,
      cooldownTimer: this.inventory.cooldowns.spikes ?? 0,
      particleTimer: 0,
    };
    this.spikeModes.set(ownerId, state);
    return state;
  }

  private endSpikeMode(ownerId: string, startCooldown: boolean): void {
    const state = this.getOrCreateSpikeMode(ownerId);
    state.activeTimer = 0;
    state.particleTimer = 0;
    if (startCooldown) {
      state.cooldownTimer = spikeModeCooldown;
      this.inventory.cooldowns.spikes = spikeModeCooldown;
    }
    const owner = this.combatants.get(ownerId);
    if (owner) {
      owner.statuses = owner.statuses.filter((status) => status.id !== "spikeMode");
    }
    for (const spike of this.spikes.filter((item) => item.ownerId === ownerId && !item.disintegrating)) {
      this.disintegrateSpike(spike);
    }
  }

  private trimOwnerSpikes(ownerId: string): void {
    const active = this.spikes.filter((spike) => spike.ownerId === ownerId && !spike.disintegrating);
    while (active.length > spikeMaxActive) {
      const oldest = active.shift();
      if (oldest) {
        this.disintegrateSpike(oldest);
      }
    }
  }

  private applySpikeContacts(spike: SpikeState): void {
    if (spike.visualOnly || spike.disintegrating) {
      return;
    }
    for (const target of this.combatants.values()) {
      if (target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      const contact = targetSpikeContact(target, spike);
      if (!contact) {
        continue;
      }
      this.applySpikeBodyPoison(spike, target, contact.point);
      if (contact.kind === "tip" && !this.spikeImpales.has(target.id)) {
        this.impaleTargetWithSpike(spike, target, true);
      }
    }
    for (const van of this.damageableVans()) {
      const contact = targetSpikeContact(van, spike);
      if (!contact) {
        continue;
      }
      const key = `${spike.id}:${van.id}:van-${contact.kind}`;
      if (this.bodyContactCooldowns.has(key)) {
        continue;
      }
      const tip = contact.kind === "tip";
      this.damageVan(van.id, tip ? 28 : 14, spike.ownerId, performanceNow(), {
        x: spike.dirX * (tip ? 720 : 360),
        y: spike.dirY * (tip ? 420 : 220) - (tip ? 520 : 260),
      });
      this.bodyContactCooldowns.set(key, tip ? 0.72 : 0.48);
      this.addEffect(tip ? "stun" : "spark", contact.point.x, contact.point.y, contact.point.x + spike.dirX * 24, contact.point.y + spike.dirY * 24, colorForWeapon("spikes"), tip ? "VAN SPIKED" : "VAN POISON");
      if (tip) {
        this.queueSound("spike-impale");
      }
    }
  }

  private applySpikeBodyPoison(spike: SpikeState, target: Combatant, point: Vec2): void {
    target.statuses = upsertStatusEffect(target.statuses, createStatus("spikePoison"));
    const key = `${spike.id}:${target.id}:spike-body`;
    if (this.bodyContactCooldowns.has(key)) {
      return;
    }
    this.bodyContactCooldowns.set(key, spikeBodyPoisonCooldown);
    this.addEffect("spark", point.x, point.y, point.x + spike.dirX * 16, point.y + spike.dirY * 16, "#7cff6b", "POISON");
  }

  private impaleTargetWithSpike(spike: SpikeState, target: Combatant, applyDamage: boolean): void {
    this.releaseSpikeImpale(target.id);
    if (!spike.impaledTargetIds.includes(target.id)) {
      spike.impaledTargetIds.push(target.id);
    }
    const pin = spikeCurrentTip(spike);
    const lockX = pin.x - target.width / 2 - spike.dirX * 8;
    const lockY = pin.y - target.height / 2 - spike.dirY * 10;
    this.spikeImpales.set(target.id, { spikeId: spike.id, x: lockX, y: lockY });
    target.x = lockX;
    target.y = lockY;
    target.velocityX = 0;
    target.velocityY = 0;
    target.hitstun = Math.max(target.hitstun, 0.2);
    target.statuses = upsertStatusEffect(target.statuses, createStatus("spikePoison"));
    this.addEffect("stun", target.x + target.width / 2, target.y + target.height * 0.45, spike.tipX, spike.tipY, colorForWeapon("spikes"), "IMPALED");
    this.queueSound("spike-impale");
    if (!applyDamage) {
      return;
    }
    const previousInvulnerable = target.invulnerable;
    target.invulnerable = 0;
    const hit = this.applyDamage({
      sourceId: spike.ownerId,
      targetId: target.id,
      weaponId: "spikes",
      damage: spikeImpaleDamage,
      knockback: { x: 0, y: 0 },
      stun: spikeImpaleStun,
      label: "Spike Impale",
      status: "spikePoison",
      skipHitLocationScaling: true,
      emitEvent: false,
    });
    if (!hit.applied) {
      target.invulnerable = previousInvulnerable;
      this.releaseSpikeImpale(target.id);
      return;
    }
    this.recentEvents.push(this.createEvent(
      spike.ownerId,
      "spikes",
      "hit",
      { x: spike.tipX, y: spike.tipY },
      { x: spike.dirX, y: spike.dirY },
      "Spike Impale",
      performanceNow(),
      {
        targetId: target.id,
        damage: spikeImpaleDamage,
        kx: 0,
        ky: 0,
        stun: spikeImpaleStun,
        status: "spikePoison",
        range: spike.length,
      },
    ));
  }

  private releaseSpikeImpale(targetId: string): void {
    const existing = this.spikeImpales.get(targetId);
    if (!existing) {
      return;
    }
    const spike = this.spikes.find((item) => item.id === existing.spikeId);
    if (spike) {
      spike.impaledTargetIds = spike.impaledTargetIds.filter((id) => id !== targetId);
    }
    this.spikeImpales.delete(targetId);
  }

  private releaseSpikeTargets(spike: SpikeState): void {
    for (const targetId of [...spike.impaledTargetIds]) {
      this.releaseSpikeImpale(targetId);
    }
  }

  private disintegrateSpike(spike: SpikeState): void {
    if (spike.disintegrating) {
      return;
    }
    spike.disintegrating = true;
    spike.disintegrateAge = 0;
    this.releaseSpikeTargets(spike);
    this.spawnSpikeDisintegrateParticles(spike);
    const mid = {
      x: (spike.baseX + spike.tipX) / 2,
      y: (spike.baseY + spike.tipY) / 2,
    };
    this.addEffect("spark", mid.x, mid.y, spike.tipX, spike.tipY, colorForWeapon("spikes"), "CRUMBLE");
    this.queueSound("spike-crumble");
  }

  private spawnSpikeGrowParticles(spike: SpikeState): void {
    this.addEffect("shockwave", spike.baseX, spike.baseY, spike.tipX, spike.tipY, colorForWeapon("spikes"), "SPIKE");
    for (let index = 0; index < 9; index += 1) {
      const spread = (index - 4) * 18;
      const perp = { x: -spike.dirY, y: spike.dirX };
      this.spikeParticles.push({
        id: this.makeId("spike-particle"),
        x: spike.baseX + perp.x * spread * 0.2,
        y: spike.baseY + perp.y * spread * 0.2,
        vx: perp.x * spread + spike.dirX * 70,
        vy: perp.y * spread + spike.dirY * 130 - 140 - Math.abs(spread) * 0.8,
        size: 3 + (index % 3),
        age: 0,
        lifetime: 0.55 + index * 0.015,
        color: index % 2 === 0 ? "#f2f2f2" : "#1a1a23",
        angle: Math.atan2(spike.dirY, spike.dirX),
      });
    }
  }

  private spawnSpikeDisintegrateParticles(spike: SpikeState): void {
    for (let index = 0; index < 16; index += 1) {
      const t = (index % 8) / 7;
      const point = {
        x: spike.baseX + (spike.tipX - spike.baseX) * t,
        y: spike.baseY + (spike.tipY - spike.baseY) * t,
      };
      const angle = Math.atan2(spike.dirY, spike.dirX) - Math.PI / 2 + (index / 15) * Math.PI;
      const speed = 90 + (index % 5) * 34;
      this.spikeParticles.push({
        id: this.makeId("spike-shard"),
        x: point.x + Math.sin(index * 1.7) * spike.width * 0.35,
        y: point.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        size: 2 + (index % 4),
        age: 0,
        lifetime: 0.55 + (index % 5) * 0.06,
        color: index % 3 === 0 ? "#0f0f16" : index % 2 === 0 ? "#7cff6b" : "#e8e8e8",
        angle: Math.atan2(spike.dirY, spike.dirX),
      });
    }
  }

  private spawnSpikeModeParticles(owner: Combatant, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      this.spikeParticles.push({
        id: this.makeId("spike-mode"),
        x: owner.x + owner.width / 2 + side * (16 + (index % 3) * 5),
        y: owner.y + owner.height * (0.32 + (index % 4) * 0.12),
        vx: side * (42 + index * 5),
        vy: -80 - (index % 5) * 18,
        size: 2 + (index % 3),
        age: 0,
        lifetime: 0.42 + (index % 4) * 0.05,
        color: index % 2 === 0 ? "#f2f2f2" : "#1a1a23",
      });
    }
  }

  private getOrCreateVan(ownerId: string): VanState {
    const existing = this.getVanForOwner(ownerId);
    if (existing) {
      return existing;
    }
    const van: VanState = {
      id: this.makeId("van"),
      ownerId,
      x: 0,
      y: COMBAT_TUNING.projectiles.floorY - vanHeight,
      velocityX: 0,
      velocityY: 0,
      width: vanWidth,
      height: vanHeight,
      facing: 1,
      state: "stored",
      health: vanMaxHealth,
      maxHealth: vanMaxHealth,
      gas: vanMaxGas,
      maxGas: vanMaxGas,
      speedLevel: 0,
      honkCooldown: 0,
      age: 0,
      wheelSpin: 0,
      damageFlash: 0,
      smokeTimer: 0,
      destroyedTimer: 0,
    };
    this.vans.push(van);
    return van;
  }

  private damageableVans(): VanState[] {
    return this.vans.filter((van) =>
      !van.visualOnly
      && van.health > 0
      && (van.state === "active" || van.state === "emerging" || van.state === "absorbing")
    );
  }

  getVanForOwner(ownerId: string): VanState | undefined {
    return this.vans.find((van) => van.ownerId === ownerId);
  }

  getVanDrivenBy(driverId: string): VanState | undefined {
    return this.vans.find((van) => van.occupantId === driverId && van.state !== "stored" && van.state !== "destroyed");
  }

  getNetworkVanState(ownerId: string): VanState | undefined {
    return this.getVanForOwner(ownerId);
  }

  syncRemoteVan(remote: {
    id: string;
    ownerId: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    facing: -1 | 1;
    state: VanStateKind;
    health: number;
    maxHealth: number;
    gas: number;
    maxGas: number;
    speedLevel: number;
    occupantId?: string;
    honkCooldown: number;
  } | undefined): void {
    if (!remote) {
      return;
    }
    const existing = this.getVanForOwner(remote.ownerId);
    const van = existing ?? this.getOrCreateVan(remote.ownerId);
    van.id = remote.id;
    van.x = remote.x;
    van.y = remote.y;
    van.velocityX = remote.velocityX;
    van.velocityY = remote.velocityY;
    van.facing = remote.facing;
    van.state = remote.state;
    van.health = remote.health;
    van.maxHealth = remote.maxHealth;
    van.gas = remote.gas;
    van.maxGas = remote.maxGas;
    van.speedLevel = remote.speedLevel;
    van.occupantId = remote.occupantId;
    van.honkCooldown = remote.honkCooldown;
    van.visualOnly = true;
  }

  private updateVans(dt: number, players: PlayerPhysicsState[]): void {
    for (const van of this.vans) {
      van.age += dt;
      van.honkCooldown = Math.max(0, van.honkCooldown - dt);
      van.damageFlash = Math.max(0, van.damageFlash - dt);
      van.smokeTimer = Math.max(0, van.smokeTimer - dt);
      if (van.state === "stored") {
        van.gas = Math.min(van.maxGas, van.gas + vanGasRefillPerSecond * dt);
        continue;
      }
      if (van.state === "destroyed") {
        van.destroyedTimer += dt;
        van.gas = Math.min(van.maxGas, van.gas + vanGasRefillPerSecond * 0.35 * dt);
        van.health = Math.min(vanDestroyedRepairThreshold, van.health + vanStoredRepairPerSecond * 0.65 * dt);
        if (van.health >= vanDestroyedRepairThreshold && van.destroyedTimer > 8) {
          van.state = "stored";
          van.destroyedTimer = 0;
        }
        continue;
      }
      if (van.state === "absorbing") {
        this.updateAbsorbingVan(van, dt);
        continue;
      }
      if (van.state === "emerging" && van.age > 0.42) {
        van.state = "active";
      }
      this.updateActiveVan(van, dt, players);
    }
  }

  private updateAbsorbingVan(van: VanState, dt: number): void {
    const owner = this.combatants.get(van.ownerId);
    if (!owner) {
      van.state = "stored";
      van.occupantId = undefined;
      return;
    }
    van.occupantId = undefined;
    const target = { x: owner.x + owner.width / 2, y: owner.y + owner.height * 0.55 };
    const center = { x: van.x + van.width / 2, y: van.y + van.height / 2 };
    const toOwner = { x: target.x - center.x, y: target.y - center.y };
    const distance = Math.hypot(toOwner.x, toOwner.y);
    const travel = 760 * dt;
    if (distance < 42 || travel >= distance || van.age > 2.2) {
      van.state = "stored";
      van.x = target.x - van.width / 2;
      van.y = target.y - van.height / 2;
      van.velocityX = 0;
      van.velocityY = 0;
      return;
    }
    const direction = normalize(toOwner);
    van.velocityX = direction.x * 760;
    van.velocityY = direction.y * 760;
    van.x += van.velocityX * dt;
    van.y += van.velocityY * dt;
    this.addEffect("tracer", center.x, center.y, target.x, target.y, colorForWeapon("van"), "ABSORB");
  }

  private updateActiveVan(van: VanState, dt: number, players: PlayerPhysicsState[]): void {
    const occupant = van.occupantId ? this.combatants.get(van.occupantId) : undefined;
    const driverPlayer = van.occupantId ? players.find((player) => player.id === van.occupantId) : undefined;
    if (occupant && occupant.respawnTimer > 0) {
      van.occupantId = undefined;
    }
    if (van.occupantId && van.gas > 0) {
      const maxSpeed = vanMaxSpeedBase + van.speedLevel * vanMaxSpeedStep;
      van.velocityX = clamp(van.velocityX, -maxSpeed, maxSpeed);
      if (Math.abs(van.velocityX) > 30 || van.speedLevel > 0) {
        van.gas = Math.max(0, van.gas - (vanGasDrainBase + van.speedLevel * vanGasDrainStep) * dt);
      }
    } else if (van.gas <= 0) {
      van.velocityX *= Math.max(0, 1 - dt * 2.2);
    }
    this.applyVanRamContacts(van);
    van.velocityY += DEFAULT_PHYSICS.gravity * dt;
    van.velocityX *= Math.max(0, 1 - dt * vanFriction * (van.occupantId ? 0.45 : 1));
    van.velocityY *= Math.max(0, 1 - dt * vanAirDrag);
    van.x += van.velocityX * dt;
    van.y += van.velocityY * dt;
    const floorY = COMBAT_TUNING.projectiles.floorY - van.height;
    if (van.y > floorY) {
      if (van.state === "active" && van.age > 0.8 && van.velocityY > 520) {
        this.addEffect("shockwave", van.x + van.width / 2, floorY + van.height, van.x + van.width / 2, floorY + van.height - 32, "#b8bfd7", "CRASH");
        this.damageVan(van.id, Math.min(70, Math.round((van.velocityY - 480) / 16)), van.ownerId, performanceNow(), { x: 0, y: -Math.min(460, van.velocityY * 0.44) });
      }
      van.y = floorY;
      van.velocityY = Math.min(0, -van.velocityY * 0.16);
    }
    if (van.x < DEFAULT_PHYSICS.platformLeft) {
      this.crashVanWall(van, 1);
    } else if (van.x + van.width > DEFAULT_PHYSICS.platformRight) {
      this.crashVanWall(van, -1);
    }
    van.wheelSpin += van.velocityX * dt * 0.08;
    if (driverPlayer && van.occupantId) {
      this.placeDriverInVan(van, driverPlayer);
    }
    if (occupant && van.occupantId) {
      this.placeCombatantDriverInVan(van, occupant);
    }
    if (van.health < van.maxHealth * 0.35 && van.smokeTimer === 0) {
      van.smokeTimer = 0.2;
      this.addEffect("aura", van.x + van.width * 0.45, van.y + 10, van.x + van.width * 0.55, van.y - 20, "#2b2b32", "SMOKE");
    }
    this.applyVanRamContacts(van);
  }

  private crashVanWall(van: VanState, direction: -1 | 1): void {
    const speed = Math.abs(van.velocityX);
    van.x = direction > 0 ? DEFAULT_PHYSICS.platformLeft : DEFAULT_PHYSICS.platformRight - van.width;
    van.velocityX = direction * Math.min(520, Math.max(140, speed * 0.42));
    if (speed > 360) {
      this.damageVan(van.id, Math.round((speed - 320) / 18), van.ownerId);
      this.addEffect("spark", direction > 0 ? van.x : van.x + van.width, van.y + van.height * 0.5, van.x + van.width / 2, van.y + 12, colorForWeapon("van"), "CRASH");
      this.queueSound("van-crash");
    }
  }

  private applyVanRamContacts(van: VanState): void {
    if (van.state !== "active" && van.state !== "emerging") {
      return;
    }
    const speed = Math.abs(van.velocityX);
    if (speed < 75) {
      return;
    }
    const front = van.facing > 0 ? van.x + van.width - 8 : van.x - 20;
    const ramRect = {
      x: van.facing > 0 ? front : front,
      y: van.y + 6,
      width: 28,
      height: van.height - 12,
    };
    for (const target of this.combatants.values()) {
      if (target.id === van.occupantId || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      if (!intersectsRect(ramRect, target)) {
        continue;
      }
      const key = `${van.id}:${target.id}:van-ram`;
      if (this.bodyContactCooldowns.has(key)) {
        continue;
      }
      const damage = clamp(Math.round((speed - 70) / 9 + van.speedLevel * 5), 4, 78);
      const knockback = clamp(speed * 1.25 + van.speedLevel * 80, 190, 1320);
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: van.ownerId,
        targetId: target.id,
        weaponId: "van",
        damage,
        knockback: { x: van.facing * knockback, y: -220 - van.speedLevel * 28 },
        stun: clamp(0.16 + speed / 1450, 0.18, 0.7),
        label: speed > 620 ? "VAN RAM" : "Van Bump",
        status: speed > 360 ? "daze" : undefined,
        skipHitLocationScaling: true,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
        continue;
      }
      target.x = van.facing > 0 ? van.x + van.width + 3 : van.x - target.width - 3;
      van.velocityX *= speed > 620 ? -0.24 : -0.12;
      van.velocityY = Math.min(van.velocityY, -65);
      this.bodyContactCooldowns.set(key, vanRamCooldown);
      this.addEffect("slam", target.x + target.width / 2, target.y + target.height / 2, target.x + target.width / 2 + van.facing * 46, target.y + target.height / 2 - 12, colorForWeapon("van"), "RAM");
      this.queueSound(speed > 620 ? "van-crash" : "van-bump");
    }
  }

  private honkVan(van: VanState, driverId: string, now: number): WeaponUseResult {
    if (van.honkCooldown > 0) {
      return { kind: "blocked", weaponId: "van", label: "Honk cooldown" };
    }
    van.honkCooldown = vanHonkCooldownSeconds;
    const horn = {
      x: van.facing > 0 ? van.x + van.width - 4 : van.x - vanHonkRange + 4,
      y: van.y - 12,
      width: vanHonkRange,
      height: van.height + 24,
    };
    for (const target of this.combatants.values()) {
      if (target.id === van.occupantId || target.respawnTimer > 0 || target.hp <= 0 || !intersectsRect(horn, target)) {
        continue;
      }
      const previousInvulnerable = target.invulnerable;
      target.invulnerable = 0;
      const hit = this.applyDamage({
        sourceId: driverId,
        targetId: target.id,
        weaponId: "van",
        damage: 1,
        knockback: { x: van.facing * 130, y: -48 },
        stun: 0.62,
        label: "HONK",
        status: "daze",
        skipHitLocationScaling: true,
      });
      if (!hit.applied) {
        target.invulnerable = previousInvulnerable;
      }
    }
    const hornX = van.facing > 0 ? van.x + van.width : van.x;
    this.addEffect("shockwave", hornX, van.y + van.height * 0.4, hornX + van.facing * vanHonkRange, van.y + van.height * 0.4, colorForWeapon("van"), "HONK");
    this.queueSound("van-honk");
    this.recentEvents.push(this.createEvent(driverId, "van", "hit", { x: hornX, y: van.y + van.height * 0.4 }, { x: van.facing, y: 0 }, "HONK", now, { damage: 0, stun: 0.62, status: "daze" }));
    return { kind: "utility", weaponId: "van", label: "HONK" };
  }

  private exitVan(van: VanState, player: PlayerPhysicsState, now: number): void {
    van.occupantId = undefined;
    player.x = van.facing > 0 ? van.x - player.width - 8 : van.x + van.width + 8;
    player.y = Math.min(van.y + van.height - player.height, DEFAULT_PHYSICS.groundY - player.height);
    player.velocityX = van.velocityX * 0.35 - van.facing * 120;
    player.velocityY = -120;
    const combatant = this.combatants.get(player.id);
    if (combatant) {
      combatant.x = player.x;
      combatant.y = player.y;
      combatant.velocityX = player.velocityX;
      combatant.velocityY = player.velocityY;
    }
    this.addEffect("pickup", player.x + player.width / 2, player.y + player.height / 2, player.x + player.width / 2, player.y, colorForWeapon("van"), "EXIT");
    this.queueSound("van-enter");
    this.recentEvents.push(this.createEvent(player.id, "van", "equip", { x: player.x + player.width / 2, y: player.y + player.height / 2 }, { x: -van.facing, y: 0 }, "Exit Van", now));
  }

  private placeDriverInVan(van: VanState, player: PlayerPhysicsState): void {
    player.x = van.x + van.width * 0.5 - player.width / 2;
    player.y = van.y + van.height - player.height - 8;
    player.velocityX = van.velocityX;
    player.velocityY = van.velocityY;
    player.grounded = false;
  }

  private placeCombatantDriverInVan(van: VanState, combatant: Combatant): void {
    combatant.x = van.x + van.width * 0.5 - combatant.width / 2;
    combatant.y = van.y + van.height - combatant.height - 8;
    combatant.velocityX = van.velocityX;
    combatant.velocityY = van.velocityY;
    combatant.hitstun = 0;
  }

  private explodeVan(van: VanState, sourceId: string, now: number): void {
    const center = { x: van.x + van.width / 2, y: van.y + van.height / 2 };
    van.state = "destroyed";
    van.destroyedTimer = 0;
    van.occupantId = undefined;
    van.velocityX = 0;
    van.velocityY = 0;
    van.gas = 0;
    this.applyExplosionDamage({
      sourceId,
      weaponId: "van",
      x: center.x,
      y: center.y,
      radius: vanExplosionRadius,
      centerDamage: vanExplosionCenterDamage,
      edgeDamage: vanExplosionEdgeDamage,
      centerKnockback: vanExplosionCenterKnockback,
      edgeKnockback: vanExplosionEdgeKnockback,
      centerStun: vanExplosionCenterStun,
      edgeStun: vanExplosionEdgeStun,
      label: "Van Explosion",
    });
    this.addEffect("explosion", center.x, center.y, center.x + vanExplosionRadius, center.y, colorForWeapon("van"), "VAN EXPLOSION");
    this.addEffect("aura", center.x, center.y, center.x + vanExplosionRadius * 0.7, center.y, "#2b2b32", "VAN SMOKE");
    this.queueSound("van-explode");
    this.recentEvents.push(this.createEvent(van.ownerId, "van", "hit", center, { x: van.facing, y: -0.4 }, "Van Explosion", now, { damage: vanExplosionCenterDamage, stun: vanExplosionCenterStun }));
  }

  private recordChainsawDamage(ownerId: string, victimId: string, damage: number): void {
    const key = `${ownerId}:${victimId}`;
    this.chainsawVictimDamage.set(key, (this.chainsawVictimDamage.get(key) ?? 0) + damage);
  }

  private getChainsawContribution(ownerId: string, victimId: string): number {
    return this.chainsawVictimDamage.get(`${ownerId}:${victimId}`) ?? 0;
  }

  private clearChainsawVictimRecords(victimId: string): void {
    for (const key of [...this.chainsawVictimDamage.keys()]) {
      if (key.endsWith(`:${victimId}`)) {
        this.chainsawVictimDamage.delete(key);
      }
    }
  }

  private spawnZombieFromChainsaw(ownerId: string, victim: Combatant, contribution: number, deathSpot: Vec2): void {
    const key = `${ownerId}:${victim.id}`;
    this.chainsawVictimDamage.delete(key);
    const health = clamp(Math.round(contribution), 5, 150);
    const strength = clamp((health - 5) / 145, 0, 1);
    const biteDamage = contribution >= 95 ? 30 : contribution >= 40 ? 15 : 6;
    const speed = lerp(260, 620, strength);
    const id = this.makeId("zombie");
    const spawnY = Math.min(deathSpot.y, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height);
    const zombieBody: Combatant = {
      id,
      name: "Chainsaw Zombie",
      x: deathSpot.x,
      y: spawnY + DEFAULT_PHYSICS.height * 0.72,
      width: DEFAULT_PHYSICS.width,
      height: DEFAULT_PHYSICS.height,
      spawnX: deathSpot.x,
      spawnY,
      hp: health,
      maxHp: health,
      velocityX: 0,
      velocityY: 0,
      hitstun: 0,
      invulnerable: zombieRiseDuration,
      respawnTimer: 0,
      color: "#164f24",
      statuses: [],
    };
    this.combatants.set(id, zombieBody);
    this.zombies.set(id, {
      id,
      ownerId,
      strength,
      biteDamage,
      speed,
      age: 0,
      riseTimer: zombieRiseDuration,
      riseDuration: zombieRiseDuration,
      biteTimer: 0,
      biteAnim: 0,
      wanderTimer: 0,
      wanderDirection: victim.velocityX < 0 ? -1 : 1,
    });
    this.addEffect("aura", deathSpot.x + victim.width / 2, deathSpot.y + victim.height / 2, deathSpot.x + victim.width / 2, deathSpot.y - 74, "#164f24", "ZOMBIE");
    this.addEffect("spark", deathSpot.x + victim.width / 2, deathSpot.y + victim.height - 4, deathSpot.x + victim.width / 2 + 28, deathSpot.y + victim.height - 18, "#7cff6b", "RISE");
    this.addEffect("shockwave", deathSpot.x + victim.width / 2, spawnY + victim.height - 2, deathSpot.x + victim.width / 2, spawnY + victim.height - 44, "#5a3a22", "DUST");
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI + (index / 9) * Math.PI;
      this.spikeParticles.push({
        id: this.makeId("dirt"),
        x: deathSpot.x + victim.width / 2,
        y: spawnY + victim.height - 4,
        vx: Math.cos(angle) * (80 + index * 7),
        vy: Math.sin(angle) * 130 - 120,
        size: 3 + (index % 3),
        age: 0,
        lifetime: 0.5 + index * 0.02,
        color: index % 2 === 0 ? "#5a3a22" : "#2f2118",
      });
    }
    this.queueSound("zombie-spawn");
  }

  private findZombieTarget(zombie: ZombieState, body: Combatant): Combatant | undefined {
    let fallback: { target: Combatant; distance: number } | undefined;
    let preferred: { target: Combatant; distance: number } | undefined;
    const bx = body.x + body.width / 2;
    const by = body.y + body.height / 2;
    for (const target of this.combatants.values()) {
      if (target.id === zombie.id || target.id.startsWith("zombie-") || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      const distance = Math.hypot(target.x + target.width / 2 - bx, target.y + target.height / 2 - by);
      if (distance > zombieDetectRange) {
        continue;
      }
      const candidate = { target, distance };
      if (target.id === zombie.ownerId) {
        if (!fallback || distance < fallback.distance) {
          fallback = candidate;
        }
      } else if (!preferred || distance < preferred.distance) {
        preferred = candidate;
      }
    }
    return preferred?.target ?? fallback?.target;
  }

  private ownerRopeAnchor(ownerId: string, players: PlayerPhysicsState[]): Vec2 | undefined {
    const player = players.find((item) => item.id === ownerId);
    if (player) {
      return { x: player.x + player.width / 2, y: player.y + player.height * 0.42 };
    }
    const combatant = this.combatants.get(ownerId);
    return combatant ? { x: combatant.x + combatant.width / 2, y: combatant.y + combatant.height * 0.42 } : undefined;
  }

  private findGrappleTarget(grapple: GrappleState, previousX: number, previousY: number): Combatant | undefined {
    const swept = sweptCircleBounds(previousX, previousY, grapple.x, grapple.y, grappleHookRadius);
    for (const target of this.combatants.values()) {
      if (target.id === grapple.ownerId || target.respawnTimer > 0 || target.hp <= 0) {
        continue;
      }
      if (intersectsRect(swept, target)) {
        return target;
      }
    }
    return undefined;
  }

  private attachGrappleToTarget(grapple: GrappleState, target: Combatant): void {
    const ownerAnchor = this.ownerRopeAnchor(grapple.ownerId, []);
    grapple.state = "attached";
    grapple.targetId = target.id;
    grapple.anchorX = target.x + target.width / 2;
    grapple.anchorY = target.y + target.height * 0.34;
    grapple.x = grapple.anchorX;
    grapple.y = grapple.anchorY;
    const distance = ownerAnchor ? Math.hypot(grapple.anchorX - ownerAnchor.x, grapple.anchorY - ownerAnchor.y) : 260;
    grapple.ropeLength = clamp(distance, 110, grappleHookMaxRopeLength);
    const direction = ownerAnchor ? normalize({ x: grapple.anchorX - ownerAnchor.x, y: grapple.anchorY - ownerAnchor.y }) : { x: 1, y: -0.2 };
    const previousInvulnerable = target.invulnerable;
    target.invulnerable = 0;
    const hit = this.applyDamage({
      sourceId: grapple.ownerId,
      targetId: target.id,
      weaponId: "grappling-hook",
      damage: grappleHookAttachDamage,
      knockback: { x: direction.x * 120, y: direction.y * 90 - 35 },
      stun: grappleHookAttachStun,
      label: "Grapple Hook",
      skipHitLocationScaling: true,
    });
    if (!hit.applied) {
      target.invulnerable = previousInvulnerable;
    }
    target.velocityX += direction.x * 42;
    target.velocityY += direction.y * 28;
    this.addEffect("spark", grapple.anchorX, grapple.anchorY, grapple.anchorX, grapple.anchorY - 30, colorForWeapon("grappling-hook"), "Hooked");
    this.queueSound("grapple-attach");
  }

  private attachGrappleToPoint(grapple: GrappleState, x: number, y: number): void {
    const ownerAnchor = this.ownerRopeAnchor(grapple.ownerId, []);
    grapple.state = "attached";
    grapple.targetId = undefined;
    grapple.anchorX = x;
    grapple.anchorY = y;
    grapple.x = x;
    grapple.y = y;
    const distance = ownerAnchor ? Math.hypot(x - ownerAnchor.x, y - ownerAnchor.y) : 260;
    grapple.ropeLength = clamp(distance, 110, grappleHookMaxRopeLength);
    this.addEffect("spark", x, y, x, y - 28, colorForWeapon("grappling-hook"), "Attached");
    this.queueSound("grapple-attach");
  }

  private applyGrapplePull(grapple: GrappleState, players: PlayerPhysicsState[], dt: number): void {
    const player = players.find((item) => item.id === grapple.ownerId);
    const owner = this.combatants.get(grapple.ownerId);
    const source = player ?? owner;
    if (!source) {
      return;
    }
    const ox = source.x + source.width / 2;
    const oy = source.y + source.height * 0.42;
    const dx = grapple.anchorX - ox;
    const dy = grapple.anchorY - oy;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1) {
      return;
    }
    const activePull = grapple.pulling ? 1 : 0;
    const slack = activePull > 0 ? 0 : 90;
    const tension = Math.max(0, distance - grapple.ropeLength - slack) / Math.max(distance, 1);
    if (tension <= 0 && activePull <= 0) {
      return;
    }
    const direction = { x: dx / distance, y: dy / distance };
    if (activePull > 0 && this.spikeImpales.has(grapple.ownerId) && distance > 78) {
      this.releaseSpikeImpale(grapple.ownerId);
      this.addEffect("spark", ox, oy, ox + direction.x * 40, oy + direction.y * 40, colorForWeapon("grappling-hook"), "PULLED FREE");
    }
    const force = grappleHookPullForce * (activePull > 0 ? 1.05 : 0.35 + tension);
    const drivenVan = this.getVanDrivenBy(grapple.ownerId);
    if (drivenVan && drivenVan.state === "active") {
      drivenVan.velocityX += direction.x * force * dt * 0.72;
      drivenVan.velocityY += direction.y * force * dt * 0.54 - 18 * Math.max(tension, activePull * 0.35);
      const vanSpeed = Math.hypot(drivenVan.velocityX, drivenVan.velocityY);
      const vanMaxPullSpeed = grappleHookMaxPullSpeed * 0.9;
      if (vanSpeed > vanMaxPullSpeed) {
        const scale = vanMaxPullSpeed / vanSpeed;
        drivenVan.velocityX *= scale;
        drivenVan.velocityY *= scale;
      }
      if (player) {
        player.velocityX = drivenVan.velocityX;
        player.velocityY = drivenVan.velocityY;
        player.grounded = false;
      }
      if (owner) {
        owner.velocityX = drivenVan.velocityX;
        owner.velocityY = drivenVan.velocityY;
      }
      this.addEffect("tracer", ox, oy, ox - direction.x * 56, oy - direction.y * 32, colorForWeapon("grappling-hook"), "VAN WINCH");
      return;
    }
    source.velocityX += direction.x * force * dt;
    source.velocityY += direction.y * force * dt - 22 * Math.max(tension, activePull * 0.35);
    const speed = Math.hypot(source.velocityX, source.velocityY);
    if (speed > grappleHookMaxPullSpeed) {
      const scale = grappleHookMaxPullSpeed / speed;
      source.velocityX *= scale;
      source.velocityY *= scale;
    }
    if (player) {
      player.grounded = false;
    }
    if (owner) {
      owner.velocityX = source.velocityX;
      owner.velocityY = source.velocityY;
    }
    this.addEffect("tracer", ox, oy, ox - direction.x * 46, oy - direction.y * 26, colorForWeapon("grappling-hook"), "Tension");
  }

  private syncGrappleRope(grapple: GrappleState, ownerAnchor: Vec2, anchor: Vec2, dt: number): void {
    if (grapple.points.length < 2) {
      grapple.points = createRopePoints(ownerAnchor, anchor, grappleHookRopePoints);
    }
    const points = grapple.points;
    points[0].x = ownerAnchor.x;
    points[0].y = ownerAnchor.y;
    points[points.length - 1].x = anchor.x;
    points[points.length - 1].y = anchor.y;

    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      const vx = (point.x - point.px) * 0.94;
      const vy = (point.y - point.py) * 0.94;
      point.px = point.x;
      point.py = point.y;
      point.x += vx;
      point.y += vy + 780 * dt * dt;
    }

    const direct = Math.hypot(anchor.x - ownerAnchor.x, anchor.y - ownerAnchor.y);
    const segmentLength = Math.max(12, Math.max(direct, grapple.ropeLength) / Math.max(1, points.length - 1));
    for (let iteration = 0; iteration < 4; iteration += 1) {
      points[0].x = ownerAnchor.x;
      points[0].y = ownerAnchor.y;
      points[points.length - 1].x = anchor.x;
      points[points.length - 1].y = anchor.y;
      for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index];
        const b = points[index + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const difference = (distance - segmentLength) / distance;
        const offsetX = dx * difference * 0.5;
        const offsetY = dy * difference * 0.5;
        if (index > 0) {
          a.x += offsetX;
          a.y += offsetY;
        }
        if (index + 1 < points.length - 1) {
          b.x -= offsetX;
          b.y -= offsetY;
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
      const risingZombie = this.zombies.get(combatant.id);
      if (risingZombie && risingZombie.riseTimer > 0) {
        combatant.velocityX = 0;
        combatant.velocityY = 0;
        combatant.hitstun = Math.max(combatant.hitstun, 0.08);
        combatant.invulnerable = Math.max(combatant.invulnerable, risingZombie.riseTimer);
        continue;
      }
      const impale = this.spikeImpales.get(combatant.id);
      if (impale) {
        combatant.x = impale.x;
        combatant.y = impale.y;
        combatant.velocityX = 0;
        combatant.velocityY = 0;
        combatant.hitstun = Math.max(0, combatant.hitstun - dt);
        combatant.invulnerable = Math.max(0, combatant.invulnerable - dt);
        continue;
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
    this.clearChainsawVictimRecords(target.id);
    this.releaseSpikeImpale(target.id);
    if (this.spikeModes.has(target.id)) {
      this.endSpikeMode(target.id, false);
    }
    if (target.id.startsWith("zombie-")) {
      this.removeZombiePermanently(target.id, "ZOMBIE DOWN");
      return;
    }
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

  private removeZombiePermanently(id: string, label: string): void {
    const body = this.combatants.get(id);
    const cx = (body?.x ?? 0) + (body?.width ?? DEFAULT_PHYSICS.width) / 2;
    const cy = (body?.y ?? DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height) + (body?.height ?? DEFAULT_PHYSICS.height) / 2;
    this.clearChainsawVictimRecords(id);
    this.releaseSpikeImpale(id);
    this.zombies.delete(id);
    this.combatants.delete(id);
    for (const zombie of this.zombies.values()) {
      if (zombie.targetId === id) {
        zombie.targetId = undefined;
      }
    }
    this.addEffect("aura", cx, cy, cx, cy - 46, "#164f24", label);
    this.addEffect("spark", cx - 9, cy + 14, cx - 44, cy - 4, "#0f2415", "ASH");
    this.addEffect("spark", cx + 8, cy + 12, cx + 42, cy - 8, "#7cff6b", "ASH");
    this.queueSound("player-stunned");
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
        if (projectile.weaponId === "teleport-ball") {
          if (projectile.state !== "rolling") {
            projectile.state = "rolling";
            projectile.vx *= 0.82;
            projectile.vy = 0;
            projectile.gravity = 0;
            this.addEffect("spark", projectile.x, projectile.y, projectile.x + projectile.vx * 0.05, projectile.y - 18, colorForWeapon(projectile.weaponId), "Roll");
            this.queueSound("teleport-pulse");
          }
        } else if (projectile.bounces > 0) {
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
        } else {
          this.addEffect("spark", projectile.x, projectile.y, projectile.x, projectile.y - 16, colorForWeapon(projectile.weaponId), "Impact");
          projectile.age = projectile.lifetime + 1;
          continue;
        }
      }
      if (projectile.weaponId === "teleport-ball" && projectile.state === "rolling") {
        projectile.y = ground;
        projectile.vy = 0;
        projectile.gravity = 0;
        projectile.vx *= Math.exp(-dt * teleportBallRollFriction);
        if (Math.abs(projectile.vx) < teleportBallMinRollSpeed) {
          projectile.vx = 0;
        }
        projectile.pulseTimer = Math.max(0, (projectile.pulseTimer ?? 0) - dt);
        if (Math.abs(projectile.vx) > 0 && projectile.pulseTimer === 0) {
          projectile.pulseTimer = 0.18;
          this.addEffect("spark", projectile.x, projectile.y, projectile.x - Math.sign(projectile.vx) * 18, projectile.y - 12, colorForWeapon(projectile.weaponId), "Roll");
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
      if (projectile.weaponId !== "teleport-ball" && projectile.age <= projectile.lifetime) {
        const bounds = returningAxe ? sweptProjectileBounds(projectile, previousX, previousY) : projectileBounds(projectile);
        for (const van of this.vans) {
          if (van.state === "stored" || van.state === "destroyed" || projectile.hits.includes(van.id)) {
            continue;
          }
          if (!intersectsRect(bounds, van)) {
            continue;
          }
          this.damageVan(van.id, projectile.damage, projectile.ownerId);
          projectile.hits.push(van.id);
          this.addEffect("spark", projectile.x, projectile.y, projectile.x + normalize(projectile.knockback).x * 20, projectile.y - 8, colorForWeapon(projectile.weaponId), "VAN HIT");
          if (projectile.pierce <= 0) {
            projectile.age = projectile.lifetime + 1;
          } else {
            projectile.pierce -= 1;
          }
          break;
        }
      }
      if (returningAxe && projectile.age <= projectile.lifetime) {
        this.catchReturningAxe(projectile);
      }
    }
    const xLimit = 2400 + COMBAT_TUNING.projectiles.cleanupPadding;
    removeWhere(this.projectiles, (projectile) => {
      const pendingTeleport = projectile.teleportsOwner && this.pendingTeleports.get(projectile.ownerId)?.projectileId === projectile.id;
      return projectile.age > projectile.lifetime
        || (!pendingTeleport && (
          projectile.y > COMBAT_TUNING.projectiles.floorY + COMBAT_TUNING.projectiles.cleanupPadding
          || projectile.x < -xLimit
          || projectile.x > xLimit
        ));
    });
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
    for (const van of this.vans) {
      if (van.state === "stored" || van.state === "destroyed") {
        continue;
      }
      if (intersectsRect(swept, van)) {
        projectile.x = van.x + van.width / 2;
        projectile.y = van.y + van.height / 2;
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

    const guidance = this.rocketGuidance.get(projectile.ownerId);
    if (guidance) {
      const current = normalize({ x: projectile.vx, y: projectile.vy });
      const chaos = projectile.state === "chaotic" ? projectile.chaos ?? 0 : 0;
      const influence = projectile.state === "chaotic"
        ? clamp(0.22 / (1 + chaos * 0.42), 0.055, 0.22)
        : clamp(dt * 0.55, 0, 0.32);
      const guided = normalize({
        x: lerp(current.x, guidance.x, influence),
        y: lerp(current.y, guidance.y, influence),
      });
      const speed = Math.max(rocketLaunchSpeed, Math.hypot(projectile.vx, projectile.vy));
      projectile.vx = guided.x * speed;
      projectile.vy = guided.y * speed;
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
    for (const van of this.vans) {
      if (van.state === "stored" || van.state === "destroyed") {
        continue;
      }
      if (intersectsRect(swept, van)) {
        projectile.x = van.x + van.width / 2;
        projectile.y = van.y + van.height / 2;
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
      for (const van of this.damageableVans()) {
        if (hitbox.hits.includes(van.id) || van.occupantId === hitbox.ownerId || !intersectsRect(hitbox, van)) {
          continue;
        }
        const damage = Math.max(1, Math.round(hitbox.damage * (hitbox.heavy ? 1.05 : 0.85)));
        if (this.damageVan(van.id, damage, hitbox.ownerId, performanceNow(), hitbox.knockback)) {
          hitbox.hits.push(van.id);
          const hitY = clamp(hitbox.y + hitbox.height / 2, van.y, van.y + van.height);
          this.addEffect(hitbox.heavy ? "shockwave" : "spark", van.x + van.width / 2, hitY, van.x + van.width / 2 + Math.sign(hitbox.knockback.x || 1) * 30, hitY - 12, colorForWeapon(hitbox.weaponId), "VAN HIT");
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

      this.releaseSpikeImpale(pending.ownerId);
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
      const riddenVan = this.getVanDrivenBy(pending.ownerId);
      if (riddenVan) {
        riddenVan.x = landingX + (player?.width ?? owner?.width ?? DEFAULT_PHYSICS.width) / 2 - riddenVan.width / 2;
        riddenVan.y = Math.min(landingY + (player?.height ?? owner?.height ?? DEFAULT_PHYSICS.height) - riddenVan.height + 8, COMBAT_TUNING.projectiles.floorY - riddenVan.height);
        riddenVan.velocityX = projectile.vx * 0.28;
        riddenVan.velocityY = Math.min(projectile.vy * 0.18, -180);
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
      const ox = owner.x + owner.width / 2;
      const oy = owner.y + owner.height / 2;
      for (const van of this.damageableVans()) {
        if (state.tickCooldowns.has(van.id) || distanceRectToPoint(van, { x: ox, y: oy }) > radius) {
          continue;
        }
        const vx = van.x + van.width / 2;
        const vy = van.y + van.height / 2;
        const direction = normalize({ x: vx - ox || owner.velocityX || 1, y: vy - oy || -0.35 });
        const damage = Math.round(lerp(8, 26, power));
        this.damageVan(van.id, damage, ownerId, performanceNow(), {
          x: direction.x * (170 + power * 260),
          y: -170 - power * 190,
        });
        this.addEffect("stun", vx, vy, vx, vy - 36, deathAuraColor(power), "VAN FROZEN");
        this.queueSound("death-aura");
        state.tickCooldowns.set(van.id, lerp(0.68, 0.38, power));
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
            damage: superLegsEquipped ? (low ? 24 : 16) : low ? 11 : 7,
            knockback: {
              x: player.facing * (superLegsEquipped ? (low ? 900 : 680) : low ? 610 : 390),
              y: superLegsEquipped ? (low ? -920 : -680) : low ? COMBAT_TUNING.lowSlideTripPopUpForce : COMBAT_TUNING.slideTripPopUpForce,
            },
            stun: superLegsEquipped ? (low ? 0.92 : 0.68) : low ? 0.72 : 0.48,
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
      this.applyVanBodyContacts(player, owner, superLegsEquipped);
    }
  }

  private applyVanBodyContacts(player: PlayerPhysicsState, owner: Combatant, superLegsEquipped: boolean): void {
    for (const van of this.damageableVans()) {
      if (van.occupantId === player.id) {
        continue;
      }
      const ownerCenterX = owner.x + owner.width / 2;
      const vanCenterX = van.x + van.width / 2;
      const direction = Math.sign(vanCenterX - ownerCenterX || player.facing || 1);

      if ((player.sliding || player.action === "slide" || player.action === "lowSlide") && intersectsRect(owner, van)) {
        const low = player.lowSliding || player.action === "lowSlide";
        const key = `${player.id}:${van.id}:${low ? "van-low-slide" : "van-slide"}`;
        if (!this.bodyContactCooldowns.has(key)) {
          const damage = superLegsEquipped ? (low ? 24 : 16) : low ? 11 : 7;
          this.damageVan(van.id, damage, player.id, performanceNow(), {
            x: player.facing * (superLegsEquipped ? (low ? 900 : 680) : low ? 610 : 390),
            y: superLegsEquipped ? (low ? -920 : -680) : low ? COMBAT_TUNING.lowSlideTripPopUpForce : COMBAT_TUNING.slideTripPopUpForce,
          });
          this.bodyContactCooldowns.set(key, superLegsEquipped ? 0.32 : 0.42);
          this.addEffect("trip", vanCenterX, van.y + van.height * 0.58, vanCenterX + player.facing * 36, van.y + van.height * 0.58 - 18, superLegsEquipped ? colorForWeapon("super-legs") : "#ffffff", "VAN SLIDE");
        }
      }

      if ((player.airDiving || player.action === "airDive") && intersectsRect(owner, van)) {
        const key = `${player.id}:${van.id}:van-air-dive`;
        if (!this.bodyContactCooldowns.has(key)) {
          this.damageVan(van.id, 12, player.id, performanceNow(), { x: player.facing * 380, y: -130 });
          this.bodyContactCooldowns.set(key, 0.34);
          this.addEffect("spark", vanCenterX, van.y + van.height * 0.45, vanCenterX + player.facing * 28, van.y + van.height * 0.34, "#ffffff", "VAN DIVE");
        }
      }

      if (player.groundSlamming && intersectsRect(owner, van)) {
        const key = `${player.id}:${van.id}:van-ground-slam`;
        if (!this.bodyContactCooldowns.has(key)) {
          this.damageVan(van.id, superLegsEquipped ? 28 : 18, player.id, performanceNow(), {
            x: direction * (superLegsEquipped ? 440 : 260),
            y: superLegsEquipped ? -720 : -420,
          });
          this.bodyContactCooldowns.set(key, 0.36);
          this.addEffect("slam", vanCenterX, van.y + van.height * 0.45, vanCenterX + direction * 42, van.y + van.height * 0.25, superLegsEquipped ? colorForWeapon("super-legs") : "#ffffff", "VAN SLAM");
        }
      }

      if (player.justSlamLanded) {
        const slamRadius = superLegsEquipped ? 250 : COMBAT_TUNING.groundSlam.radius;
        const distance = Math.abs(vanCenterX - ownerCenterX);
        if (distance <= slamRadius && Math.abs((van.y + van.height) - DEFAULT_PHYSICS.groundY) <= 120) {
          const key = `${player.id}:${van.id}:van-slam-wave`;
          if (!this.bodyContactCooldowns.has(key)) {
            const falloff = 1 - distance / slamRadius;
            const damage = superLegsEquipped ? Math.round(lerp(18, 48, falloff)) : Math.round(lerp(10, 24, falloff));
            this.damageVan(van.id, damage, player.id, performanceNow(), {
              x: direction * (superLegsEquipped ? lerp(420, 820, falloff) : lerp(260, 520, falloff)),
              y: superLegsEquipped ? -lerp(520, 820, falloff) : -lerp(360, 620, falloff),
            });
            this.bodyContactCooldowns.set(key, 0.42);
            this.addEffect("shockwave", ownerCenterX, DEFAULT_PHYSICS.groundY, vanCenterX, van.y + van.height * 0.55, superLegsEquipped ? colorForWeapon("super-legs") : "#ffffff", "VAN WAVE");
            this.queueSound("ground-slam-impact");
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
    extra: Partial<Pick<CombatEventPacket, "targetId" | "damage" | "kx" | "ky" | "stun" | "status" | "hitLocation" | "range">> = {},
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

function seededUnit(seed: number, index: number, salt: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
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

function isTargetInChainsawArc(target: Combatant, origin: Vec2, aim: Vec2): boolean {
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - origin.x;
  const dy = targetCenter.y - origin.y;
  const forward = dx * aim.x + dy * aim.y;
  if (forward < -12 || forward > chainsawRange + target.width * 0.4) {
    return false;
  }
  const side = Math.abs(dx * -aim.y + dy * aim.x);
  return side <= chainsawThickness / 2 + Math.max(target.width, target.height) * 0.24;
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

function clampSpikePoint(point: Vec2): Vec2 {
  return {
    x: clamp(point.x, DEFAULT_PHYSICS.platformLeft + spikeBoundsPadding, DEFAULT_PHYSICS.platformRight - spikeBoundsPadding),
    y: clamp(point.y, -3200, COMBAT_TUNING.projectiles.floorY),
  };
}

function buildSpikeGeometry(player: PlayerPhysicsState, point: Vec2): { base: Vec2; tip: Vec2; direction: Vec2; length: number } {
  const tip = clampSpikePoint(point);
  const ownerCenter = {
    x: player.x + player.width / 2,
    y: player.y + player.height / 2,
  };
  const facing = facingFromAim(tip.x - ownerCenter.x, player.facing);
  const floorY = COMBAT_TUNING.projectiles.floorY;
  const fromOwner = normalize({
    x: tip.x - ownerCenter.x || facing,
    y: tip.y - ownerCenter.y || -0.4,
  });
  const heightFromFloor = floorY - tip.y;
  let base: Vec2;
  if (heightFromFloor <= 260) {
    const groundDrop = clamp(78 + heightFromFloor * 0.58, 76, 230);
    const backstep = clamp(34 + heightFromFloor * 0.16, 34, 86);
    base = {
      x: tip.x - facing * backstep,
      y: Math.min(floorY + 24, tip.y + groundDrop),
    };
  } else {
    const distance = Math.hypot(tip.x - ownerCenter.x, tip.y - ownerCenter.y);
    const length = clamp(distance * 0.72, spikeMinLength, spikeMaxLength);
    base = {
      x: tip.x - fromOwner.x * length,
      y: tip.y - fromOwner.y * length,
    };
  }
  let delta = { x: tip.x - base.x, y: tip.y - base.y };
  let length = Math.hypot(delta.x, delta.y);
  if (length < spikeMinLength) {
    const fallback = normalize({ x: facing * 0.38, y: -1 });
    base = {
      x: tip.x - fallback.x * spikeMinLength,
      y: tip.y - fallback.y * spikeMinLength,
    };
    delta = { x: tip.x - base.x, y: tip.y - base.y };
    length = spikeMinLength;
  }
  const direction = normalize(delta);
  return { base, tip, direction, length };
}

function spikeCurrentLength(spike: SpikeState): number {
  if (spike.disintegrating) {
    return spike.length * Math.max(0, 1 - spike.disintegrateAge / spikeDisintegrateDuration);
  }
  return spike.length * easeOutCubic(clamp(spike.age / spike.growDuration, 0, 1));
}

function spikeCurrentTip(spike: SpikeState): Vec2 {
  const length = Math.max(16, spikeCurrentLength(spike));
  return {
    x: spike.baseX + spike.dirX * length,
    y: spike.baseY + spike.dirY * length,
  };
}

function targetSpikeContact(target: RectLike, spike: SpikeState): { kind: "body" | "tip"; point: Vec2 } | undefined {
  const from = { x: spike.baseX, y: spike.baseY };
  const to = spikeCurrentTip(spike);
  const tipDistance = distanceRectToPoint(target, to);
  if (tipDistance <= spikeTipRadius) {
    return { kind: "tip", point: to };
  }
  const closest = closestRectPointToSegment(target, from, to);
  if (!closest || closest.distance > spike.width / 2 + 10) {
    return undefined;
  }
  return { kind: "body", point: closest.point };
}

function closestRectPointToSegment(target: RectLike, from: Vec2, to: Vec2): { distance: number; point: Vec2 } | undefined {
  const samples = [
    { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    { x: target.x, y: target.y },
    { x: target.x + target.width, y: target.y },
    { x: target.x, y: target.y + target.height },
    { x: target.x + target.width, y: target.y + target.height },
    { x: target.x + target.width / 2, y: target.y },
    { x: target.x + target.width / 2, y: target.y + target.height },
  ];
  let nearest: { distance: number; point: Vec2 } | undefined;
  for (const sample of samples) {
    const projected = closestPointOnSegment(sample, from, to);
    const distance = Math.hypot(sample.x - projected.x, sample.y - projected.y);
    if (!nearest || distance < nearest.distance) {
      nearest = { distance, point: projected };
    }
  }
  return nearest;
}

function closestPointOnSegment(point: Vec2, from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = Math.max(1, dx * dx + dy * dy);
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq, 0, 1);
  return {
    x: from.x + dx * t,
    y: from.y + dy * t,
  };
}

function distanceRectToPoint(target: RectLike, point: Vec2): number {
  const closestX = clamp(point.x, target.x, target.x + target.width);
  const closestY = clamp(point.y, target.y, target.y + target.height);
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
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
    case "chainsaw":
      return "#b8bfd7";
    case "spikes":
      return "#f2f2f2";
    case "van":
      return "#f2f2f2";
    case "spirit-fighter":
      return "#ffd84d";
    case "cross":
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

function spiritBeatProgress(state: SpiritFocusState): number {
  const next = state.beatLines
    .filter((line) => !line.fake && !line.hit)
    .sort((left, right) => Math.abs(left.timeToImpact) - Math.abs(right.timeToImpact))[0];
  if (!next) {
    return 0;
  }
  return clamp(1 - Math.max(0, next.timeToImpact) / Math.max(0.01, next.duration), 0, 1);
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
    case "poison":
      return { id, label: "Poison", duration: 18, stacks: 1, tickDamage: 2, tickEvery: 1, tickTimer: 1 };
    case "spikePoison":
      return { id, label: "Spike Poison", duration: 18, stacks: 1, tickDamage: 4, tickEvery: 0.75, tickTimer: 0.75 };
    case "spikeMode":
      return { id, label: "Spike Mode", duration: spikeModeDuration, stacks: 1 };
    case "spiritFocus":
      return { id, label: "Beat Focus", duration: spiritMaxDuration, stacks: 1 };
    case "winded":
      return { id, label: "Winded", duration: spiritWindedDuration, stacks: 1 };
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

function sweptCircleBounds(previousX: number, previousY: number, x: number, y: number, radius: number): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(previousX, x) - radius;
  const maxX = Math.max(previousX, x) + radius;
  const minY = Math.min(previousY, y) - radius;
  const maxY = Math.max(previousY, y) + radius;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function createRopePoints(start: Vec2, end: Vec2, count: number): GrappleRopePoint[] {
  const points: GrappleRopePoint[] = [];
  const total = Math.max(2, count);
  for (let index = 0; index < total; index += 1) {
    const t = index / (total - 1);
    const sag = Math.sin(t * Math.PI) * 14;
    const x = lerp(start.x, end.x, t);
    const y = lerp(start.y, end.y, t) + sag;
    points.push({ x, y, px: x, py: y });
  }
  return points;
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
