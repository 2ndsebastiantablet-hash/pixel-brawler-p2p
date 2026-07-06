import { DEFAULT_PHYSICS, type PlayerPhysicsState } from "../Physics";
import type { DamageNumber, DamageRequest, DamageResult, Vec2 } from "./Damage";
import type { Hitbox } from "./Hitbox";
import { intersectsRect } from "./Hitbox";
import type { Projectile } from "./Projectile";
import { projectileBounds } from "./Projectile";
import { updateStatusEffects, upsertStatusEffect, type StatusEffect, type StatusEffectId } from "./StatusEffects";
import type { AttackProfile, WeaponId, WeaponInventoryState, WeaponUseContext, WeaponUseResult } from "./Weapon";
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
    | "slam";
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

export class CombatSystem {
  private inventory: WeaponInventoryState = createDefaultInventory();
  private readonly combatants = new Map<string, Combatant>();
  private readonly projectiles: Projectile[] = [];
  private readonly hitboxes: Hitbox[] = [];
  private readonly droppedWeapons: DroppedWeapon[] = [];
  private readonly damageNumbers: DamageNumber[] = [];
  private readonly effects: CombatEffect[] = [];
  private readonly recentEvents: CombatEventPacket[] = [];
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
      this.addRadialHitbox(context, weapon.secondary, "Vent");
      return { kind: "hitbox", weaponId: weapon.id, label: "Vent" };
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
    this.inventory.equippedWeapon = best.weapon.weaponId;
    const index = this.droppedWeapons.indexOf(best.weapon);
    this.droppedWeapons.splice(index, 1);
    this.addEffect("pickup", best.weapon.x, best.weapon.y, best.weapon.x, best.weapon.y, "#ffd84d", weaponRegistry.get(best.weapon.weaponId).name);
    this.queueSound("weapon-pickup");
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
    this.queueSound("player-hit");
    this.queueSound("damage-pop");
    if (request.status === "tripped" || request.status === "daze") {
      this.queueSound("player-stunned");
      this.addEffect("stun", target.x + target.width / 2, target.y + 12, target.x + target.width / 2, target.y + 12, "#ffd84d", request.status === "tripped" ? "Trip" : "Stun");
    }
    if (request.status === "shock") {
      this.queueSound("lightning-shock");
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
      this.queueSound("respawn");
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
      this.queueSound(weapon.id === "pistol" ? "pistol-empty" : "weapon-drop");
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
      this.queueSound(weapon.id === "pistol" ? "pistol-empty" : "weapon-drop");
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
        this.queueSound("pistol-shot");
        const muzzle = this.muzzle(context.player);
        this.addEffect("muzzle", muzzle.x, muzzle.y, muzzle.x + context.aim.x * 24, muzzle.y + context.aim.y * 24, "#fff4a8", "Bang");
      }
      if (weapon.id === "teleport-ball") {
        this.queueSound("teleport-throw");
      }
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

    this.spawnMeleeHitbox(context, chargedProfile, slot === "secondary" ? "Heavy" : weapon.name);
    if (weapon.id === "sledgehammer" && context.heldMs >= 650) {
      this.addRadialHitbox(context, {
        ...chargedProfile,
        damage: Math.round(chargedProfile.damage * 0.72),
        range: 190,
        knockback: chargedProfile.knockback * 0.7,
        stun: Math.max(chargedProfile.stun, 0.45),
      }, "Charged Slam");
    }
    this.recentEvents.push(this.createEvent(context.ownerId, weapon.id, slot, this.muzzle(context.player), normalize(context.aim), weapon.name, context.now));
    return { kind: "hitbox", weaponId: weapon.id, label: weapon.name };
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
    const aim = normalize(aimInput);
    const groundedScale = player.grounded ? 0.55 : 1;
    player.velocityX -= aim.x * 170 * groundedScale;
    player.velocityY -= Math.max(-0.25, aim.y) * 70 * groundedScale;
    if (!player.grounded) {
      player.velocityX -= aim.x * 105;
      player.velocityY -= 70;
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
    this.bodyContactCooldowns.set(key, kind.includes("slam") ? 0.45 : 0.32);
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
    const chargeMultiplier = chargeState && !chargeState.charging ? 1 + Math.min(chargeState.charge / 6, profile.chargeScale ?? 1) : 1;
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
        label: weapon.name,
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
      chargeState.charge = 0;
      chargeState.heat = Math.min(1, chargeState.heat + 0.16);
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
    const isHammer = weaponId === "sledgehammer";
    const lowTrip = isWhip && (context.player.ducking || context.player.lowSliding || context.player.action === "duck" || context.player.action === "lowSlide");
    const width = profile.range;
    const height = isWhip ? Math.max(32, (profile.radius ?? 14) * 2.4) : Math.max(22, (profile.radius ?? 14) * 2);
    const x = aim.x >= 0 ? center.x : center.x - width;
    const y = lowTrip ? center.y + 18 : center.y - height / 2 + aim.y * (isWhip ? 44 : 18);
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
      label: lowTrip ? "Low Whip" : label,
      color: colorForWeapon(weaponId),
      status: lowTrip ? "tripped" : profile.status,
      sweetSpot: isWhip ? "tip" : undefined,
      lowTrip,
      heavy: isHammer,
      hits: [],
    });
    this.addEffect(weaponId === "sledgehammer" ? "slam" : weaponId === "lightning-rod" ? "lightning" : "whip", x, y, x + width * Math.sign(aim.x || context.player.facing), y, colorForWeapon(weaponId), lowTrip ? "Low trip" : label);
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
    this.queueSound(weaponId === "pistol" ? "pistol-throw" : "weapon-drop");
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
        charge.heat = Math.max(0, charge.heat - dt * 0.045);
        if (charge.charging) {
          charge.charge += dt * Math.max(0.35, 1 - charge.heat);
          if (charge.charge > charge.maxCharge) {
            charge.charge = 0;
            charge.charging = false;
          }
        }
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
        if (projectile.weaponId === "lightning-rod" && projectile.id.startsWith("throw")) {
          this.addEffect("lightning", projectile.x, projectile.y, projectile.x, projectile.y - 140, "#ffd84d", "Rod Strike");
          this.applyBurstDamage(projectile.ownerId, projectile.x, projectile.y, 105, 10, 230, 0.26, "Rod Strike", "lightning");
          this.queueSound("lightning-strike");
          projectile.age = projectile.lifetime + 1;
          continue;
        }
        projectile.vy *= -0.45;
        projectile.vx *= 0.82;
        projectile.bounces -= 1;
      }
      for (const target of this.combatants.values()) {
        if (target.id === projectile.ownerId || projectile.hits.includes(target.id)) {
          continue;
        }
        if (intersectsRect(projectileBounds(projectile), target)) {
          const closePistolShot = projectile.weaponId === "pistol" && projectile.age < 0.13;
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
            status: projectile.weaponId === "lightning-rod" ? "shock" : projectile.status,
          });
          if (hit.applied) {
            projectile.hits.push(target.id);
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
            this.recentEvents.push(this.createEvent(projectile.ownerId, projectile.weaponId, "hit", { x: projectile.x, y: projectile.y }, normalize(projectile.knockback), projectile.label, performanceNow()));
            if (projectile.weaponId === "teleport-ball") {
              continue;
            } else if (projectile.pierce <= 0) {
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
          const owner = this.combatants.get(hitbox.ownerId);
          const whipHit = hitbox.weaponId === "whip";
          const tipHit = whipHit && isWhipTipHit(hitbox, target);
          const combo = whipHit ? this.registerWhipHit(target.id) : { count: 0, pulled: false };
          const pull = whipHit && combo.pulled && owner
            ? {
                x: Math.sign((owner.x + owner.width / 2) - (target.x + target.width / 2)) * 380,
                y: -135,
              }
            : undefined;
          const damage = whipHit && tipHit ? hitbox.damage + 4 : hitbox.damage;
          const stun = whipHit && tipHit ? hitbox.stun + 0.14 : hitbox.lowTrip ? Math.max(hitbox.stun, 0.32) : hitbox.stun;
          const hit = this.applyDamage({
            sourceId: hitbox.ownerId,
            targetId: target.id,
            damage,
            knockback: pull ?? hitbox.knockback,
            stun,
            label: combo.pulled ? "Whip Pull" : tipHit ? "Tip Crack" : hitbox.label,
            status: hitbox.lowTrip ? "tripped" : hitbox.status,
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
            damage: low ? 8 : 5,
            knockback: { x: player.facing * (low ? 360 : 230), y: low ? -230 : -150 },
            stun: low ? 0.58 : 0.36,
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
            damage: 6,
            knockback: { x: Math.sign((target.x + target.width / 2) - (owner.x + owner.width / 2) || 1) * 80, y: -180 },
            stun: 0.34,
            label: "Head Stomp",
            status: "daze",
            sound: "head-stomp",
            effect: "stomp",
          });
          if (hit) {
            player.velocityY = -520;
            owner.velocityY = -520;
          }
        }

        if ((player.airDiving || player.action === "airDive") && intersectsRect(owner, target)) {
          this.applyBodyHit(player.id, target, "air-dive", {
            damage: 12,
            knockback: { x: player.facing * 380, y: -130 },
            stun: 1,
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
          if (Math.abs(targetX - centerX) <= 118 && Math.abs((target.y + target.height) - DEFAULT_PHYSICS.groundY) <= 80) {
            this.applyBodyHit(player.id, target, "ground-slam-wave", {
              damage: 10,
              knockback: { x: Math.sign(targetX - centerX || 1) * 300, y: -210 },
              stun: 0.42,
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
