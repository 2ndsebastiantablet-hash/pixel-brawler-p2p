import { Camera } from "./Camera";
import { InputController } from "./Input";
import { Player } from "./Player";
import { DEFAULT_PHYSICS, PLATFORM_LEFT, PLATFORM_RIGHT, type InputFrame, type PhysicsConfig, type PlayerPhysicsState } from "./Physics";
import { CombatSystem, type CombatEventPacket, type SuperLegsKickKind } from "./combat/CombatSystem";
import type { AmmoPickup, Combatant, CombatEffect, DroppedWeapon, GrappleState, ZombieState } from "./combat/CombatSystem";
import type { Projectile } from "./combat/Projectile";
import type { WeaponId, WeaponUseResult } from "./combat/Weapon";
import { COMBAT_TUNING } from "./combat/CombatTuning";
import { createDefaultInventory, weaponRegistry } from "./combat/WeaponRegistry";
import {
  DEFAULT_LOADOUT,
  LOADOUT_SLOT_LABELS,
  assignLoadoutItem,
  isSlotCompatible,
  isTwoHandedWeapon,
  loadoutHasWeapon,
  loadoutWeaponName,
  normalizeLoadout,
  swapAttachmentWithHand,
  type LoadoutSlotId,
  type LoadoutState,
} from "./loadout/Loadout";
import { playSound } from "../audio/SoundSystem";
import {
  encodePlayerStatePacket,
  interpolateRemoteState,
  type CombatEventPacket as NetCombatEventPacket,
  type PlayerNetState,
  type PlayerStatePacket,
} from "../net/NetTypes";
import type { PlayerProfile } from "../ui/Profile";

const WING_FLIGHT_CONFIG = {
  enabled: true,
  liftAcceleration: 1900,
  climbAcceleration: 520,
  glideGravityScale: 0.34,
  diveAcceleration: 1450,
  maxRiseSpeed: -620,
  maxFallSpeed: 620,
  horizontalAccelerationScale: 1.45,
  airBurstSpeed: 780,
  airBurstVerticalSpeed: -160,
  airBurstCooldown: 0.7,
} as const;

interface RemotePlayer {
  player: Player;
  current: PlayerNetState;
  target: PlayerNetState;
}

interface LandingBurst {
  x: number;
  y: number;
  age: number;
  color: string;
}

interface AttachmentVisual {
  x: number;
  y: number;
  vx: number;
  vy: number;
  initialized: boolean;
}

interface AttackVisual {
  weaponId: WeaponId;
  kind: "primary" | "secondary" | "throw" | "reload";
  timer: number;
}

interface WeaponActionInput {
  pressed: boolean;
  held: boolean;
  released: boolean;
  heldMs: number;
  isFirstHeldFrame: boolean;
  attackKind: AttackVisual["kind"];
  now: number;
  aim: { x: number; y: number };
}

interface GameOptions {
  onLocalState: (packet: PlayerStatePacket) => void;
  onCombatEvent: (packet: NetCombatEventPacket) => void;
}

export interface GameDebugSnapshot {
  localPlayer: {
    id: string;
    clientId: string;
    name: string;
    color: string;
    x: number;
    y: number;
    weaponId: WeaponId;
    hp?: number;
    maxHp?: number;
  };
  remotePlayers: {
    count: number;
    players: Array<{
      id: string;
      clientId: string;
      name: string;
      color: string;
      x: number;
      y: number;
      hp?: number;
      maxHp?: number;
    }>;
  };
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  private readonly combatHud: HTMLElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly input = new InputController();
  private readonly camera = new Camera();
  private readonly combat = new CombatSystem({ mode: "offline" });
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly bursts: LandingBurst[] = [];
  private localPlayer = new Player("local", "local", "Player", -40, "#18dff5");
  private animationFrame = 0;
  private lastTime = 0;
  private sendAccumulator = 0;
  private running = false;
  private showNames = true;
  private shakeTimer = 0;
  private primaryHeldMs = 0;
  private secondaryHeldMs = 0;
  private footstepTimer = 0;
  private lastAim = { x: 1, y: 0 };
  private lastMouse = { x: 0, y: 0 };
  private loadout: LoadoutState = DEFAULT_LOADOUT;
  private readonly attachmentVisual: AttachmentVisual = { x: 0, y: 0, vx: 0, vy: 0, initialized: false };
  private attackVisual: AttackVisual | null = null;
  private readonly remoteCombatEvents: CombatEventPacket[] = [];

  constructor(parent: HTMLElement, private readonly options: GameOptions) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.combatHud = document.createElement("section");
    this.combatHud.className = "combat-hud-panel";
    this.combatHud.hidden = true;
    parent.append(this.canvas);
    parent.append(this.combatHud);

    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is not available");
    }
    this.context = context;

    window.addEventListener("resize", this.resize);
    this.resize();
    this.renderEmpty();
  }

  startOffline(profile: PlayerProfile): void {
    this.start("local", profile, -40);
    this.combat.spawnTrainingDummy({ x: 110, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });
  }

  startNetwork(localId: string, profile: PlayerProfile, side: "host" | "guest"): void {
    this.start(localId, profile, side === "host" ? -70 : 70);
  }

  setShowNames(show: boolean): void {
    this.showNames = show;
  }

  applyProfile(profile: PlayerProfile): void {
    this.localPlayer.clientId = profile.clientId;
    this.localPlayer.name = profile.name;
    this.localPlayer.color = profile.color;
    this.localPlayer.state.label = profile.name;
    this.showNames = profile.showNames;
    this.loadout = normalizeLoadout(profile.loadout);
    this.attachmentVisual.initialized = false;
    const equipped = this.combat.getPlayerInventory().equippedWeapon;
    if (!loadoutHasWeapon(this.loadout, equipped)) {
      this.combat.setEquippedWeapon(this.loadout.leftHand ?? this.loadout.frontStrap ?? "pistol");
    }
    this.renderCombatHud();
  }

  getDebugSnapshot(): GameDebugSnapshot {
    const localCombatant = this.combat.getCombatant(this.localPlayer.state.id);
    const remotePlayers = [...this.remotes.values()].map((remote) => {
      const combatant = this.combat.getCombatant(remote.player.state.id);
      return {
        id: remote.player.state.id,
        clientId: remote.player.clientId,
        name: remote.player.name,
        color: remote.player.color,
        x: remote.player.state.x,
        y: remote.player.state.y,
        hp: combatant?.hp,
        maxHp: combatant?.maxHp,
      };
    });

    return {
      localPlayer: {
        id: this.localPlayer.state.id,
        clientId: this.localPlayer.clientId,
        name: this.localPlayer.name,
        color: this.localPlayer.color,
        x: this.localPlayer.state.x,
        y: this.localPlayer.state.y,
        weaponId: this.combat.getPlayerInventory().equippedWeapon,
        hp: localCombatant?.hp,
        maxHp: localCombatant?.maxHp,
      },
      remotePlayers: {
        count: remotePlayers.length,
        players: remotePlayers,
      },
    };
  }

  stop(): void {
    this.running = false;
    this.remotes.clear();
    this.bursts.length = 0;
    this.combat.start(createDefaultInventory());
    this.combatHud.hidden = true;
    cancelAnimationFrame(this.animationFrame);
    this.renderEmpty();
  }

  dispose(): void {
    this.stop();
    this.input.dispose();
    window.removeEventListener("resize", this.resize);
  }

  setRemoteState(state: PlayerNetState): void {
    if (state.id === this.localPlayer.state.id) {
      return;
    }

    const existing = this.remotes.get(state.id);
    if (existing) {
      if (state.sequence >= existing.target.sequence) {
        existing.target = state;
      }
      return;
    }

    const player = new Player(state.id, state.clientId, state.name, state.x, state.color);
    player.applyNetState(state);
    this.remotes.set(state.id, { player, current: state, target: state });
  }

  removeRemote(peerId: string): void {
    this.remotes.delete(peerId);
    this.combat.removeCombatant(peerId);
  }

  applyCombatEvent(event: NetCombatEventPacket): void {
    this.combat.applyRemoteEvent(event as CombatEventPacket);
    if (event.action === "hit" && event.targetId === this.localPlayer.state.id) {
      this.applyCombatantKnockbackToLocal();
    }
    this.remoteCombatEvents.push(event as CombatEventPacket);
  }

  private start(id: string, profile: PlayerProfile, x: number): void {
    this.localPlayer = new Player(id, profile.clientId, profile.name, x, profile.color);
    this.remotes.clear();
    this.bursts.length = 0;
    this.loadout = normalizeLoadout(profile.loadout);
    this.attachmentVisual.initialized = false;
    this.combat.start(createDefaultInventory());
    this.combat.setEquippedWeapon(this.loadout.leftHand ?? this.loadout.frontStrap ?? "pistol");
    this.combatHud.hidden = false;
    this.shakeTimer = 0;
    this.primaryHeldMs = 0;
    this.secondaryHeldMs = 0;
    this.footstepTimer = 0;
    this.attackVisual = null;
    this.running = true;
    this.lastTime = performance.now();
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (time: number): void => {
    if (!this.running) {
      return;
    }

    const dt = Math.min((time - this.lastTime) / 1000, 1 / 20);
    this.lastTime = time;
    this.update(dt, time);
    this.draw();
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private update(dt: number, time: number): void {
    let movementInput = this.input.consumeFrame();
    const combatInput = this.input.consumeCombatFrame();
    this.lastMouse = { x: combatInput.mouseX, y: combatInput.mouseY };
    this.lastAim = this.getAim(combatInput);
    const localCombatant = this.combat.getCombatant(this.localPlayer.state.id);
    const scrambled = localCombatant?.statuses.some((status) => status.id === "scrambled") ?? false;
    if (scrambled) {
      if (isMovementInputActive(movementInput)) {
        this.combat.resistAttachedHands(this.localPlayer.state.id, movementInput.jumpPressed || movementInput.downPressed || movementInput.dashPressed ? 1.25 : 0.35);
      }
      movementInput = scrambledInput(movementInput);
    }
    if (movementInput.jumpPressed && this.combat.getRocketState(this.localPlayer.state.id).riding) {
      this.combat.jumpOffRocket(this.localPlayer.state.id, this.localPlayer.state);
    }
    const lockedOut = (localCombatant?.respawnTimer ?? 0) > 0
      || (localCombatant?.statuses.some((status) => status.id === "deathFrozen") ?? false)
      || this.combat.isMovementLocked(this.localPlayer.state.id);
    const previousState = { ...this.localPlayer.state };
    this.localPlayer.update(lockedOut ? neutralInput() : movementInput, dt, this.getWeightedPhysics());
    this.playMovementFeedback(previousState, this.localPlayer.state, dt);
    this.updateAttachmentVisual(dt);
    this.combat.syncLocalPlayer(this.localPlayer.state, this.localPlayer.name, this.localPlayer.color);
    this.combat.setEquipmentStatus(this.localPlayer.state.id, "superLegs", loadoutHasWeapon(this.loadout, "super-legs"));
    this.handleSuperLegsKick(movementInput, lockedOut, time);
    this.handleCombatInput(combatInput, dt, time);
    if (this.combat.getCombatant(this.localPlayer.state.id)?.statuses.some((status) => status.id === "steady")) {
      this.localPlayer.state.velocityX = 0;
      this.localPlayer.state.velocityY = 0;
    }

    if (this.localPlayer.state.justSlamLanded) {
      this.shakeTimer = 0.18;
      this.bursts.push({
        x: this.localPlayer.state.x + this.localPlayer.state.width / 2,
        y: DEFAULT_PHYSICS.groundY,
        age: 0,
        color: this.localPlayer.color,
      });
    }

    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    for (const burst of this.bursts) {
      burst.age += dt;
    }
    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      if (this.bursts[index].age > 0.28) {
        this.bursts.splice(index, 1);
      }
    }

    for (const remote of this.remotes.values()) {
      remote.current = interpolateRemoteState(remote.current, remote.target, Math.min(dt * 12, 1));
      remote.player.advanceAnimation(dt);
      remote.player.applyNetState(remote.current);
    }
    this.resolveRemotePlayerCollisions();
    for (const remote of this.remotes.values()) {
      const remoteLoadout = normalizeLoadout(remote.current.loadout ?? {});
      this.combat.syncRemotePlayer({
        id: remote.player.state.id,
        name: remote.player.name,
        color: remote.player.color,
        x: remote.player.state.x,
        y: remote.player.state.y,
        width: remote.player.state.width,
        height: remote.player.state.height,
        velocityX: remote.player.state.velocityX,
        velocityY: remote.player.state.velocityY,
        hp: remote.current.hp,
        maxHp: remote.current.maxHp,
        statuses: remote.current.statuses,
        respawnTimer: remote.current.respawnTimer,
        invulnerable: remote.current.invulnerable,
      });
      this.combat.setEquipmentStatus(remote.player.state.id, "superLegs", loadoutHasWeapon(remoteLoadout, "super-legs"));
    }

    this.combat.setRocketGuidance(this.localPlayer.state.id, this.lastAim);
    this.combat.update(dt, [this.localPlayer.state]);
    this.applyLocalRespawnState();
    for (const event of this.combat.consumeEvents()) {
      this.options.onCombatEvent(event);
    }
    for (const sound of this.combat.consumeSounds()) {
      playSound(sound);
      this.applySoundShake(sound);
    }
    if (this.attackVisual) {
      this.attackVisual.timer = Math.max(0, this.attackVisual.timer - dt);
      if (this.attackVisual.timer === 0) {
        this.attackVisual = null;
      }
    }
    this.camera.follow(
      this.localPlayer.state.x + this.localPlayer.state.width / 2,
      this.localPlayer.state.y + this.localPlayer.state.height / 2,
      this.canvas.width,
      this.canvas.height,
    );
    this.renderCombatHud();

    this.sendAccumulator += dt;
    if (this.sendAccumulator >= 1 / 20) {
      this.sendAccumulator = 0;
      const localCombatant = this.combat.getCombatant(this.localPlayer.state.id);
      const deathAura = this.combat.getDeathAuraState(this.localPlayer.state.id);
      const rocket = this.combat.getRocketState(this.localPlayer.state.id);
      const chargeWeaponId = this.getNetworkChargeWeaponId();
      this.options.onLocalState(encodePlayerStatePacket({
        ...this.localPlayer.toNetState(time),
        weaponId: this.combat.getPlayerInventory().equippedWeapon,
        hp: localCombatant?.hp,
        maxHp: localCombatant?.maxHp,
        statuses: localCombatant?.statuses.map((status) => status.id),
        respawnTimer: localCombatant?.respawnTimer,
        invulnerable: localCombatant?.invulnerable,
        aimX: this.lastAim.x,
        aimY: this.lastAim.y,
        chargeWeaponId,
        chargeHeldMs: chargeWeaponId ? this.primaryHeldMs : undefined,
        deathAuraActive: deathAura.active,
        deathAuraPower: deathAura.power,
        rocketActive: rocket.active,
        rocketLit: rocket.lit,
        loadout: this.loadout,
        lastActivityAt: Date.now(),
      }));
    }
  }

  private draw(): void {
    const ctx = this.context;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.drawBackdrop(ctx);

    if (this.shakeTimer > 0) {
      const power = this.shakeTimer / 0.18;
      ctx.translate(Math.round(Math.sin(performance.now() * 0.08) * 5 * power), Math.round(Math.cos(performance.now() * 0.1) * 3 * power));
    }

    this.drawGrid(ctx);
    this.drawPlatform(ctx);
    this.drawBursts(ctx);
    this.drawCombatEntities(ctx);
    for (const remote of this.remotes.values()) {
      if (remote.current.statuses?.includes("steady")) {
        continue;
      }
      this.drawRemoteStatusVisuals(ctx, remote);
      this.drawInvulnerabilityGlow(ctx, remote.player.state, remote.current.invulnerable ?? this.combat.getCombatant(remote.player.state.id)?.invulnerable ?? 0);
      remote.player.draw(ctx, this.camera.x, this.camera.y, this.showNames);
      const remoteLoadout = normalizeLoadout(remote.current.loadout ?? {});
      this.drawLoadoutHarness(ctx, remote.player.state, remote.player.color, remoteLoadout);
      if (remoteLoadout.attachment) {
        this.drawRemoteAttachmentString(ctx, remote.player.state, remoteLoadout.attachment);
      }
      if (loadoutHasWeapon(remoteLoadout, "wings") || remote.current.weaponId === "wings" || remote.current.statuses?.includes("angelWings")) {
        const mode = remote.current.weaponId === "wings" && !remote.player.state.grounded && remote.player.state.velocityY < -120 ? "flap" : remote.player.state.grounded ? "idle" : "glide";
        this.drawWings(ctx, remote.player.state, remote.player.color, mode);
      }
      if (loadoutHasWeapon(remoteLoadout, "super-legs") || remote.current.statuses?.includes("superLegs")) {
        this.drawSuperLegs(ctx, remote.player.state);
      }
      this.drawRemoteWeapon(ctx, remote);
      this.drawRemoteHealth(ctx, remote);
    }
    const localCombatant = this.combat.getCombatant(this.localPlayer.state.id);
    const steady = localCombatant?.statuses.some((status) => status.id === "steady") ?? false;
    if (!steady) {
      this.drawInvulnerabilityGlow(ctx, this.localPlayer.state, localCombatant?.invulnerable ?? 0);
      this.localPlayer.draw(ctx, this.camera.x, this.camera.y, this.showNames);
      this.drawLoadoutHarness(ctx, this.localPlayer.state, this.localPlayer.color, this.loadout);
      if (this.loadout.attachment) {
        this.drawAttachmentString(ctx, this.localPlayer.state, this.loadout.attachment);
      }
      if (loadoutHasWeapon(this.loadout, "wings") || localCombatant?.statuses.some((status) => status.id === "angelWings")) {
        const mode = this.localPlayer.state.wingFlapping ? "flap" : this.localPlayer.state.wingDiving ? "dive" : this.localPlayer.state.grounded ? "idle" : "glide";
        this.drawWings(ctx, this.localPlayer.state, this.localPlayer.color, mode);
      }
      if (loadoutHasWeapon(this.loadout, "super-legs") || localCombatant?.statuses.some((status) => status.id === "superLegs")) {
        this.drawSuperLegs(ctx, this.localPlayer.state);
      }
      this.drawLocalWeapon(ctx);
    }
    this.drawLocalHealth(ctx);
    this.drawCrosshair(ctx);
    ctx.restore();
  }

  private handleCombatInput(input: ReturnType<InputController["consumeCombatFrame"]>, dt: number, time: number): void {
    if (input.reloadPressed) {
      this.combat.reload(this.localPlayer.state.id, time);
    }
    if (input.dropPressed) {
      this.combat.dropCurrentWeapon(this.localPlayer.state.id, this.localPlayer.state, this.lastAim, time);
    }

    const aim = this.lastAim;
    if (input.primaryHeld) {
      this.primaryHeldMs += dt * 1000;
    } else {
      if (!input.primaryReleased) {
        this.primaryHeldMs = 0;
      }
    }
    if (input.secondaryHeld) {
      this.secondaryHeldMs += dt * 1000;
    } else {
      if (!input.secondaryReleased) {
        this.secondaryHeldMs = 0;
      }
    }

    if (input.frontStrapPressed) {
      this.useLoadoutSlot("frontStrap", "primary", time);
    }
    if (input.backStrapPressed) {
      this.useLoadoutSlot("backStrap", "primary", time);
    }
    if (input.attachmentPressed) {
      this.useAttachmentSlot();
    }

    const primaryAction = resolveMouseWeaponAction("primary", this.loadout);
    if (primaryAction && (input.primaryPressed || input.primaryHeld || input.primaryReleased)) {
      this.handleWeaponAction(primaryAction.weaponId, primaryAction.action, {
        pressed: input.primaryPressed,
        held: input.primaryHeld,
        released: input.primaryReleased,
        heldMs: this.primaryHeldMs,
        isFirstHeldFrame: this.primaryHeldMs < dt * 1000 + 1,
        attackKind: primaryAction.action,
        now: time,
        aim,
      });
    }

    const secondaryAction = resolveMouseWeaponAction("secondary", this.loadout);
    if (secondaryAction && (input.secondaryPressed || input.secondaryHeld || input.secondaryReleased)) {
      this.handleWeaponAction(secondaryAction.weaponId, secondaryAction.action, {
        pressed: input.secondaryPressed,
        held: input.secondaryHeld,
        released: input.secondaryReleased,
        heldMs: this.secondaryHeldMs,
        isFirstHeldFrame: this.secondaryHeldMs < dt * 1000 + 1,
        attackKind: secondaryAction.action,
        now: time,
        aim,
      });
    }

    if (input.primaryReleased) {
      this.primaryHeldMs = 0;
    }
    if (input.secondaryReleased) {
      this.secondaryHeldMs = 0;
    }
  }

  private handleSuperLegsKick(input: InputFrame, lockedOut: boolean, time: number): void {
    if (lockedOut || !input.jumpPressed || !loadoutHasWeapon(this.loadout, "super-legs")) {
      return;
    }
    const state = this.localPlayer.state;
    const horizontal = Number(input.right) - Number(input.left);
    let kind: SuperLegsKickKind = "neutral";
    if (input.down && !state.grounded) {
      kind = "downward";
    } else if (input.down && state.grounded) {
      kind = "slam";
    } else if (!state.grounded && state.velocityY > 180) {
      kind = "bounce";
    } else if (horizontal !== 0) {
      const aimedFacing = Math.sign(this.lastAim.x || state.facing) || state.facing;
      kind = horizontal === aimedFacing ? "forward" : "back";
    }
    this.recordAttack(this.combat.useSuperLegsKick({
      ownerId: state.id,
      player: state,
      aim: this.lastAim,
      now: time,
      heldMs: 0,
      isNewPress: true,
    }, kind), "primary");
  }

  private useLoadoutSlot(slot: LoadoutSlotId, action: "primary" | "secondary", time: number): void {
    const weaponId = this.loadout[slot];
    if (!weaponId) {
      return;
    }
    const previousWeapon = this.combat.getPlayerInventory().equippedWeapon;
    this.combat.setEquippedWeapon(weaponId);
    const context = {
      ownerId: this.localPlayer.state.id,
      player: this.localPlayer.state,
      aim: this.lastAim,
      now: time,
      heldMs: 0,
      isNewPress: true,
    };
    this.recordAttack(action === "primary" ? this.combat.usePrimary(context) : this.combat.useSecondary(context), action);
    if ((slot === "frontStrap" || slot === "backStrap") && previousWeapon) {
      this.combat.setEquippedWeapon(previousWeapon);
    }
  }

  private useAttachmentSlot(): void {
    const picked = this.combat.pickUpNearest(this.localPlayer.state);
    if (picked) {
      this.assignPickedLoadoutItem(picked);
      return;
    }
    const preferredSlot = this.preferredHandSlot();
    const swap = swapAttachmentWithHand(this.loadout, preferredSlot);
    if (!swap.swapped) {
      this.recordAttack({ kind: "blocked", weaponId: this.loadout.attachment ?? this.loadout[preferredSlot] ?? "pistol", label: swap.reason ?? "Cannot swap" }, "primary");
      return;
    }
    this.loadout = swap.loadout;
    this.combat.setEquippedWeapon(this.loadout[preferredSlot] ?? this.loadout.rightHand ?? this.loadout.leftHand ?? this.loadout.attachment ?? "pistol");
    this.attachmentVisual.initialized = false;
    playSound("weapon-pickup");
  }

  private assignPickedLoadoutItem(weaponId: WeaponId): void {
    const slot: LoadoutSlotId | null = isSlotCompatible(weaponId, "attachment")
      ? "attachment"
      : isSlotCompatible(weaponId, "rightHand")
        ? "rightHand"
        : isSlotCompatible(weaponId, "frontStrap")
          ? "frontStrap"
          : isSlotCompatible(weaponId, "legs")
            ? "legs"
            : null;
    if (!slot) {
      return;
    }
    this.loadout = assignLoadoutItem(this.loadout, slot, weaponId);
    this.combat.setEquippedWeapon(weaponId);
  }

  private preferredHandSlot(): Extract<LoadoutSlotId, "leftHand" | "rightHand"> {
    const equipped = this.combat.getPlayerInventory().equippedWeapon;
    if (this.loadout.leftHand === equipped && this.loadout.rightHand !== equipped) {
      return "leftHand";
    }
    return "rightHand";
  }

  private handleWeaponAction(weaponId: WeaponId, action: "primary" | "secondary", input: WeaponActionInput): void {
    this.combat.setEquippedWeapon(weaponId);
    if (action === "secondary") {
      this.handleWeaponSecondaryAction(weaponId, input);
      return;
    }
    this.handleWeaponPrimaryAction(weaponId, input);
  }

  private handleWeaponPrimaryAction(weaponId: WeaponId, input: WeaponActionInput): void {
    const charge = this.combat.getPlayerInventory().charge[weaponId];
    if (weaponId === "laser-blaster") {
      if (input.pressed && charge) {
        charge.charging = true;
        charge.charge = 0;
      }
      if (input.held && charge) {
        charge.charging = true;
      }
      if (input.held && charge && charge.charge >= charge.maxCharge) {
        this.recordAttack(this.combat.triggerLaserOvercharge(this.localPlayer.state.id, this.localPlayer.state, input.now), "primary");
      }
      if ((input.released || (input.pressed && !input.held)) && charge) {
        charge.charging = false;
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim: input.aim,
          now: input.now,
          heldMs: input.heldMs,
          isNewPress: true,
        }), "primary");
      }
      return;
    }

    if (weaponId === "slingshot" || weaponId === "sledgehammer" || weaponId === "lightning-rod") {
      if (input.held) {
        this.attackVisual = { weaponId, kind: "primary", timer: 0.12 };
      }
      const released = weaponId === "sledgehammer" ? input.released : input.released || (input.pressed && !input.held);
      if (released) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim: input.aim,
          now: input.now,
          heldMs: input.heldMs,
          isNewPress: true,
        }), "primary");
      }
      return;
    }

    if (weaponId === "minigun" && (input.held || input.pressed)) {
      this.recordAttack(this.combat.usePrimary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim: input.aim,
        now: input.now,
        heldMs: input.heldMs,
        isNewPress: input.pressed,
      }), "primary");
      return;
    }

    if (weaponId === "chainsaw") {
      if (input.held || input.pressed) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim: input.aim,
          now: input.now,
          heldMs: input.heldMs,
          isNewPress: input.pressed,
        }), "primary");
      } else if (input.released) {
        this.recordAttack(this.combat.useSecondary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim: input.aim,
          now: input.now,
          heldMs: input.heldMs,
          isNewPress: true,
        }), "secondary");
      }
      return;
    }

    if (weaponId === "sniper") {
      if (input.pressed) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim: input.aim,
          now: input.now,
          heldMs: input.heldMs,
          isNewPress: true,
        }), "primary");
      }
      return;
    }

    if (input.pressed) {
      this.recordAttack(this.combat.usePrimary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim: input.aim,
        now: input.now,
        heldMs: input.heldMs,
        isNewPress: true,
      }), input.attackKind);
    }
  }

  private handleWeaponSecondaryAction(weaponId: WeaponId, input: WeaponActionInput): void {
    if ((weaponId === "minigun" || weaponId === "sniper" || weaponId === "grappling-hook") && (input.held || input.pressed)) {
      this.recordAttack(this.combat.useSecondary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim: input.aim,
        now: input.now,
        heldMs: input.heldMs,
        isNewPress: input.pressed,
      }), "secondary");
      return;
    }

    if (input.pressed || (weaponId === "lightning-rod" && input.held && input.isFirstHeldFrame)) {
      this.recordAttack(this.combat.useSecondary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim: input.aim,
        now: input.now,
        heldMs: input.heldMs,
        isNewPress: true,
      }), "secondary");
    }
  }

  private recordAttack(result: WeaponUseResult, kind: AttackVisual["kind"]): void {
    if (result.kind === "blocked") {
      return;
    }
    this.attackVisual = {
      weaponId: result.weaponId,
      kind,
      timer: result.kind === "dry-fire" ? 0.12 : result.weaponId === "sledgehammer" ? 0.34 : 0.22,
    };
    if (result.weaponId === "sledgehammer") {
      this.shakeTimer = Math.max(this.shakeTimer, kind === "primary" ? COMBAT_TUNING.sledgehammer.screenShake : COMBAT_TUNING.sledgehammer.screenShake * 0.36);
    }
    if (result.weaponId === "sniper" && result.kind === "fired") {
      this.shakeTimer = Math.max(this.shakeTimer, 0.12);
    }
    if (result.weaponId === "laser-blaster" && result.label === "Overcharge") {
      this.shakeTimer = Math.max(this.shakeTimer, 0.24);
    }
    if (result.weaponId === "lightning-rod" && result.label === "Sky Strike") {
      this.shakeTimer = Math.max(this.shakeTimer, 0.28);
    }
    if (result.weaponId === "holy-bazooka") {
      this.shakeTimer = Math.max(this.shakeTimer, result.kind === "fired" ? 0.2 : 0.12);
    }
    if (result.weaponId === "super-legs" && result.label.includes("Slam")) {
      this.shakeTimer = Math.max(this.shakeTimer, 0.16);
    }
    if (result.weaponId === "machete" && kind === "secondary") {
      this.shakeTimer = Math.max(this.shakeTimer, 0.08);
    }
  }

  private applySoundShake(sound: Parameters<typeof playSound>[0]): void {
    switch (sound) {
      case "sledge-slam":
      case "sledge-impact":
        this.shakeTimer = Math.max(this.shakeTimer, COMBAT_TUNING.sledgehammer.screenShake);
        break;
      case "ground-slam-impact":
      case "laser-overcharge":
      case "rocket-explode":
      case "holy-bazooka-explode":
        this.shakeTimer = Math.max(this.shakeTimer, sound === "holy-bazooka-explode" ? 0.34 : 0.22);
        break;
      case "lightning-strike":
      case "sniper-shot":
        this.shakeTimer = Math.max(this.shakeTimer, sound === "lightning-strike" ? 0.28 : 0.14);
        break;
      case "revolver-last":
      case "minigun-overheat":
      case "chainsaw-overheat":
      case "zombie-spawn":
        this.shakeTimer = Math.max(this.shakeTimer, 0.1);
        break;
      case "machete-chop":
      case "axe-impact":
        this.shakeTimer = Math.max(this.shakeTimer, 0.08);
        break;
    }
  }

  private playMovementFeedback(previous: PlayerPhysicsState, current: PlayerPhysicsState, dt: number): void {
    this.footstepTimer = Math.max(0, this.footstepTimer - dt);
    if (!previous.grounded && current.grounded) {
      playSound(current.justSlamLanded ? "ground-slam-impact" : "landing");
    }
    if (!previous.sliding && current.sliding) {
      playSound(current.lowSliding ? "low-slide" : "dash");
    }
    if (!previous.ducking && current.ducking) {
      playSound("duck");
    }
    if (!previous.groundSlamming && current.groundSlamming) {
      playSound("ground-slam-start");
    }
    if (!previous.airDiving && current.airDiving) {
      playSound("dive-start");
    }
    if (current.wingFlapping) {
      playSound("wing-flap");
    }
    if (current.wingGliding) {
      playSound("wing-wind");
    }
    if (current.wingBurstTimer > 0 && previous.wingBurstTimer === 0) {
      playSound("wing-burst");
    }
    if (previous.grounded && !current.grounded && current.velocityY < 0) {
      playSound(current.jumpsUsed > 1 ? "double-jump" : "jump");
    } else if (previous.jumpsUsed === 1 && current.jumpsUsed === 2 && current.velocityY < 0) {
      playSound("double-jump");
    }
    if (current.grounded && current.action === "run" && Math.abs(current.velocityX) > 180 && this.footstepTimer === 0) {
      playSound("footstep");
      this.footstepTimer = 0.18;
    }
  }

  private resolveRemotePlayerCollisions(): void {
    for (const remote of this.remotes.values()) {
      const local = this.localPlayer.state;
      const other = remote.player.state;
      if (!rectsOverlap(local, other)) {
        continue;
      }
      const localCenter = local.x + local.width / 2;
      const otherCenter = other.x + other.width / 2;
      const overlapX = Math.min(local.x + local.width, other.x + other.width) - Math.max(local.x, other.x);
      if (overlapX <= 0 || overlapX > Math.min(local.width, other.width) + 8) {
        continue;
      }
      const direction = localCenter <= otherCenter ? -1 : 1;
      const localPush = Math.min(10, overlapX * 0.56);
      const remotePush = Math.min(6, overlapX * 0.24);
      local.x += direction * localPush;
      local.velocityX += direction * 58;
      other.x -= direction * remotePush;
      remote.current = { ...remote.current, x: other.x, velocityX: other.velocityX };
    }
  }

  private applyCombatantKnockbackToLocal(): void {
    const combatant = this.combat.getCombatant(this.localPlayer.state.id);
    if (!combatant) {
      return;
    }
    this.localPlayer.state.velocityX = combatant.velocityX;
    this.localPlayer.state.velocityY = combatant.velocityY;
  }

  private applyLocalRespawnState(): void {
    const combatant = this.combat.getCombatant(this.localPlayer.state.id);
    if (!combatant || combatant.respawnTimer <= 0) {
      return;
    }
    this.localPlayer.state.x = combatant.x;
    this.localPlayer.state.y = combatant.y;
    this.localPlayer.state.velocityX = 0;
    this.localPlayer.state.velocityY = 0;
    this.localPlayer.state.grounded = true;
    this.localPlayer.state.sliding = false;
    this.localPlayer.state.lowSliding = false;
    this.localPlayer.state.airDiving = false;
    this.localPlayer.state.groundSlamming = false;
    this.localPlayer.state.action = "idle";
  }

  private getAim(input: ReturnType<InputController["consumeCombatFrame"]>): { x: number; y: number } {
    const worldMouse = {
      x: input.mouseX + this.camera.x,
      y: input.mouseY + this.camera.y,
    };
    const playerCenter = {
      x: this.localPlayer.state.x + this.localPlayer.state.width / 2,
      y: this.localPlayer.state.y + this.localPlayer.state.height / 2,
    };
    const x = worldMouse.x - playerCenter.x;
    const y = worldMouse.y - playerCenter.y;
    const length = Math.hypot(x, y);
    if (length < 2) {
      return { x: this.localPlayer.state.facing, y: 0 };
    }
    return { x: x / length, y: y / length };
  }

  private getNetworkChargeWeaponId(): WeaponId | undefined {
    const equipped = this.combat.getPlayerInventory().equippedWeapon;
    const charge = this.combat.getPlayerInventory().charge[equipped];
    if (equipped === "lightning-rod" && this.primaryHeldMs > 0 && this.lastAim.y < -0.55) {
      return "lightning-rod";
    }
    if (equipped === "laser-blaster" && charge?.charging) {
      return "laser-blaster";
    }
    return undefined;
  }

  private netAim(state: PlayerNetState, fallbackFacing: number): { x: number; y: number } {
    const x = state.aimX ?? fallbackFacing;
    const y = state.aimY ?? 0;
    const length = Math.hypot(x, y);
    if (length < 0.05) {
      return { x: fallbackFacing < 0 ? -1 : 1, y: 0 };
    }
    return { x: x / length, y: y / length };
  }

  private getWeightedPhysics(): PhysicsConfig {
    const weapon = weaponRegistry.get(this.combat.getPlayerInventory().equippedWeapon);
    const weight = weapon.weight;
    const runtime = this.combat.getWeaponRuntimeState(weapon.id, this.localPlayer.state.id);
    const local = this.combat.getCombatant(this.localPlayer.state.id);
    const legSlow = local?.statuses.some((status) => status.id === "legShotSlow") ? COMBAT_TUNING.sniper.legShotMoveMultiplier : 1;
    const legStagger = local?.statuses.some((status) => status.id === "legStagger") ? 0.72 : 1;
    const suppressed = local?.statuses.some((status) => status.id === "suppressed") ? 0.82 : 1;
    const poison = local?.statuses.some((status) => status.id === "poison") ? 0.78 : 1;
    const steadyLock = local?.statuses.some((status) => status.id === "steady") ? 0 : 1;
    const minigunSlow = weapon.id === "minigun" && runtime.heat > 0.02
      ? COMBAT_TUNING.minigun.firingSlowMultiplier
      : weapon.id === "minigun" && runtime.spin > 0.02
        ? COMBAT_TUNING.minigun.spinSlowMultiplier
        : 1;
    const empowered = local?.statuses.some((status) => status.id === "empowered") ? 1.18 : 1;
    const holy = local?.statuses.some((status) => status.id === "holyBuff") ? 1.16 : 1;
    const angelWings = local?.statuses.some((status) => status.id === "angelWings") ?? false;
    const strappedWings = loadoutHasWeapon(this.loadout, "wings");
    const superLegs = loadoutHasWeapon(this.loadout, "super-legs");
    const superLegsMoveScale = superLegs ? 1.18 : 1;
    const movementScale = legSlow * legStagger * suppressed * poison * steadyLock * minigunSlow * empowered * holy * superLegsMoveScale;
    const physics = {
      ...DEFAULT_PHYSICS,
      maxRunSpeed: DEFAULT_PHYSICS.maxRunSpeed * weight.moveSpeedMultiplier * movementScale,
      acceleration: DEFAULT_PHYSICS.acceleration * weight.accelerationMultiplier * movementScale * (superLegs ? 1.12 : 1),
      airAcceleration: DEFAULT_PHYSICS.airAcceleration * weight.airAccelerationMultiplier * movementScale * (superLegs ? 1.18 : 1),
      jumpVelocity: DEFAULT_PHYSICS.jumpVelocity * weight.jumpMultiplier * (empowered > 1 ? 1.06 : 1) * (superLegs ? 1.08 : 1),
      doubleJumpVelocity: DEFAULT_PHYSICS.doubleJumpVelocity * weight.jumpMultiplier * (empowered > 1 ? 1.06 : 1) * (superLegs ? 1.1 : 1),
      thirdJumpVelocity: DEFAULT_PHYSICS.doubleJumpVelocity * weight.jumpMultiplier * (empowered > 1 ? 1.04 : 1) * (superLegs ? 0.96 : 1),
      maxAirJumps: superLegs ? 3 : 2,
      slideSpeed: DEFAULT_PHYSICS.slideSpeed * weight.slideMultiplier * movementScale * (superLegs ? 1.16 : 1),
      lowSlideSpeed: DEFAULT_PHYSICS.lowSlideSpeed * weight.slideMultiplier * movementScale * (superLegs ? 1.2 : 1),
      slideDuration: DEFAULT_PHYSICS.slideDuration * (superLegs ? 1.24 : 1),
      lowSlideDuration: DEFAULT_PHYSICS.lowSlideDuration * (superLegs ? 1.22 : 1),
      groundSlamVelocity: DEFAULT_PHYSICS.groundSlamVelocity * (superLegs ? 1.28 : 1),
      slamLandingDuration: DEFAULT_PHYSICS.slamLandingDuration * (superLegs ? 0.72 : 1),
    };
    return weapon.id === "wings" || strappedWings || angelWings ? { ...physics, wingFlight: WING_FLIGHT_CONFIG } : physics;
  }

  private updateAttachmentVisual(dt: number): void {
    if (!this.loadout.attachment) {
      this.attachmentVisual.initialized = false;
      return;
    }
    const anchor = attachmentAnchor(this.localPlayer.state);
    if (!this.attachmentVisual.initialized) {
      this.attachmentVisual.x = anchor.x - this.localPlayer.state.facing * 22;
      this.attachmentVisual.y = anchor.y + 34;
      this.attachmentVisual.vx = 0;
      this.attachmentVisual.vy = 0;
      this.attachmentVisual.initialized = true;
    }
    const visual = this.attachmentVisual;
    visual.vy += 900 * dt;
    visual.vx *= Math.max(0, 1 - dt * 5.5);
    visual.vy *= Math.max(0, 1 - dt * 3.2);
    visual.x += visual.vx * dt;
    visual.y += visual.vy * dt;
    const dx = visual.x - anchor.x;
    const dy = visual.y - anchor.y;
    const distance = Math.hypot(dx, dy) || 1;
    const maxLength = 46;
    if (distance > maxLength) {
      const pull = (distance - maxLength) / distance;
      visual.x -= dx * pull;
      visual.y -= dy * pull;
      visual.vx -= dx * pull * 9;
      visual.vy -= dy * pull * 9;
    }
  }

  private drawLoadoutHarness(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, color: string, loadout: LoadoutState): void {
    const x = Math.round(state.x - this.camera.x);
    const y = Math.round(state.y - this.camera.y);
    const cx = x + Math.round(state.width / 2);
    const facing = state.facing;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(8, 10, 16, 0.9)";
    this.pixelRect(ctx, cx - 13, y + 15, 26, 4);
    this.pixelRect(ctx, cx - 2, y + 11, 4, 31);
    ctx.fillStyle = color;
    this.pixelRect(ctx, cx - facing * 12 - 2, y + 16, 4, 18);
    if (loadout.frontStrap) {
      this.drawTinyLoadoutItem(ctx, loadout.frontStrap, cx + facing * 16, y + 17, 8);
    }
    if (loadout.backStrap) {
      this.drawTinyLoadoutItem(ctx, loadout.backStrap, cx - facing * 18, y + 13, 8);
    }
    if (loadout.leftHand && !isTwoHandedWeapon(loadout.leftHand)) {
      this.drawTinyLoadoutItem(ctx, loadout.leftHand, cx - 20, y + 35, 6);
    }
    if (loadout.rightHand && !isTwoHandedWeapon(loadout.rightHand)) {
      this.drawTinyLoadoutItem(ctx, loadout.rightHand, cx + 20, y + 35, 6);
    }
    if (loadout.leftHand && loadout.leftHand === loadout.rightHand && isTwoHandedWeapon(loadout.leftHand)) {
      this.drawTinyLoadoutItem(ctx, loadout.leftHand, cx + facing * 25, y + 27, 10);
    }
    if (loadout.legs) {
      this.drawTinyLoadoutItem(ctx, loadout.legs, cx, y + 49, 9);
    }
    ctx.restore();
  }

  private drawAttachmentString(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, weaponId: WeaponId): void {
    const anchor = attachmentAnchor(state);
    this.drawAttachmentLine(ctx, weaponId, anchor, {
      x: this.attachmentVisual.x,
      y: this.attachmentVisual.y,
    });
  }

  private drawRemoteAttachmentString(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, weaponId: WeaponId): void {
    const anchor = attachmentAnchor(state);
    const sway = Math.sin(performance.now() * 0.006 + state.x * 0.04) * 5;
    this.drawAttachmentLine(ctx, weaponId, anchor, {
      x: anchor.x - state.facing * 25 + sway,
      y: anchor.y + 38,
    });
  }

  private drawAttachmentLine(ctx: CanvasRenderingContext2D, weaponId: WeaponId, anchor: { x: number; y: number }, end: { x: number; y: number }): void {
    const ax = Math.round(anchor.x - this.camera.x);
    const ay = Math.round(anchor.y - this.camera.y);
    const ex = Math.round(end.x - this.camera.x);
    const ey = Math.round(end.y - this.camera.y);
    ctx.save();
    ctx.strokeStyle = "rgba(214, 242, 255, 0.72)";
    ctx.shadowColor = "rgba(90, 215, 255, 0.85)";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.strokeRect(ex - 10, ey - 10, 20, 20);
    this.drawTinyLoadoutItem(ctx, weaponId, ex, ey, 8);
    ctx.restore();
  }

  private drawTinyLoadoutItem(ctx: CanvasRenderingContext2D, weaponId: WeaponId, x: number, y: number, size: number): void {
    ctx.fillStyle = colorForWeapon(weaponId);
    this.pixelRect(ctx, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    ctx.fillStyle = "#ffffff";
    this.pixelRect(ctx, Math.round(x + size / 2 - 2), Math.round(y - 1), 3, 3);
  }

  private drawLocalWeapon(ctx: CanvasRenderingContext2D): void {
    const weaponId = this.combat.getPlayerInventory().equippedWeapon;
    if (weaponId === "super-legs") {
      this.drawSuperLegs(ctx, this.localPlayer.state);
      return;
    }
    const state = this.localPlayer.state;
    const aim = this.lastAim;
    const centerX = state.x + state.width / 2 - this.camera.x;
    const centerY = state.y + 24 - this.camera.y;
    const facing = Math.sign(aim.x || state.facing) || 1;
    const active = this.attackVisual?.weaponId === weaponId ? this.attackVisual.timer : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = colorForWeapon(weaponId);

    if (this.drawMouseAimedHeldWeapon(ctx, weaponId, state, centerX, centerY, aim, active, this.primaryHeldMs)) {
      ctx.restore();
      return;
    }

    if (weaponId === "pistol") {
      const kick = active > 0 ? 8 : 0;
      const x = Math.round(centerX + aim.x * (18 - kick));
      const y = Math.round(centerY + aim.y * 8);
      this.pixelRect(ctx, x, y - 4, facing * 24, 8);
      this.pixelRect(ctx, x + facing * 7, y + 3, facing * 8, 9);
      this.pixelRect(ctx, x + facing * 22, y - 2, facing * 8, 4);
      if (active > 0) {
        ctx.fillStyle = "#fff4a8";
        this.pixelRect(ctx, x + facing * 31, y - 5, facing * 12, 10);
        this.pixelRect(ctx, x + facing * 43, y - 2, facing * 9, 4);
      }
    } else if (weaponId === "whip") {
      const reach = active > 0 ? 286 : 78;
      const segments = active > 0 ? 12 : 4;
      for (let index = 1; index <= segments; index += 1) {
        const t = index / segments;
        const curve = Math.sin(t * Math.PI) * 46 * (aim.y >= 0 ? 1 : -1);
        const x = centerX + aim.x * reach * t;
        const y = centerY + aim.y * reach * 0.38 * t + curve;
        const size = index === segments ? 10 : Math.max(3, 8 - index * 0.35);
        ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.round(size), Math.round(size));
      }
      if (active > 0) {
        ctx.fillStyle = "#ffffff";
        const tipX = centerX + aim.x * reach;
        const tipY = centerY + aim.y * reach * 0.38;
        ctx.fillRect(Math.round(tipX - 5), Math.round(tipY - 5), 10, 10);
      }
    } else if (weaponId === "teleport-ball") {
      const x = Math.round(centerX + aim.x * 22);
      const y = Math.round(centerY + aim.y * 14);
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 3, y - 3, 6, 6);
    } else if (weaponId === "lightning-rod") {
      const x = Math.round(centerX + aim.x * 20);
      const y = Math.round(centerY + aim.y * 15);
      this.pixelRect(ctx, x, y - 4, facing * 38, 6);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, x + facing * 32, y - 12, facing * 8, 20);
      if (this.primaryHeldMs > 0 && aim.y < -0.55) {
        this.drawLightningChargeVisual(ctx, state, aim, this.primaryHeldMs);
      }
      const lightning = this.combat.getLightningState(state.id);
      if (lightning.empoweredTimer > 0 || lightning.charging) {
        ctx.fillStyle = "rgba(255, 216, 77, 0.75)";
        for (let index = 0; index < 5; index += 1) {
          const offset = Math.sin(performance.now() * 0.012 + index) * 12;
          ctx.fillRect(Math.round(centerX - 22 + index * 10), Math.round(centerY - 28 + offset), 4, 10);
        }
      }
    } else if (weaponId === "slingshot") {
      const charge = Math.min(this.primaryHeldMs / 850, 1);
      const x = Math.round(centerX + facing * 18);
      const y = Math.round(centerY - 1);
      ctx.fillStyle = "#8b5a2b";
      this.pixelRect(ctx, x, y - 16, facing * 6, 32);
      this.pixelRect(ctx, x, y - 16, facing * 20, 6);
      this.pixelRect(ctx, x, y + 10, facing * 20, 6);
      ctx.fillStyle = "#7cff6b";
      ctx.strokeStyle = "#7cff6b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + facing * 20, y - 12);
      ctx.lineTo(x - facing * Math.round(10 + charge * 24), y);
      ctx.lineTo(x + facing * 20, y + 12);
      ctx.stroke();
      ctx.fillRect(x - facing * Math.round(13 + charge * 24) - 4, y - 4, 8, 8);
    } else if (weaponId === "laser-blaster") {
      const runtime = this.combat.getWeaponRuntimeState("laser-blaster");
      const heat = runtime.heat;
      const x = Math.round(centerX + facing * 14);
      const y = Math.round(centerY - 3);
      ctx.fillStyle = "#24435f";
      this.pixelRect(ctx, x, y - 7, facing * 34, 14);
      ctx.fillStyle = "#5ad7ff";
      this.pixelRect(ctx, x + facing * 28, y - 4, facing * 18, 8);
      ctx.fillStyle = heat > 0.6 ? "#ff6f91" : "#d6f2ff";
      this.pixelRect(ctx, x + facing * 8, y - 10, facing * 12, 4);
      if (runtime.charging || active > 0) {
        ctx.fillStyle = "rgba(90, 215, 255, 0.55)";
        this.pixelRect(ctx, x + facing * 48, y - 8, facing * Math.round(22 + runtime.charge), 16);
      }
    } else if (weaponId === "revolver") {
      const x = Math.round(centerX + facing * 16);
      const y = Math.round(centerY - 2);
      ctx.fillStyle = "#ffd0a6";
      this.pixelRect(ctx, x, y - 5, facing * 28, 10);
      ctx.fillStyle = "#8a6f55";
      this.pixelRect(ctx, x + facing * 7, y - 10, facing * 12, 20);
      ctx.fillStyle = "#d6f2ff";
      this.pixelRect(ctx, x + facing * 29, y - 3, facing * 12, 6);
      if (active > 0) {
        ctx.fillStyle = "#fff4a8";
        this.pixelRect(ctx, x + facing * 42, y - 7, facing * 18, 14);
      }
    } else if (weaponId === "minigun") {
      const runtime = this.combat.getWeaponRuntimeState("minigun");
      const x = Math.round(centerX + facing * 10);
      const y = Math.round(centerY + 1);
      ctx.fillStyle = "#56606f";
      this.pixelRect(ctx, x, y - 11, facing * 34, 6);
      this.pixelRect(ctx, x, y - 2, facing * 38, 6);
      this.pixelRect(ctx, x, y + 7, facing * 34, 6);
      ctx.fillStyle = "#ffcf5a";
      this.pixelRect(ctx, x - facing * 8, y - 8, facing * 16, 20);
      if (runtime.spin > 0.25 || active > 0) {
        ctx.fillStyle = runtime.heat > 0.75 ? "#ff6f91" : "#fff4a8";
        for (let index = 0; index < 3; index += 1) {
          this.pixelRect(ctx, x + facing * (42 + index * 7), y - 9 + index * 7, facing * Math.round(8 + runtime.spin * 12), 4);
        }
      }
    } else if (weaponId === "sniper") {
      const runtime = this.combat.getWeaponRuntimeState("sniper");
      const x = Math.round(centerX + facing * 6);
      const y = Math.round(centerY - 6);
      ctx.fillStyle = "#d6f2ff";
      this.pixelRect(ctx, x, y - 3, facing * 68, 6);
      ctx.fillStyle = "#516172";
      this.pixelRect(ctx, x + facing * 20, y - 14, facing * 18, 8);
      this.pixelRect(ctx, x - facing * 10, y + 2, facing * 20, 11);
      ctx.fillStyle = runtime.steady > 0.9 ? "#7cff6b" : "#ffffff";
      this.pixelRect(ctx, x + facing * 64, y - 5, facing * 14, 10);
      if (active > 0) {
        ctx.fillStyle = "rgba(214, 242, 255, 0.7)";
        this.pixelRect(ctx, x + facing * 80, y - 4, facing * 34, 8);
      }
    } else if (weaponId === "knife") {
      const activeReach = active > 0 ? 30 : 8;
      const x = Math.round(centerX + facing * (18 + activeReach));
      const y = Math.round(centerY - 1 + aim.y * 10);
      ctx.fillStyle = "#2b3542";
      this.pixelRect(ctx, x - facing * 12, y + 3, facing * 14, 6);
      ctx.fillStyle = "#d8f0ff";
      this.pixelRect(ctx, x, y - 4, facing * 26, 8);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, x + facing * 18, y - 2, facing * 9, 4);
      if (active > 0) {
        ctx.fillStyle = "rgba(216, 240, 255, 0.5)";
        this.pixelRect(ctx, x + facing * 18, y - 12, facing * 34, 24);
      }
    } else if (weaponId === "machete") {
      const runtime = this.combat.getWeaponRuntimeState("machete", state.id);
      const chop = this.attackVisual?.weaponId === "machete" && this.attackVisual.kind === "secondary";
      const visualGrowth = Math.min(runtime.rangeBonus, 360);
      const reach = active > 0 ? (chop ? 46 : 34) + visualGrowth : 10 + Math.min(visualGrowth, 90);
      const x = Math.round(centerX + facing * (16 + reach));
      const y = Math.round(centerY + (chop ? -18 : -2) + aim.y * 12);
      ctx.fillStyle = "#344136";
      this.pixelRect(ctx, x - facing * 18, y + 6, facing * 20, 8);
      ctx.fillStyle = machetePowerColor(runtime.redness);
      const bladeLength = 42 + visualGrowth;
      this.pixelRect(ctx, x, y - 7, facing * bladeLength, 14);
      this.pixelRect(ctx, x + facing * (bladeLength - 12), y - 13, facing * 14, 20);
      ctx.fillStyle = "#f0fff7";
      this.pixelRect(ctx, x + facing * Math.max(24, bladeLength - 7), y - 4, facing * 12, 6);
      if (active > 0) {
        ctx.fillStyle = runtime.redness > 0.35
          ? `rgba(255, ${Math.round(90 + (1 - runtime.redness) * 110)}, 110, ${chop ? 0.52 : 0.38})`
          : chop ? "rgba(158, 231, 195, 0.5)" : "rgba(158, 231, 195, 0.34)";
        this.pixelRect(ctx, x + facing * 24, y - (chop ? 22 : 16), facing * (chop ? 58 + visualGrowth : 44 + visualGrowth), chop ? 44 : 30);
      }
    } else if (weaponId === "axe") {
      const reach = active > 0 ? 42 : 14;
      const x = Math.round(centerX + facing * (16 + reach));
      const y = Math.round(centerY - 4 + aim.y * 13);
      ctx.fillStyle = "#5d3f29";
      this.pixelRect(ctx, x - facing * 30, y + 3, facing * 42, 8);
      ctx.fillStyle = "#ffb35c";
      this.pixelRect(ctx, x, y - 15, facing * 18, 30);
      this.pixelRect(ctx, x + facing * 12, y - 9, facing * 16, 18);
      ctx.fillStyle = "#fff0c2";
      this.pixelRect(ctx, x + facing * 21, y - 6, facing * 10, 12);
      if (active > 0) {
        ctx.fillStyle = "rgba(255, 179, 92, 0.46)";
        this.pixelRect(ctx, x + facing * 14, y - 24, facing * 54, 48);
      }
    } else if (weaponId === "virgin-blood") {
      const x = Math.round(centerX + facing * 22);
      const y = Math.round(centerY - 10 + Math.sin(performance.now() * 0.006) * 3);
      ctx.fillStyle = "rgba(255, 244, 168, 0.32)";
      this.pixelRect(ctx, x - 14, y - 14, 28, 28);
      ctx.fillStyle = "#fff4a8";
      this.pixelRect(ctx, x - 6, y - 13, 12, 5);
      this.pixelRect(ctx, x - 8, y - 8, 16, 21);
      ctx.fillStyle = "#e33d54";
      this.pixelRect(ctx, x - 5, y - 4, 10, 12);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, x - 3, y - 6, 4, 4);
    } else if (weaponId === "death-aura") {
      const runtime = this.combat.getWeaponRuntimeState("death-aura", state.id);
      const pulse = Math.round(22 + Math.sin(performance.now() * 0.012) * 5);
      ctx.fillStyle = runtime.deathAuraActive ? "rgba(8, 8, 12, 0.52)" : "rgba(35, 24, 43, 0.32)";
      this.pixelRect(ctx, Math.round(centerX - pulse), Math.round(centerY - pulse), pulse * 2, pulse * 2);
      ctx.fillStyle = "#08080c";
      this.pixelRect(ctx, Math.round(centerX + facing * 18), Math.round(centerY - 10), facing * 18, 20);
    } else if (weaponId === "rocket") {
      const x = Math.round(centerX + facing * 17);
      const y = Math.round(centerY - 5);
      ctx.fillStyle = "#56606f";
      this.pixelRect(ctx, x, y - 7, facing * 34, 14);
      ctx.fillStyle = "#ff8f3d";
      this.pixelRect(ctx, x + facing * 25, y - 9, facing * 13, 18);
      ctx.fillStyle = "#fff4a8";
      this.pixelRect(ctx, x + facing * 36, y - 4, facing * 9, 8);
    } else if (weaponId === "hands") {
      const x = Math.round(centerX + facing * 20);
      const y = Math.round(centerY - 2);
      this.drawMiniHand(ctx, x, y, facing, performance.now() * 0.012, "lunge");
    } else if (weaponId === "wings") {
      const mode = state.wingFlapping ? "flap" : state.wingDiving ? "dive" : state.grounded ? "idle" : "glide";
      this.drawWings(ctx, state, this.localPlayer.color, mode);
    } else if (weaponId === "sledgehammer") {
      const charge = Math.min((this.primaryHeldMs || 0) / 900, 1);
      const lift = active > 0 || charge > 0.2 ? -34 - charge * 18 : -8;
      const x = Math.round(centerX + facing * 17);
      const y = Math.round(centerY + lift);
      ctx.fillStyle = "#b8bfd7";
      this.pixelRect(ctx, x, y, facing * 46, 7);
      ctx.fillStyle = "#ff8f3d";
      this.pixelRect(ctx, x + facing * 35, y - 16, facing * 24, 26);
      this.pixelRect(ctx, x + facing * 31, y - 10, facing * 32, 8);
      if (active > 0) {
        ctx.fillStyle = "rgba(255, 143, 61, 0.6)";
        for (let index = 0; index < 6; index += 1) {
          ctx.fillRect(Math.round(centerX + facing * (20 + index * 13)), Math.round(centerY + 22 + index * 2), 10, 6);
        }
      }
    }
    ctx.restore();
  }

  private drawMouseAimedHeldWeapon(
    ctx: CanvasRenderingContext2D,
    weaponId: WeaponId,
    state: PlayerPhysicsState,
    centerX: number,
    centerY: number,
    aim: { x: number; y: number },
    active: number,
    heldMs: number,
    remote = false,
  ): boolean {
    if (
      weaponId !== "knife"
      && weaponId !== "machete"
      && weaponId !== "axe"
      && weaponId !== "sledgehammer"
      && weaponId !== "rocket"
      && weaponId !== "holy-bazooka"
      && weaponId !== "grappling-hook"
      && weaponId !== "chainsaw"
      && weaponId !== "lightning-rod"
      && weaponId !== "slingshot"
      && weaponId !== "whip"
    ) {
      return false;
    }

    const runtime = remote ? undefined : this.combat.getWeaponRuntimeState(weaponId, state.id);
    if (weaponId === "axe" && runtime?.axeThrown) {
      return true;
    }

    const directionX = Math.abs(aim.x) + Math.abs(aim.y) > 0.01 ? aim.x : state.facing;
    const angle = Math.atan2(aim.y, directionX);
    const color = colorForWeapon(weaponId);
    const pulse = performance.now() * 0.012;
    ctx.save();
    ctx.translate(Math.round(centerX), Math.round(centerY));
    ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = color;

    if (weaponId === "knife") {
      const reach = active > 0 ? 13 : 0;
      ctx.fillStyle = "#2b3542";
      this.pixelRect(ctx, 2 + reach, 3, 16, 6);
      ctx.fillStyle = "#d8f0ff";
      this.pixelRect(ctx, 15 + reach, -4, 33, 8);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, 40 + reach, -2, 9, 4);
      if (active > 0) {
        ctx.fillStyle = "rgba(216, 240, 255, 0.48)";
        this.pixelRect(ctx, 28, -15, 44, 30);
      }
    } else if (weaponId === "machete") {
      const machete = remote ? undefined : this.combat.getMacheteState(state.id);
      const growth = Math.min(machete?.rangeBonus ?? 0, 360);
      const blade = 46 + growth;
      ctx.fillStyle = "#344136";
      this.pixelRect(ctx, 0, 5, 22, 8);
      ctx.fillStyle = machete ? machetePowerColor(machete.redness) : color;
      this.pixelRect(ctx, 18, -7, blade, 14);
      this.pixelRect(ctx, 18 + blade - 13, -13, 14, 21);
      ctx.fillStyle = "#f0fff7";
      this.pixelRect(ctx, 18 + Math.max(25, blade - 8), -4, 12, 6);
      if (active > 0) {
        ctx.fillStyle = "rgba(158, 231, 195, 0.34)";
        this.pixelRect(ctx, 28, -18, 54 + growth, 36);
      }
    } else if (weaponId === "axe") {
      const swing = active > 0 ? 10 : 0;
      ctx.fillStyle = "#5d3f29";
      this.pixelRect(ctx, 0 + swing, 3, 50, 8);
      ctx.fillStyle = "#ffb35c";
      this.pixelRect(ctx, 41 + swing, -16, 18, 32);
      this.pixelRect(ctx, 54 + swing, -10, 17, 20);
      ctx.fillStyle = "#fff0c2";
      this.pixelRect(ctx, 65 + swing, -6, 8, 12);
      if (active > 0) {
        ctx.fillStyle = "rgba(255, 179, 92, 0.42)";
        this.pixelRect(ctx, 35, -25, 62, 50);
      }
    } else if (weaponId === "sledgehammer") {
      const charge = Math.min(heldMs / 900, 1);
      ctx.fillStyle = "#b8bfd7";
      this.pixelRect(ctx, -4, -4, 55, 8);
      ctx.fillStyle = "#ff8f3d";
      this.pixelRect(ctx, 42, -17 - Math.round(charge * 5), 25, 30 + Math.round(charge * 10));
      this.pixelRect(ctx, 36, -9, 36, 10);
      if (active > 0 || charge > 0.2) {
        ctx.fillStyle = "rgba(255, 143, 61, 0.5)";
        this.pixelRect(ctx, 35, -24, 48 + Math.round(charge * 32), 48);
      }
    } else if (weaponId === "rocket") {
      ctx.fillStyle = "#56606f";
      this.pixelRect(ctx, 2, -8, 43, 16);
      ctx.fillStyle = "#ff8f3d";
      this.pixelRect(ctx, 33, -10, 15, 20);
      ctx.fillStyle = "#fff4a8";
      this.pixelRect(ctx, 46, -5, 11, 10);
      if (active > 0) {
        ctx.fillStyle = "rgba(255, 143, 61, 0.55)";
        this.pixelRect(ctx, -24, -6, 24, 12);
      }
    } else if (weaponId === "holy-bazooka") {
      const glow = active > 0 ? 1 : Math.min(1, heldMs / 900);
      ctx.fillStyle = "#465063";
      this.pixelRect(ctx, -2, -10, 58, 20);
      ctx.fillStyle = "#fff4a8";
      this.pixelRect(ctx, 42, -13, 21, 26);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, 61, -6, 13, 12);
      ctx.fillStyle = "#2b3542";
      this.pixelRect(ctx, 10, 9, 13, 16);
      this.pixelRect(ctx, 28, 8, 8, 14);
      ctx.fillStyle = "#5ad7ff";
      this.pixelRect(ctx, 2, -6, 8, 12);
      if (active > 0 || glow > 0.1) {
        ctx.fillStyle = "rgba(255, 244, 168, 0.58)";
        this.pixelRect(ctx, -34, -8, 30 + Math.round(glow * 18), 16);
        ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
        this.pixelRect(ctx, 68, -15, 26 + Math.round(glow * 10), 30);
      }
    } else if (weaponId === "grappling-hook") {
      const runtime = remote ? undefined : this.combat.getWeaponRuntimeState(weaponId, state.id);
      ctx.fillStyle = "#2b3542";
      this.pixelRect(ctx, 0, -5, 34, 10);
      ctx.fillStyle = color;
      this.pixelRect(ctx, 26, -8, 18, 16);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, 40, -3, 14, 6);
      ctx.strokeStyle = runtime?.grappleActive ? "#5ad7ff" : "rgba(216, 242, 255, 0.88)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.quadraticCurveTo(28, -16, 46, -2);
      ctx.stroke();
      if (runtime?.grappleAttached) {
        ctx.fillStyle = "rgba(90, 215, 255, 0.35)";
        this.pixelRect(ctx, 2, -16, 54, 32);
      }
    } else if (weaponId === "chainsaw") {
      const runtime = remote ? undefined : this.combat.getWeaponRuntimeState(weaponId, state.id);
      const rev = runtime?.chainsawRev ?? 0;
      const heat = runtime?.chainsawHeat ?? 0;
      const running = runtime?.chainsawMode === "running";
      const shake = running ? Math.round(Math.sin(performance.now() * 0.07) * 3) : 0;
      ctx.fillStyle = "#2b3542";
      this.pixelRect(ctx, -2, 4, 28, 8);
      ctx.fillStyle = heat > 0.82 ? "#ff6f91" : "#b8bfd7";
      this.pixelRect(ctx, 18 + shake, -9, 48, 18);
      ctx.fillStyle = "#56606f";
      this.pixelRect(ctx, 22 + shake, -5, 38, 10);
      ctx.fillStyle = running ? "#fff4a8" : "#d6f2ff";
      for (let index = 0; index < 6; index += 1) {
        this.pixelRect(ctx, 24 + index * 6 + shake, -11 + (index % 2) * 18, 4, 5);
      }
      if (running || rev > 0) {
        ctx.fillStyle = running ? "rgba(255, 244, 168, 0.45)" : "rgba(184, 191, 215, 0.34)";
        this.pixelRect(ctx, 58 + shake, -14, Math.round(18 + rev * 20), 28);
      }
    } else if (weaponId === "lightning-rod") {
      ctx.fillStyle = "#ffd84d";
      this.pixelRect(ctx, 0, -4, 58, 8);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, 49, -13, 8, 26);
      ctx.fillStyle = "rgba(255, 216, 77, 0.58)";
      this.pixelRect(ctx, 58, -7, 16 + Math.round(Math.sin(pulse) * 4), 14);
    } else if (weaponId === "slingshot") {
      const charge = Math.min(heldMs / 850, 1);
      ctx.fillStyle = "#8b5a2b";
      this.pixelRect(ctx, 8, -16, 7, 32);
      this.pixelRect(ctx, 12, -17, 22, 6);
      this.pixelRect(ctx, 12, 11, 22, 6);
      ctx.strokeStyle = "#7cff6b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(32, -13);
      ctx.lineTo(-10 - charge * 24, 0);
      ctx.lineTo(32, 13);
      ctx.stroke();
      ctx.fillStyle = "#7cff6b";
      this.pixelRect(ctx, -15 - Math.round(charge * 24), -4, 8, 8);
    } else if (weaponId === "whip") {
      const reach = active > 0 ? 286 : 86;
      const segments = active > 0 ? 12 : 5;
      for (let index = 1; index <= segments; index += 1) {
        const t = index / segments;
        const curve = Math.sin(t * Math.PI) * 34;
        const size = index === segments ? 10 : Math.max(3, 8 - index * 0.35);
        ctx.fillRect(Math.round(reach * t - size / 2), Math.round(curve * t - size / 2), Math.round(size), Math.round(size));
      }
      if (active > 0) {
        ctx.fillStyle = "#ffffff";
        this.pixelRect(ctx, reach - 5, -5, 10, 10);
      }
    }

    ctx.restore();
    if (weaponId === "lightning-rod" && heldMs > 0 && aim.y < -0.55) {
      this.drawLightningChargeVisual(ctx, state, aim, heldMs);
    }
    return true;
  }

  private drawMiniHand(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: number,
    phase: number,
    pose: "crawl" | "lunge" | "attached" | "flicked",
  ): void {
    const crawlLift = pose === "crawl" ? Math.sin(phase) : pose === "lunge" ? -3 : pose === "attached" ? 2 : 5;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(facing >= 0 ? 1 : -1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#b8ffd0";
    this.pixelRect(ctx, -7, -4 + Math.round(crawlLift * 0.25), 15, 11);
    this.pixelRect(ctx, -12, -2, 6, 7);
    ctx.fillStyle = "#d9ffe4";
    this.pixelRect(ctx, -4, -2, 6, 5);
    ctx.fillStyle = "#b8ffd0";
    for (let index = 0; index < 5; index += 1) {
      const baseX = -7 + index * 4;
      const walk = pose === "crawl" ? Math.round(Math.sin(phase + index * 1.3) * 3) : 0;
      const lunge = pose === "lunge" ? -3 - (index % 2) : 0;
      const attached = pose === "attached" ? 4 + (index % 2) : 0;
      const fingerY = -13 + walk + lunge + attached;
      const length = 7 + (index === 2 ? 3 : index === 0 || index === 4 ? -1 : 1);
      this.pixelRect(ctx, baseX, fingerY, 3, length);
      this.pixelRect(ctx, baseX - 1, fingerY - 2, 5, 3);
    }
    ctx.fillStyle = "#7cff6b";
    this.pixelRect(ctx, 4, 1, 3, 3);
    ctx.fillStyle = "#344136";
    this.pixelRect(ctx, -2, 5, 5, 2);
    if (pose === "flicked") {
      ctx.fillStyle = "rgba(255, 111, 145, 0.72)";
      this.pixelRect(ctx, -12, -12, 25, 4);
    }
    ctx.restore();
  }

  private drawRemoteStatusVisuals(ctx: CanvasRenderingContext2D, remote: RemotePlayer): void {
    const state = remote.player.state;
    const statuses = remote.current.statuses ?? [];
    const x = Math.round(state.x - this.camera.x);
    const y = Math.round(state.y - this.camera.y);
    const aim = this.netAim(remote.current, state.facing);
    ctx.save();
    if (remote.current.deathAuraActive) {
      this.drawDeathAuraField(ctx, state, remote.current.deathAuraPower ?? 0.25);
    }
    if (remote.current.chargeWeaponId === "lightning-rod") {
      this.drawLightningChargeVisual(ctx, state, aim, remote.current.chargeHeldMs ?? 0);
    } else if (remote.current.chargeWeaponId === "laser-blaster") {
      this.drawLaserChargeVisual(ctx, state, aim, remote.current.chargeHeldMs ?? 0);
    }
    if (statuses.some((status) => status === "empowered" || status === "holyBuff" || status === "blessed" || status === "angelWings")) {
      ctx.strokeStyle = statuses.includes("holyBuff") || statuses.includes("blessed") ? "#fff4a8" : "#7cff6b";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 4, state.width + 6, state.height + 8);
    }
    if (statuses.includes("deathFrozen")) {
      ctx.fillStyle = "rgba(157, 225, 255, 0.24)";
      ctx.fillRect(x - 6, y - 7, state.width + 12, state.height + 14);
      ctx.strokeStyle = "#9de1ff";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 6, y - 7, state.width + 12, state.height + 14);
      ctx.fillStyle = "#d6f2ff";
      ctx.fillRect(x + 2, y - 4, 8, 4);
      ctx.fillRect(x + state.width - 10, y + state.height + 1, 7, 4);
    }
    if (statuses.includes("poison")) {
      ctx.fillStyle = "rgba(22, 79, 36, 0.34)";
      ctx.fillRect(x - 5, y - 6, state.width + 10, state.height + 12);
      ctx.fillStyle = "#7cff6b";
      ctx.fillRect(x + 4, y - 10, 5, 5);
      ctx.fillRect(x + state.width - 7, y + 8, 4, 4);
    }
    if (statuses.includes("scrambled")) {
      ctx.fillStyle = "#b8ffd0";
      ctx.fillRect(x + 7, y + 1, 18, 5);
    }
    if (statuses.includes("handsMissing")) {
      ctx.fillStyle = "#ff6f91";
      ctx.fillRect(x - 4, y + 19, 5, 16);
      ctx.fillRect(x + state.width - 1, y + 19, 5, 16);
    }
    if (remote.current.rocketActive) {
      this.drawRemoteRocketState(ctx, state, remote.current.rocketLit ?? false);
    }
    ctx.restore();
  }

  private drawRemoteWeapon(ctx: CanvasRenderingContext2D, remote: RemotePlayer): void {
    const weaponId = remote.current.weaponId;
    if (!weaponId || weaponId === "wings" || weaponId === "super-legs") {
      return;
    }
    const state = remote.player.state;
    const aim = this.netAim(remote.current, state.facing);
    const centerX = state.x + state.width / 2 - this.camera.x;
    const centerY = state.y + 24 - this.camera.y;
    const facing = Math.sign(aim.x || state.facing) || 1;
    const color = colorForWeapon(weaponId);
    const x = Math.round(centerX + facing * 18);
    const y = Math.round(centerY + aim.y * 8);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = color;

    if (this.drawMouseAimedHeldWeapon(ctx, weaponId, state, centerX, centerY, aim, 0, remote.current.chargeHeldMs ?? 0, true)) {
      ctx.restore();
      return;
    }

    if (weaponId === "death-aura") {
      ctx.fillStyle = remote.current.deathAuraActive ? "rgba(8, 8, 12, 0.72)" : "rgba(35, 24, 43, 0.5)";
      this.pixelRect(ctx, x - facing * 8, y - 12, facing * 22, 24);
      ctx.fillStyle = "#08080c";
      this.pixelRect(ctx, x + facing * 12, y - 7, facing * 12, 14);
    } else if (weaponId === "virgin-blood") {
      ctx.fillStyle = "#fff4a8";
      this.pixelRect(ctx, x - 6, y - 13, 12, 5);
      this.pixelRect(ctx, x - 8, y - 8, 16, 21);
      ctx.fillStyle = "#e33d54";
      this.pixelRect(ctx, x - 5, y - 4, 10, 12);
    } else if (weaponId === "rocket") {
      ctx.fillStyle = "#56606f";
      this.pixelRect(ctx, x, y - 7, facing * 34, 14);
      ctx.fillStyle = "#ff8f3d";
      this.pixelRect(ctx, x + facing * 25, y - 9, facing * 13, 18);
      ctx.fillStyle = "#fff4a8";
      this.pixelRect(ctx, x + facing * 36, y - 4, facing * 9, 8);
    } else if (weaponId === "hands") {
      this.drawMiniHand(ctx, x, y, facing, performance.now() * 0.012, "crawl");
    } else if (weaponId === "lightning-rod" || weaponId === "sniper" || weaponId === "minigun" || weaponId === "laser-blaster") {
      this.pixelRect(ctx, x - facing * 8, y - 4, facing * 46, 8);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, x + facing * 34, y - 8, facing * 8, 16);
    } else if (weaponId === "machete" || weaponId === "axe" || weaponId === "knife" || weaponId === "sledgehammer") {
      this.pixelRect(ctx, x - facing * 18, y + 4, facing * 24, 7);
      ctx.fillStyle = weaponId === "sledgehammer" ? "#ff8f3d" : color;
      this.pixelRect(ctx, x + facing * 4, y - 12, facing * (weaponId === "sledgehammer" ? 24 : 32), 20);
    } else {
      this.pixelRect(ctx, x - facing * 4, y - 5, facing * 30, 10);
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, x + facing * 24, y - 3, facing * 8, 6);
    }
    ctx.restore();
  }

  private drawDeathAuraField(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, power: number): void {
    const radius = Math.round(84 + (300 - 84) * Math.min(Math.max(power, 0), 1));
    const cx = Math.round(state.x + state.width / 2 - this.camera.x);
    const cy = Math.round(state.y + state.height / 2 - this.camera.y);
    ctx.save();
    ctx.globalAlpha = 0.2 + power * 0.28;
    ctx.strokeStyle = deathAuraColor(power);
    ctx.fillStyle = deathAuraColor(power);
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - radius, cy - Math.round(radius * 0.56), radius * 2, Math.round(radius * 1.12));
    for (let index = 0; index < 10; index += 1) {
      const angle = performance.now() * 0.0018 + index * 0.65;
      const px = cx + Math.cos(angle) * radius * (0.32 + (index % 4) * 0.14);
      const py = cy + Math.sin(angle) * radius * 0.48;
      ctx.fillRect(Math.round(px), Math.round(py), 5 + (index % 3), 5 + (index % 2));
    }
    ctx.restore();
  }

  private drawLightningChargeVisual(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, aim: { x: number; y: number }, heldMs: number): void {
    if (aim.y > -0.45) {
      return;
    }
    const progress = Math.min(Math.max(heldMs / 4200, 0.05), 1);
    const color = lightningChargeColorForMs(heldMs);
    const baseX = Math.round(state.x + state.width / 2 + aim.x * 18 - this.camera.x);
    const baseY = Math.round(state.y + 15 - this.camera.y);
    const reach = Math.round(160 + progress * 430);
    const topX = Math.round(baseX + aim.x * 80);
    const topY = baseY - reach;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3 + progress * 3;
    ctx.globalAlpha = 0.66 + progress * 0.28;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    const segments = 7;
    for (let index = 1; index < segments; index += 1) {
      const t = index / segments;
      const jitter = (index % 2 === 0 ? -1 : 1) * (8 + progress * 22 + (index % 3) * 4);
      ctx.lineTo(Math.round(topX + (baseX - topX) * t + jitter), Math.round(topY + (baseY - topY) * t));
    }
    ctx.lineTo(baseX, baseY);
    ctx.stroke();
    for (let index = 0; index < 5; index += 1) {
      const offset = Math.sin(performance.now() * 0.018 + index) * (10 + progress * 16);
      ctx.fillRect(Math.round(baseX - 22 + index * 11 + offset), Math.round(baseY - 36 - index * 7), 4 + Math.round(progress * 3), 10);
    }
    ctx.restore();
  }

  private drawLaserChargeVisual(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, aim: { x: number; y: number }, heldMs: number): void {
    const facing = Math.sign(aim.x || state.facing) || 1;
    const progress = Math.min(Math.max(heldMs / 1100, 0.12), 1);
    const centerX = Math.round(state.x + state.width / 2 - this.camera.x);
    const centerY = Math.round(state.y + 23 + aim.y * 10 - this.camera.y);
    ctx.save();
    ctx.globalAlpha = 0.44 + progress * 0.24;
    ctx.fillStyle = progress > 0.85 ? "#ff6f91" : "#5ad7ff";
    this.pixelRect(ctx, centerX + facing * 26, centerY - 9, facing * Math.round(24 + progress * 34), 18);
    ctx.fillStyle = "#d6f2ff";
    this.pixelRect(ctx, centerX + facing * 42, centerY - 4, facing * Math.round(12 + progress * 20), 8);
    ctx.restore();
  }

  private drawRemoteRocketState(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, lit: boolean): void {
    const facing = state.facing;
    const x = Math.round(state.x + state.width / 2 + facing * 42 - this.camera.x);
    const y = Math.round(DEFAULT_PHYSICS.groundY - 12 - this.camera.y);
    ctx.save();
    ctx.fillStyle = "#56606f";
    this.pixelRect(ctx, x, y - 6, facing * 28, 12);
    ctx.fillStyle = lit ? "#ff8f3d" : "#8a6f55";
    this.pixelRect(ctx, x + facing * 20, y - 8, facing * 10, 16);
    if (lit) {
      ctx.fillStyle = "rgba(255, 143, 61, 0.6)";
      this.pixelRect(ctx, x - facing * 24, y - 5, facing * 18, 10);
    }
    ctx.restore();
  }

  private drawWings(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, color: string, mode: "idle" | "glide" | "flap" | "dive"): void {
    const cx = Math.round(state.x + state.width / 2 - this.camera.x);
    const cy = Math.round(state.y + 22 - this.camera.y);
    const flap = mode === "flap" ? Math.sin(performance.now() * 0.04) : 0;
    const span = mode === "glide" ? 50 : mode === "dive" ? 28 : 38 + Math.round(Math.abs(flap) * 10);
    const lift = mode === "flap" ? -12 - Math.round(Math.abs(flap) * 10) : mode === "dive" ? 10 : -4;
    ctx.save();
    ctx.globalAlpha = mode === "idle" ? 0.72 : 0.9;
    ctx.fillStyle = colorForWeapon("wings");
    this.pixelRect(ctx, cx - span, cy + lift, span - 8, 8);
    this.pixelRect(ctx, cx + 8, cy + lift, span - 8, 8);
    this.pixelRect(ctx, cx - span + 8, cy + lift + 8, span - 18, 7);
    this.pixelRect(ctx, cx + 18, cy + lift + 8, span - 18, 7);
    ctx.fillStyle = color;
    this.pixelRect(ctx, cx - 10, cy + lift + 3, 8, 8);
    this.pixelRect(ctx, cx + 2, cy + lift + 3, 8, 8);
    ctx.fillStyle = "#ffffff";
    this.pixelRect(ctx, cx - span + 6, cy + lift + 2, 10, 4);
    this.pixelRect(ctx, cx + span - 16, cy + lift + 2, 10, 4);
    if (mode === "flap") {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = "#d9f7ff";
      this.pixelRect(ctx, cx - 64, cy + 18, 128, 8);
      this.pixelRect(ctx, cx - 48, cy + 32, 96, 5);
    } else if (mode === "dive") {
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = "#d9f7ff";
      this.pixelRect(ctx, cx - 18, cy - 24, 8, 54);
      this.pixelRect(ctx, cx + 10, cy - 24, 8, 54);
    } else if (state.wingBurstTimer > 0) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#d9f7ff";
      this.pixelRect(ctx, cx - state.facing * 86, cy + 4, state.facing * 74, 10);
    }
    ctx.restore();
  }

  private drawSuperLegs(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState): void {
    const x = Math.round(state.x - this.camera.x);
    const y = Math.round(state.y - this.camera.y);
    const speed = Math.min(1, Math.abs(state.velocityX) / 650);
    const glow = 0.38 + Math.sin(performance.now() * 0.018) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(124, 255, 107, 0.26)";
    this.pixelRect(ctx, x - 1, y + 30, 14, 25);
    this.pixelRect(ctx, x + 19, y + 30, 14, 25);
    ctx.fillStyle = "#2b3542";
    this.pixelRect(ctx, x + 4, y + 31, 5, 18);
    this.pixelRect(ctx, x + 23, y + 31, 5, 18);
    ctx.fillStyle = "#7cff6b";
    this.pixelRect(ctx, x + 1, y + 33, 10, 19);
    this.pixelRect(ctx, x + 21, y + 33, 10, 19);
    this.pixelRect(ctx, x - 3, y + 47, 18, 8);
    this.pixelRect(ctx, x + 17, y + 47, 18, 8);
    ctx.fillStyle = "#ffffff";
    this.pixelRect(ctx, x + 3, y + 36, 6, 4);
    this.pixelRect(ctx, x + 23, y + 36, 6, 4);
    this.pixelRect(ctx, x + 1, y + 50, 10, 3);
    this.pixelRect(ctx, x + 21, y + 50, 10, 3);
    ctx.fillStyle = "#5ad7ff";
    this.pixelRect(ctx, x + 11, y + 39, 4, 8);
    this.pixelRect(ctx, x + 17, y + 39, 4, 8);
    if (speed > 0.15 || !state.grounded) {
      ctx.globalAlpha = Math.max(0.24, glow * (0.7 + speed));
      ctx.fillStyle = "#7cff6b";
      const direction = Math.sign(state.velocityX || state.facing || 1);
      this.pixelRect(ctx, x - direction * 24, y + 52, direction * 22, 5);
      this.pixelRect(ctx, x - direction * 40, y + 43, direction * 30, 4);
      this.pixelRect(ctx, x - direction * 54, y + 35, direction * 34, 3);
    }
    if (state.justSlamLanded || state.groundSlamming) {
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "#ffffff";
      this.pixelRect(ctx, x - 44, y + 54, 120, 7);
      this.pixelRect(ctx, x - 28, y + 63, 86, 5);
    }
    ctx.restore();
  }

  private drawCombatEntities(ctx: CanvasRenderingContext2D): void {
    const snapshot = this.combat.getSnapshot();
    for (const combatant of snapshot.combatants) {
      if (combatant.id !== this.localPlayer.state.id && !this.remotes.has(combatant.id)) {
        const zombie = snapshot.zombies.find((item) => item.id === combatant.id);
        if (zombie) {
          this.drawZombieCombatant(ctx, combatant, zombie);
        } else {
          this.drawCombatant(ctx, combatant);
        }
      }
    }
    for (const pickup of snapshot.ammoPickups) {
      this.drawAmmoPickup(ctx, pickup);
    }
    for (const dropped of snapshot.droppedWeapons) {
      this.drawDroppedWeapon(ctx, dropped);
    }
    for (const grapple of snapshot.grapples) {
      this.drawGrapple(ctx, grapple);
    }
    for (const projectile of snapshot.projectiles) {
      this.drawProjectile(ctx, projectile);
    }
    for (const hitbox of snapshot.hitboxes) {
      ctx.globalAlpha = Math.max(0.16, 1 - hitbox.age / hitbox.duration) * 0.35;
      ctx.fillStyle = hitbox.color;
      ctx.fillRect(Math.round(hitbox.x - this.camera.x), Math.round(hitbox.y - this.camera.y), Math.round(hitbox.width), Math.round(hitbox.height));
      ctx.globalAlpha = 1;
    }
    for (const effect of snapshot.effects) {
      this.drawEffect(ctx, effect);
    }
    for (const number of snapshot.damageNumbers) {
      const text = number.hitLocation ? `${number.label} ${number.amount}` : `${number.amount}`;
      ctx.font = number.hitLocation ? "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.82)";
      ctx.strokeText(text, Math.round(number.x - this.camera.x), Math.round(number.y - this.camera.y));
      ctx.fillStyle = number.color;
      ctx.fillText(text, Math.round(number.x - this.camera.x), Math.round(number.y - this.camera.y));
    }
  }

  private drawGrapple(ctx: CanvasRenderingContext2D, grapple: GrappleState): void {
    const color = colorForWeapon("grappling-hook");
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.lineWidth = grapple.state === "attached" ? 4 : 3;
    ctx.strokeStyle = grapple.state === "attached" ? "rgba(90, 215, 255, 0.92)" : "rgba(216, 242, 255, 0.72)";
    ctx.beginPath();
    const points = grapple.points.length >= 2 ? grapple.points : [{ x: grapple.x, y: grapple.y }];
    points.forEach((point, index) => {
      const x = Math.round(point.x - this.camera.x);
      const y = Math.round(point.y - this.camera.y);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    for (let index = 1; index < points.length - 1; index += 1) {
      if (index % 2 === 0) {
        const point = points[index];
        ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
        ctx.fillRect(Math.round(point.x - this.camera.x) - 2, Math.round(point.y - this.camera.y) - 2, 4, 4);
      }
    }
    const hookX = Math.round(grapple.x - this.camera.x);
    const hookY = Math.round(grapple.y - this.camera.y);
    ctx.fillStyle = color;
    ctx.fillRect(hookX - 6, hookY - 5, 12, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(hookX + (grapple.vx >= 0 ? 2 : -8), hookY - 2, 8, 4);
    if (grapple.state === "attached") {
      ctx.strokeStyle = "rgba(90, 215, 255, 0.38)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(hookX, hookY, 18, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAmmoPickup(ctx: CanvasRenderingContext2D, pickup: AmmoPickup): void {
    const x = Math.round(pickup.x - this.camera.x);
    const y = Math.round(pickup.y - this.camera.y);
    const pulse = 1 + Math.sin(performance.now() * 0.012 + pickup.age * 4) * 0.16;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "rgba(255, 244, 168, 0.3)";
    ctx.fillRect(x - Math.round(20 * pulse), y - Math.round(13 * pulse), Math.round(40 * pulse), Math.round(26 * pulse));
    ctx.fillStyle = "#fff4a8";
    ctx.fillRect(x - 12, y - 8, 24, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 7, y - 5, 14, 10);
    ctx.fillStyle = "#5ad7ff";
    ctx.fillRect(x - 3, y - 2, 6, 4);
    ctx.fillStyle = "#fff4a8";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("+1", x, y - 18);
    ctx.restore();
  }

  private drawCombatant(ctx: CanvasRenderingContext2D, combatant: Combatant): void {
    const x = Math.round(combatant.x - this.camera.x);
    const y = Math.round(combatant.y - this.camera.y);
    const flash = combatant.invulnerable > 0 && Math.floor(performance.now() / 80) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = combatant.respawnTimer > 0 ? 0.25 : 1;
    if (combatant.invulnerable > 0) {
      const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.18;
      ctx.strokeStyle = "rgba(91, 183, 255, 0.9)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - Math.round(7 * pulse), y - Math.round(8 * pulse), 32 + Math.round(14 * pulse), 48 + Math.round(15 * pulse));
      ctx.fillStyle = "rgba(91, 183, 255, 0.16)";
      ctx.fillRect(x - 8, y - 9, 48, 65);
    }
    if (combatant.statuses.some((status) => status.id === "empowered" || status.id === "holyBuff" || status.id === "blessed" || status.id === "angelWings")) {
      ctx.strokeStyle = "#7cff6b";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y - 2, 32, 48);
      ctx.fillStyle = "rgba(124, 255, 107, 0.34)";
      ctx.fillRect(x - 4, y + 4 + Math.round(Math.sin(performance.now() * 0.01) * 4), 4, 30);
      ctx.fillRect(x + 32, y + 8 + Math.round(Math.cos(performance.now() * 0.01) * 4), 4, 30);
    }
    if (combatant.statuses.some((status) => status.id === "deathFrozen")) {
      ctx.fillStyle = "rgba(157, 225, 255, 0.24)";
      ctx.fillRect(x - 6, y - 7, 44, 62);
      ctx.strokeStyle = "#9de1ff";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 5, y - 5, 42, 58);
      ctx.fillStyle = "#d6f2ff";
      ctx.fillRect(x + 2, y - 3, 8, 4);
      ctx.fillRect(x + 25, y + 50, 7, 4);
    }
    if (combatant.statuses.some((status) => status.id === "poison")) {
      ctx.fillStyle = "rgba(22, 79, 36, 0.34)";
      ctx.fillRect(x - 5, y - 6, 42, 60);
      ctx.fillStyle = "#7cff6b";
      ctx.fillRect(x + 4, y - 10, 5, 5);
      ctx.fillRect(x + 24, y + 8, 4, 4);
    }
    if (combatant.statuses.some((status) => status.id === "scrambled")) {
      ctx.fillStyle = "#b8ffd0";
      ctx.fillRect(x + 7, y + 1, 18, 5);
    }
    if (combatant.statuses.some((status) => status.id === "handsMissing")) {
      ctx.fillStyle = "#ff6f91";
      ctx.fillRect(x - 4, y + 19, 5, 16);
      ctx.fillRect(x + 31, y + 19, 5, 16);
    }
    ctx.fillStyle = flash ? "#ffffff" : combatant.color;
    ctx.fillRect(x + 8, y + 4, 16, 8);
    ctx.fillRect(x + 5, y + 12, 22, 26);
    ctx.fillRect(x + 1, y + 24, 8, 18);
    ctx.fillRect(x + 23, y + 24, 8, 18);
    this.drawHealthBar(ctx, x - 7, y - 12, 46, combatant.hp, combatant.maxHp);
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(combatant.name, x + 16, y - 16);
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile): void {
    const x = Math.round(projectile.x - this.camera.x);
    const y = Math.round(projectile.y - this.camera.y);
    if (projectile.weaponId === "teleport-ball") {
      const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.25;
      ctx.fillStyle = "rgba(176, 150, 255, 0.28)";
      ctx.fillRect(x - Math.round(18 * pulse), y - Math.round(18 * pulse), Math.round(36 * pulse), Math.round(36 * pulse));
      ctx.fillStyle = projectile.color;
      ctx.fillRect(x - 10, y - 10, 20, 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 4, y - 4, 8, 8);
      return;
    }
    if (projectile.weaponId === "rocket") {
      const facing = Math.sign(projectile.vx || projectile.ownerFacing || 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(projectile.state === "chaotic" ? Math.sin(projectile.age * 12) * 0.45 : 0);
      ctx.fillStyle = "#56606f";
      ctx.fillRect(-18, -7, 34, 14);
      ctx.fillStyle = "#ff8f3d";
      ctx.fillRect(facing > 0 ? 8 : -20, -9, 14, 18);
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(facing > 0 ? 18 : -28, -4, 10, 8);
      if (projectile.state === "lit" || projectile.state === "chaotic") {
        ctx.fillStyle = "rgba(255, 143, 61, 0.72)";
        ctx.fillRect(facing > 0 ? -35 : 21, -6, 22, 12);
        ctx.fillStyle = "rgba(43, 43, 50, 0.55)";
        ctx.fillRect(facing > 0 ? -50 : 34, -4, 18, 8);
      }
      ctx.restore();
      return;
    }
    if (projectile.weaponId === "holy-bazooka") {
      const angle = Math.atan2(projectile.vy, projectile.vx || 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(255, 244, 168, 0.36)";
      ctx.fillRect(-48, -11, 54, 22);
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(-16, -8, 31, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(8, -5, 15, 10);
      ctx.fillStyle = "#5ad7ff";
      ctx.fillRect(-10, -4, 8, 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
      ctx.fillRect(-56, -5, 38, 10);
      ctx.restore();
      return;
    }
    if (projectile.weaponId === "hands") {
      const facing = Math.sign(projectile.vx || projectile.ownerFacing || 1);
      const pose = projectile.hits.length > 0 ? "attached" : projectile.vy < -20 ? "lunge" : "crawl";
      this.drawMiniHand(ctx, x, y, facing, projectile.age * 18, pose);
      return;
    }
    if (projectile.id.startsWith("throw")) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(projectile.age * 8);
      if (projectile.weaponId === "knife") {
        ctx.fillStyle = "#d8f0ff";
        ctx.fillRect(-18, -3, 30, 6);
        ctx.fillStyle = "#2b3542";
        ctx.fillRect(9, -5, 10, 10);
      } else if (projectile.weaponId === "machete") {
        ctx.fillStyle = "#9ee7c3";
        ctx.fillRect(-24, -5, 42, 10);
        ctx.fillRect(8, -11, 14, 22);
        ctx.fillStyle = "#344136";
        ctx.fillRect(16, -4, 14, 8);
      } else if (projectile.weaponId === "axe") {
        ctx.fillStyle = "#5d3f29";
        ctx.fillRect(-18, -3, 30, 6);
        ctx.fillStyle = "#ffb35c";
        ctx.fillRect(8, -13, 14, 26);
        ctx.fillRect(17, -8, 13, 16);
        ctx.fillStyle = "#fff0c2";
        ctx.fillRect(25, -5, 7, 10);
      } else {
        ctx.fillStyle = projectile.color;
        ctx.fillRect(-12, -4, 24, 8);
        ctx.fillRect(3, -10, 8, 20);
      }
      ctx.restore();
      return;
    }
    if (projectile.weaponId === "slingshot") {
      ctx.fillStyle = "rgba(124, 255, 107, 0.45)";
      ctx.fillRect(Math.round(x - projectile.vx * 0.02), Math.round(y - projectile.vy * 0.02), 10, 4);
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 2, y - 2, 4, 4);
      return;
    }
    if (projectile.weaponId === "laser-blaster") {
      const width = Math.max(8, projectile.radius * 2);
      const length = Math.round(Math.max(36, Math.abs(projectile.vx) * 0.055 + projectile.radius * 5));
      ctx.fillStyle = projectile.radius > 11 ? "rgba(255, 111, 145, 0.38)" : "rgba(90, 215, 255, 0.35)";
      ctx.fillRect(Math.round(x - projectile.vx * 0.055), y - width / 2, length, width);
      ctx.fillStyle = projectile.radius > 11 ? "#ffd0a6" : "#d6f2ff";
      ctx.fillRect(x - Math.round(width * 0.7), y - Math.round(width * 0.35), Math.round(width * 1.4), Math.round(width * 0.7));
      ctx.fillStyle = "#5ad7ff";
      ctx.fillRect(x - 4, y - Math.round(width * 0.55), 8, Math.round(width * 1.1));
      return;
    }
    if (projectile.weaponId === "revolver") {
      ctx.fillStyle = "#ffd0a6";
      ctx.fillRect(Math.round(x - projectile.vx * 0.026), y - 2, 30, 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 4, y - 3, 8, 6);
      return;
    }
    if (projectile.weaponId === "minigun") {
      ctx.fillStyle = "#ffcf5a";
      ctx.fillRect(Math.round(x - projectile.vx * 0.018), y - 2, 22, 3);
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(x - 3, y - 3, 6, 6);
      return;
    }
    if (projectile.weaponId === "sniper") {
      ctx.fillStyle = "rgba(214, 242, 255, 0.58)";
      ctx.fillRect(Math.round(x - projectile.vx * 0.08), y - 1, 110, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 5, y - 4, 10, 8);
      return;
    }
    ctx.fillStyle = projectile.trailColor;
    ctx.fillRect(Math.round(x - projectile.vx * 0.018), Math.round(y - projectile.vy * 0.018), Math.max(12, projectile.radius * 4), 3);
    ctx.fillStyle = projectile.color;
    ctx.fillRect(x - projectile.radius, y - projectile.radius, projectile.radius * 2, projectile.radius * 2);
  }

  private drawDroppedWeapon(ctx: CanvasRenderingContext2D, dropped: DroppedWeapon): void {
    const x = Math.round(dropped.x - this.camera.x);
    const y = Math.round(dropped.y - this.camera.y);
    ctx.fillStyle = dropped.pickupable ? colorForWeapon(dropped.weaponId) : "#ffffff";
    if (dropped.weaponId === "sledgehammer") {
      ctx.fillRect(x - 16, y - 3, 28, 6);
      ctx.fillRect(x + 8, y - 12, 14, 20);
    } else if (dropped.weaponId === "holy-bazooka") {
      ctx.fillStyle = "#465063";
      ctx.fillRect(x - 28, y - 8, 54, 16);
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(x + 15, y - 11, 18, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 30, y - 4, 10, 8);
      ctx.fillStyle = "#2b3542";
      ctx.fillRect(x - 8, y + 6, 12, 14);
    } else if (dropped.weaponId === "grappling-hook") {
      ctx.fillStyle = "#2b3542";
      ctx.fillRect(x - 16, y - 4, 28, 8);
      ctx.fillStyle = colorForWeapon("grappling-hook");
      ctx.fillRect(x + 8, y - 8, 14, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 18, y - 2, 9, 4);
    } else if (dropped.weaponId === "chainsaw") {
      ctx.fillStyle = "#2b3542";
      ctx.fillRect(x - 19, y + 1, 22, 7);
      ctx.fillStyle = colorForWeapon("chainsaw");
      ctx.fillRect(x - 1, y - 8, 38, 16);
      ctx.fillStyle = "#56606f";
      ctx.fillRect(x + 4, y - 4, 27, 8);
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(x + 31, y - 10, 4, 5);
      ctx.fillRect(x + 18, y + 6, 4, 5);
    } else if (dropped.weaponId === "whip") {
      for (let index = 0; index < 6; index += 1) {
        ctx.fillRect(x - 18 + index * 7, y + Math.sin(index) * 4, 6, 5);
      }
    } else if (dropped.weaponId === "lightning-rod") {
      ctx.fillRect(x - 18, y - 3, 36, 6);
      ctx.fillRect(x + 10, y - 10, 6, 16);
    } else if (dropped.weaponId === "teleport-ball") {
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 3, y - 3, 6, 6);
    } else if (dropped.weaponId === "slingshot") {
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(x - 4, y - 13, 6, 26);
      ctx.fillRect(x - 3, y - 13, 19, 5);
      ctx.fillRect(x - 3, y + 8, 19, 5);
      ctx.fillStyle = "#7cff6b";
      ctx.fillRect(x + 13, y - 9, 4, 18);
    } else if (dropped.weaponId === "laser-blaster") {
      ctx.fillRect(x - 16, y - 7, 32, 14);
      ctx.fillStyle = "#5ad7ff";
      ctx.fillRect(x + 12, y - 4, 16, 8);
      ctx.fillRect(x - 6, y - 11, 12, 4);
    } else if (dropped.weaponId === "revolver") {
      ctx.fillRect(x - 14, y - 5, 28, 10);
      ctx.fillRect(x - 5, y - 10, 12, 20);
      ctx.fillRect(x + 14, y - 3, 12, 6);
    } else if (dropped.weaponId === "minigun") {
      ctx.fillRect(x - 18, y - 9, 34, 5);
      ctx.fillRect(x - 18, y - 1, 38, 5);
      ctx.fillRect(x - 18, y + 7, 34, 5);
      ctx.fillStyle = "#ffcf5a";
      ctx.fillRect(x - 24, y - 8, 12, 18);
    } else if (dropped.weaponId === "sniper") {
      ctx.fillRect(x - 30, y - 4, 60, 7);
      ctx.fillRect(x - 6, y - 15, 18, 7);
      ctx.fillRect(x - 25, y + 2, 18, 9);
    } else if (dropped.weaponId === "knife") {
      ctx.fillStyle = "#d8f0ff";
      ctx.fillRect(x - 18, y - 3, 30, 6);
      ctx.fillStyle = "#2b3542";
      ctx.fillRect(x + 8, y - 5, 10, 10);
    } else if (dropped.weaponId === "machete") {
      ctx.fillStyle = "#9ee7c3";
      ctx.fillRect(x - 24, y - 5, 42, 10);
      ctx.fillRect(x + 8, y - 13, 15, 24);
      ctx.fillStyle = "#344136";
      ctx.fillRect(x + 16, y - 4, 14, 8);
    } else if (dropped.weaponId === "axe") {
      ctx.fillStyle = "#5d3f29";
      ctx.fillRect(x - 20, y - 3, 34, 6);
      ctx.fillStyle = "#ffb35c";
      ctx.fillRect(x + 8, y - 14, 16, 28);
      ctx.fillRect(x + 20, y - 8, 12, 16);
      ctx.fillStyle = "#fff0c2";
      ctx.fillRect(x + 28, y - 5, 6, 10);
    } else {
      ctx.fillRect(x - 12, y - 4, 24, 8);
      ctx.fillRect(x + 3, y + 3, 7, 9);
    }
    if (dropped.pickupable) {
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("F", x, y - 12);
    }
  }

  private drawZombieCombatant(ctx: CanvasRenderingContext2D, combatant: Combatant, zombie: ZombieState): void {
    const x = Math.round(combatant.x - this.camera.x);
    const y = Math.round(combatant.y - this.camera.y);
    const facing = combatant.velocityX < -4 ? -1 : combatant.velocityX > 4 ? 1 : zombie.wanderDirection;
    const lunge = zombie.biteAnim > 0 ? Math.round(7 * (zombie.biteAnim / 0.28)) : 0;
    const wobble = Math.round(Math.sin(zombie.age * 18) * 2);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = combatant.respawnTimer > 0 ? 0.25 : 1;
    ctx.fillStyle = "rgba(22, 79, 36, 0.28)";
    ctx.fillRect(x - 6, y - 8, combatant.width + 12, combatant.height + 14);
    ctx.fillStyle = combatant.invulnerable > 0 ? "#ffffff" : "#164f24";
    ctx.fillRect(x + 7 + facing * lunge, y + 5 + wobble, 17, 10);
    ctx.fillRect(x + 4 + facing * lunge, y + 15, 25, 25);
    ctx.fillStyle = "#7cff6b";
    ctx.fillRect(x + (facing > 0 ? 19 : 9) + facing * lunge, y + 8 + wobble, 4, 4);
    ctx.fillStyle = "#0b2612";
    ctx.fillRect(x + 8 + facing * lunge, y + 25, 6, 18);
    ctx.fillRect(x + 22 + facing * lunge, y + 24, 6, 19);
    ctx.fillStyle = "#2f7a3e";
    ctx.fillRect(x + (facing > 0 ? 27 : -4) + facing * lunge, y + 20, 9, 18);
    ctx.fillRect(x + (facing > 0 ? -4 : 27) + facing * lunge, y + 24, 8, 16);
    if (zombie.biteAnim > 0) {
      ctx.fillStyle = "#7cff6b";
      ctx.fillRect(x + (facing > 0 ? 30 : -8) + facing * lunge, y + 12, 12, 6);
      ctx.fillStyle = "rgba(124, 255, 107, 0.42)";
      ctx.fillRect(x + (facing > 0 ? 38 : -28) + facing * lunge, y + 10, 22, 10);
    }
    this.drawHealthBar(ctx, x - 7, y - 12, 46, combatant.hp, combatant.maxHp);
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#7cff6b";
    ctx.fillText("Zombie", x + 16, y - 16);
    ctx.restore();
  }

  private drawEffect(ctx: CanvasRenderingContext2D, effect: CombatEffect): void {
    const progress = effect.age / effect.duration;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    ctx.lineWidth = effect.kind === "laser" || effect.kind === "lightning" ? 4 : 2;
    const x = Math.round(effect.x - this.camera.x);
    const y = Math.round(effect.y - this.camera.y);
    const tx = Math.round(effect.tx - this.camera.x);
    const ty = Math.round(effect.ty - this.camera.y);
    if (effect.kind === "shockwave") {
      const targetRadius = Math.max(46, Math.hypot(tx - x, ty - y));
      const bigBoom = effect.label === "BOOM" || effect.label === "HOLY BOOM";
      const radius = bigBoom ? Math.round((effect.label === "HOLY BOOM" ? 28 : 18) + progress * targetRadius) : Math.round(14 + progress * 46);
      ctx.strokeRect(x - radius, y - (bigBoom ? Math.round(radius * 0.22) : 5), radius * 2, bigBoom ? Math.round(radius * 0.44) : 10);
    } else if (effect.kind === "explosion") {
      const holy = effect.label?.startsWith("HOLY") ?? false;
      const targetRadius = Math.max(42, Math.hypot(tx - x, ty - y));
      const radius = Math.round((effect.label === "FIREBALL" || effect.label === "HOLY FIREBALL" ? 22 : holy ? 46 : 34) + progress * targetRadius);
      const core = Math.max(10, Math.round(radius * (1 - progress * 0.55)));
      ctx.fillStyle = holy ? "#ffffff" : effect.label === "FIREBALL" ? "#fff4a8" : "#ff8f3d";
      ctx.fillRect(x - core, y - core, core * 2, core * 2);
      ctx.fillStyle = holy ? "rgba(255, 244, 168, 0.58)" : "rgba(255, 111, 80, 0.58)";
      ctx.fillRect(x - radius, y - Math.round(radius * 0.62), radius * 2, Math.round(radius * 1.24));
      ctx.fillStyle = holy ? "rgba(255, 255, 255, 0.72)" : "rgba(255, 207, 90, 0.72)";
      ctx.fillRect(x - Math.round(radius * 0.62), y - Math.round(radius * 0.42), Math.round(radius * 1.24), Math.round(radius * 0.84));
      ctx.fillStyle = holy ? "rgba(90, 215, 255, 0.28)" : "rgba(43, 43, 50, 0.42)";
      ctx.fillRect(x - Math.round(radius * 0.82), y - Math.round(radius * 0.78), Math.round(radius * 1.64), Math.round(radius * 0.38));
    } else if (effect.kind === "slam") {
      const radius = Math.round(18 + progress * 72);
      ctx.fillRect(x - radius, y + 16, radius * 2, 8);
      ctx.fillRect(x - radius / 2, y - 14, 10, 18);
      ctx.fillRect(x + radius / 2, y - 18, 10, 22);
    } else if (effect.kind === "muzzle") {
      ctx.fillStyle = "#fff4a8";
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.fillRect(tx - 5, ty - 5, 10, 10);
    } else if (effect.kind === "spark" || effect.kind === "dry-fire" || effect.kind === "pickup") {
      ctx.fillRect(x - 6, y - 6, 12, 12);
    } else if (effect.kind === "blood") {
      ctx.fillStyle = "#c71943";
      for (let index = 0; index < 6; index += 1) {
        const offset = index - 2.5;
        ctx.fillRect(Math.round(x + offset * 5 + progress * (tx - x) * 0.3), Math.round(y + Math.sin(index) * 5 + progress * 12), 4, 4);
      }
    } else if (effect.kind === "trip" || effect.kind === "stomp" || effect.kind === "stun") {
      ctx.fillRect(x - 12, y - 6, 24, 6);
      ctx.fillRect(x - 8, y - 18 - progress * 8, 16, 8);
      ctx.fillRect(x - 18, y - 14, 6, 6);
      ctx.fillRect(x + 12, y - 14, 6, 6);
    } else if (effect.kind === "aura") {
      const targetRadius = Math.max(18, Math.hypot(tx - x, ty - y));
      const deathAura = effect.label === "DEATH AURA" || effect.label === "DEATH RELEASE" || effect.label === "DEATH RECALL";
      const smokeCloud = effect.label === "SMOKE CLOUD" || effect.label === "HOLY SMOKE";
      const radius = deathAura
        ? Math.round(effect.label === "DEATH RECALL"
          ? 12 + targetRadius * (1 - progress)
          : effect.label === "DEATH RELEASE"
            ? 14 + targetRadius * progress
            : targetRadius * (0.9 + Math.sin(performance.now() * 0.018) * 0.05))
        : smokeCloud
          ? Math.round(28 + targetRadius * (0.45 + progress * 0.55))
        : Math.round(18 + Math.sin(performance.now() * 0.018) * 5);
      const ovalY = deathAura || smokeCloud ? Math.round(radius * (smokeCloud ? 0.42 : 0.58)) : radius;
      ctx.strokeRect(x - radius, y - ovalY, radius * 2, ovalY * 2);
      ctx.fillRect(x - 2, y - ovalY - 12, 4, 12);
      ctx.fillRect(x + radius - 2, y - 2, 4, 12);
      if (deathAura || smokeCloud) {
        for (let index = 0; index < 8; index += 1) {
          const angle = index * 0.8 + performance.now() * 0.0015;
          const pull = smokeCloud ? 0.35 + progress * 0.75 : effect.label === "DEATH RECALL" ? 1 - progress : progress;
          const px = x + Math.cos(angle) * radius * pull;
          const py = y + Math.sin(angle) * ovalY * pull;
          ctx.fillRect(Math.round(px), Math.round(py), smokeCloud ? 10 : 5, smokeCloud ? 7 : 5);
        }
      }
    } else if (effect.kind === "lightning") {
      ctx.beginPath();
      const dx = x - tx;
      const dy = y - ty;
      const length = Math.hypot(dx, dy) || 1;
      const segments = Math.max(3, Math.min(14, Math.ceil(length / 54)));
      const normalX = -dy / length;
      const normalY = dx / length;
      ctx.moveTo(tx, ty);
      for (let index = 1; index < segments; index += 1) {
        const t = index / segments;
        const jitter = (index % 2 === 0 ? -1 : 1) * (8 + (index % 3) * 5);
        ctx.lineTo(tx + dx * t + normalX * jitter, ty + dy * t + normalY * jitter);
      }
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (effect.kind === "teleport") {
      const radius = Math.round(10 + progress * 36);
      ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.fillRect(x - 5, y - 5, 10, 10);
    } else if (effect.kind === "whip-pull") {
      const segments = 8;
      for (let index = 0; index <= segments; index += 1) {
        const t = index / segments;
        const px = x + (tx - x) * t;
        const py = y + (ty - y) * t + Math.sin(t * Math.PI) * 22;
        ctx.fillRect(Math.round(px - 4), Math.round(py - 4), 8, 8);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, hp: number, max: number): void {
    const safeMax = Math.max(1, max);
    const ratio = Math.min(1, Math.max(0, hp / safeMax));
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(x, y, width, 6);
    ctx.fillStyle = hp > max * 0.35 ? "#7cff6b" : "#ff6f91";
    ctx.fillRect(x, y, Math.round(width * ratio), 6);
    const text = `${Math.ceil(hp)}/${Math.ceil(safeMax)}`;
    ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.86)";
    ctx.strokeText(text, x + width / 2, y - 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x + width / 2, y - 1);
  }

  private drawLocalHealth(ctx: CanvasRenderingContext2D): void {
    const local = this.combat.getCombatant(this.localPlayer.state.id);
    if (!local) {
      return;
    }
    const x = Math.round(this.localPlayer.state.x - this.camera.x - 7);
    const y = Math.round(this.localPlayer.state.y - this.camera.y - 12);
    this.drawHealthBar(ctx, x, y, 46, local.hp, local.maxHp);
  }

  private drawRemoteHealth(ctx: CanvasRenderingContext2D, remote: RemotePlayer): void {
    const combatant = this.combat.getCombatant(remote.player.state.id);
    if (!combatant) {
      return;
    }
    const x = Math.round(remote.player.state.x - this.camera.x - 7);
    const y = Math.round(remote.player.state.y - this.camera.y - 12);
    this.drawHealthBar(ctx, x, y, 46, combatant.hp, combatant.maxHp);
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D): void {
    const x = Math.round(this.lastMouse.x);
    const y = Math.round(this.lastMouse.y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x - 3, y);
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y - 3);
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
  }

  private renderCombatHud(): void {
    const inventory = this.combat.getPlayerInventory();
    const weapon = weaponRegistry.get(inventory.equippedWeapon);
    const ammo = inventory.ammo[weapon.id];
    const charge = inventory.charge[weapon.id];
    const runtime = this.combat.getWeaponRuntimeState(weapon.id, this.localPlayer.state.id);
    const local = this.combat.getCombatant(this.localPlayer.state.id);
    const teleport = this.combat.getTeleportState(this.localPlayer.state.id);
    const lightning = this.combat.getLightningState(this.localPlayer.state.id);
    const ammoText = ammo
      ? `Ammo ${ammo.magazine}/${ammo.reserve}${ammo.reloadTimer > 0 ? ` Reload ${ammo.reloadTimer.toFixed(1)}s` : ""}${ammo.perfectWindow > 0 ? " PERFECT R" : ""}${ammo.perfectShots > 0 ? ` Perfect x${ammo.perfectShots}` : ""}`
      : "No ammo";
    const status = local?.statuses.map((item) => item.duration > 0 ? `${item.label} ${item.duration.toFixed(item.duration >= 10 ? 0 : 1)}s` : item.label).join(", ") || "No status";
    const chargeText = weaponHudDetail(weapon.id, runtime, charge?.maxCharge ?? 0, this.primaryHeldMs, status);
    const hasSuperLegs = loadoutHasWeapon(this.loadout, "super-legs") || (local?.statuses.some((item) => item.id === "superLegs") ?? false);
    const superLegsText = hasSuperLegs
      ? `Super Legs jumps ${Math.min(this.localPlayer.state.jumpsUsed, 3)}/3${this.localPlayer.state.grounded ? " - reset" : ""}`
      : "";
    const special = [
      teleport.pending ? `Teleport ${teleport.timer.toFixed(1)}s - right cancel` : "",
      lightning.charging ? `Lightning in ${lightning.chargeTimer.toFixed(1)}s` : "",
      lightning.empoweredTimer > 0 ? `Empowered ${lightning.empoweredTimer.toFixed(1)}s` : "",
      lightning.strain > 0 ? `Strain ${Math.round(lightning.strain * 100)}%` : "",
      superLegsText,
    ].filter(Boolean).join(" - ");
    const hpText = local ? `HP ${Math.ceil(local.hp)}/${local.maxHp}` : "HP --";
    const weightText = `Weight ${weapon.weight.label} - Move ${Math.round(weapon.weight.moveSpeedMultiplier * 100)}% - Jump ${Math.round(weapon.weight.jumpMultiplier * 100)}%`;
    const loadoutSlots: LoadoutSlotId[] = ["frontStrap", "backStrap", "leftHand", "rightHand", "attachment", "legs"];
    const slotHud = loadoutSlots.map((slot) => {
      const slotWeapon = this.loadout[slot];
      const cooldown = slotWeapon ? this.combat.getPlayerInventory().cooldowns[slotWeapon] ?? 0 : 0;
      const cooldownText = cooldown > 0 ? ` ${cooldown.toFixed(1)}s` : "";
      const equipped = slotWeapon === weapon.id;
      return `<span class="${equipped ? "is-equipped" : ""}">${LOADOUT_SLOT_LABELS[slot]}: ${loadoutWeaponName(slotWeapon)}${cooldownText}</span>`;
    }).join("");
    this.combatHud.innerHTML = `
      <div class="combat-hud-card">
        <strong>${weapon.name}</strong>
        <span>${hpText}</span>
        <span>${ammoText}</span>
        <span>${chargeText}</span>
        ${special ? `<span>${special}</span>` : ""}
        <span>${weightText}</span>
        <span>${weaponHelper(weapon.id)}</span>
      </div>
      <div class="armory-strip loadout-strip">${slotHud}</div>
    `;
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#0b1230";
    for (let y = 18; y < this.canvas.height; y += 34) {
      const offset = Math.round((-this.camera.x * 0.18 + y * 3) % 160);
      ctx.fillRect(offset - 160, y, 280, 4);
      ctx.fillRect(offset + 220, y + 8, 180, 3);
    }
    ctx.fillStyle = "#10133a";
    ctx.fillRect(0, Math.round(DEFAULT_PHYSICS.groundY - this.camera.y + 30), this.canvas.width, this.canvas.height);
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const spacing = 64;
    const startX = Math.floor(this.camera.x / spacing) * spacing;
    const startY = Math.floor(this.camera.y / spacing) * spacing;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    ctx.lineWidth = 1;

    for (let x = startX; x < this.camera.x + this.canvas.width + spacing; x += spacing) {
      const screenX = Math.round(x - this.camera.x);
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, this.canvas.height);
      ctx.stroke();
    }

    for (let y = startY; y < this.camera.y + this.canvas.height + spacing; y += spacing) {
      const screenY = Math.round(y - this.camera.y);
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(this.canvas.width, screenY);
      ctx.stroke();
    }
  }

  private drawPlatform(ctx: CanvasRenderingContext2D): void {
    const y = Math.round(DEFAULT_PHYSICS.groundY - this.camera.y);
    const x = Math.round(PLATFORM_LEFT - this.camera.x);
    const width = PLATFORM_RIGHT - PLATFORM_LEFT;
    ctx.fillStyle = "#dedee8";
    ctx.fillRect(x, y, width, 12);
    ctx.fillStyle = "#86869b";
    ctx.fillRect(x, y + 12, width, 18);
    ctx.fillStyle = "#444455";
    for (let tileX = x; tileX < x + width; tileX += 32) {
      ctx.fillRect(tileX, y + 14, 24, 2);
    }
  }

  private drawInvulnerabilityGlow(ctx: CanvasRenderingContext2D, state: PlayerPhysicsState, seconds: number): void {
    if (seconds <= 0) {
      return;
    }
    const x = Math.round(state.x - this.camera.x);
    const y = Math.round(state.y - this.camera.y);
    const pulse = 1 + Math.sin(performance.now() * 0.014) * 0.16;
    ctx.save();
    ctx.globalAlpha = Math.min(0.75, 0.32 + seconds * 0.18);
    ctx.strokeStyle = "#5bb7ff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - Math.round(8 * pulse), y - Math.round(9 * pulse), state.width + Math.round(16 * pulse), state.height + Math.round(17 * pulse));
    ctx.fillStyle = "rgba(91, 183, 255, 0.14)";
    ctx.fillRect(x - 10, y - 10, state.width + 20, state.height + 20);
    ctx.restore();
  }

  private drawBursts(ctx: CanvasRenderingContext2D): void {
    for (const burst of this.bursts) {
      const progress = burst.age / 0.28;
      const x = Math.round(burst.x - this.camera.x);
      const y = Math.round(burst.y - this.camera.y);
      const reach = Math.round(12 + progress * 34);
      ctx.fillStyle = burst.color;
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillRect(x - reach, y - 5, 10, 5);
      ctx.fillRect(x + reach - 10, y - 5, 10, 5);
      ctx.fillRect(x - reach / 2, y - 14 - progress * 8, 8, 8);
      ctx.fillRect(x + reach / 2 - 8, y - 12 - progress * 6, 8, 8);
      ctx.globalAlpha = 1;
    }
  }

  private renderEmpty(): void {
    this.drawBackdrop(this.context);
  }

  private pixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    let nextX = x;
    let nextWidth = width;
    if (nextWidth < 0) {
      nextX += nextWidth;
      nextWidth = Math.abs(nextWidth);
    }
    ctx.fillRect(Math.round(nextX), Math.round(y), Math.round(nextWidth), Math.round(height));
  }

  private readonly resize = (): void => {
    const width = Math.max(320, window.innerWidth);
    const height = Math.max(320, window.innerHeight);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.running) {
      this.renderEmpty();
    }
  };
}

export function resolveMouseWeaponAction(
  button: "primary" | "secondary",
  loadout: Partial<LoadoutState>,
): { weaponId: WeaponId; action: "primary" | "secondary" } | null {
  const normalized = normalizeLoadout(loadout);
  const weaponId = button === "primary" ? normalized.leftHand : normalized.rightHand;
  return weaponId ? { weaponId, action: button } : null;
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
    case "grappling-hook":
      return "#5ad7ff";
    case "chainsaw":
      return "#b8bfd7";
    case "hands":
      return "#b8ffd0";
    case "super-legs":
      return "#7cff6b";
    case "teleport-ball":
      return "#b096ff";
    case "lightning-rod":
      return "#ffd84d";
    case "sledgehammer":
      return "#ff8f3d";
    case "pistol":
    default:
      return "#ffffff";
  }
}

function machetePowerColor(redness: number): string {
  const clamped = Math.min(Math.max(redness, 0), 1);
  const r = Math.round(158 + (255 - 158) * clamped);
  const g = Math.round(231 + (70 - 231) * clamped);
  const b = Math.round(195 + (88 - 195) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

function lightningChargeColorForMs(heldMs: number): string {
  if (heldMs >= 3800) {
    return "#b096ff";
  }
  if (heldMs >= 2450) {
    return "#ff5c5c";
  }
  if (heldMs >= 1250) {
    return "#5ad7ff";
  }
  return "#ffd84d";
}

function deathAuraColor(power: number): string {
  return power > 0.72 ? "#08080c" : power > 0.38 ? "#17101d" : "#23182b";
}

function weaponHudDetail(
  id: WeaponId,
  runtime: ReturnType<CombatSystem["getWeaponRuntimeState"]>,
  maxCharge: number,
  primaryHeldMs: number,
  fallback: string,
): string {
  switch (id) {
    case "slingshot":
      return `Pull ${Math.round(Math.min(primaryHeldMs / 850, 1) * 100)}% - bounce/scatter`;
    case "laser-blaster":
      return `Charge ${runtime.charge.toFixed(1)}/${maxCharge} - Heat ${Math.round(runtime.heat * 100)}%${runtime.overheated ? " - OVERHEAT" : ""}`;
    case "revolver":
      return `Chamber ${runtime.chamber.toFixed(1)}s - last bullet pops`;
    case "minigun":
      return `Spin ${Math.round(runtime.spin * 100)}% - Heat ${Math.round(runtime.heat * 100)}%${runtime.overheated ? " - OVERHEAT" : ""}`;
    case "sniper":
      return `Steady ${Math.round(runtime.steady * 100)}% - Chamber ${runtime.chamber.toFixed(1)}s`;
    case "knife":
      return "Infinite throw - recoil kick";
    case "machete":
      return `Growth +${Math.round(runtime.rangeBonus)} range - Power +${Math.round(runtime.damageBonus)}`;
    case "axe":
      return runtime.axeReturning
        ? "RETURNING AXE"
        : runtime.axeThrown
          ? "Right click recalls"
          : `Rush swing - Throw chamber ${runtime.chamber.toFixed(1)}s`;
    case "wings":
      return "Hold Space flap - release glide - S dive - Shift burst";
    case "super-legs":
      return "Run/jump boost - Space kicks - leg armor";
    case "virgin-blood":
      return `Click bless/heal - Cooldown ${runtime.chamber.toFixed(1)}s`;
    case "death-aura":
      return runtime.deathAuraActive ? "Aura active - missing HP strengthens" : "Click pulse aura";
    case "rocket":
      return runtime.rocketRiding ? "RIDING - Space jumps off" : runtime.rocketLit ? "Rocket lit - chaos rising" : runtime.rocketActive ? "Right click lights rocket" : "Left click places rocket";
    case "holy-bazooka":
      return `Right calls ammo - Fire cooldown ${runtime.chamber.toFixed(1)}s - max HP steals`;
    case "grappling-hook":
      return runtime.grappleAttached
        ? `Attached - hold right pull${runtime.grapplePulling ? " - PULLING" : ""} - left release`
        : runtime.grappleActive
          ? "Hook flying - left release"
          : `Left fire rope - right pull once attached - ${runtime.chamber.toFixed(1)}s`;
    case "chainsaw":
      return `${runtime.chainsawMode.toUpperCase()} - Rev ${Math.round(runtime.chainsawRev * 100)}% - Heat ${Math.round(runtime.chainsawHeat * 100)}% - DPS ${runtime.chainsawDps} - Zombies ${runtime.zombieCount}`;
    case "hands":
      return runtime.attachedHands > 0 ? `${runtime.attachedHands} face hands attached` : `Summon 5 - Cooldown ${runtime.chamber.toFixed(1)}s`;
    case "teleport-ball":
      return "Marker arms for 3.0s";
    case "lightning-rod":
      return `Aim strike - Hold up charge ${Math.round(Math.min(primaryHeldMs / 4200, 1) * 100)}%`;
    case "sledgehammer":
      return `Sledge charge ${Math.round(Math.min(primaryHeldMs / 900, 1) * 100)}% - shockwave`;
    default:
      return fallback;
  }
}

function weaponHelper(id: WeaponId): string {
  switch (id) {
    case "pistol":
      return "Tap shots - R reload/perfect - pistol stays equipped";
    case "whip":
      return "Long arc - Tip cracks - 2 quick hits pull";
    case "teleport-ball":
      return "Left throw - 3s teleport - Right cancel";
    case "lightning-rod":
      return "Hold/release left aim strike - Up self-charge - Right raise";
    case "sledgehammer":
      return "Hold left charge - Air drop - Right shove";
    case "slingshot":
      return "Hold left draw - Right scatter - Stones ricochet";
    case "laser-blaster":
      return "Hold left charge - Right vent - Overcharge bursts";
    case "revolver":
      return "Tap shots - Right fan fire - Last bullet kicks";
    case "minigun":
      return "Hold left fire - Hold/right pre-spin - Heat locks";
    case "sniper":
      return "Hold/right steady - Left chambered shot - Pierces";
    case "knife":
      return "Infinite throws - Right/G kick back";
    case "machete":
      return "Grows on hit - KO adds power - Right chop";
    case "axe":
      return "Left rushes target - Right throw/recall";
    case "wings":
      return "No attacks - Space fly/glide - flap gust pushes nearby";
    case "super-legs":
      return "Leg gear only - Space combos kick without replacing jump";
    case "virgin-blood":
      return "Left/right: full heal + holy buff - death revives with angel wings";
    case "death-aura":
      return "Dark aura freezes and drains - stronger when hurt";
    case "rocket":
      return "Left place - Right light - stand on it to ride";
    case "holy-bazooka":
      return "Right calls one map ammo pickup - Left fires homing missile";
    case "grappling-hook":
      return "Left fires/releases rope hook - hold right to pull while attached";
    case "chainsaw":
      return "Hold left to rev/run - close DPS overheats - chainsaw KOs make poison zombies";
    case "hands":
      return "Summon 5 face hands - lose your own hands for 40s";
    default:
      return "";
  }
}

function rectsOverlap(a: PlayerPhysicsState, b: PlayerPhysicsState): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function attachmentAnchor(state: PlayerPhysicsState): { x: number; y: number } {
  return {
    x: state.x + state.width / 2,
    y: state.y + 16,
  };
}

function isMovementInputActive(input: InputFrame): boolean {
  return input.left || input.right || input.up || input.down || input.jumpPressed || input.jumpHeld || input.dashPressed || input.downPressed;
}

function scrambledInput(input: InputFrame): InputFrame {
  const jumpSuppressed = Math.floor(performance.now() / 240) % 2 === 1;
  return {
    left: input.right,
    right: input.left,
    up: input.down,
    down: input.up,
    downPressed: input.up && !input.down,
    jumpPressed: jumpSuppressed ? false : input.jumpPressed,
    jumpHeld: jumpSuppressed ? false : input.jumpHeld,
    dashPressed: input.dashPressed,
  };
}

function neutralInput(): InputFrame {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    downPressed: false,
    jumpPressed: false,
    jumpHeld: false,
    dashPressed: false,
  };
}
