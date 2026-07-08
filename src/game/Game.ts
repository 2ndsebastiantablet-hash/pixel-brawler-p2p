import { Camera } from "./Camera";
import { InputController } from "./Input";
import { Player } from "./Player";
import { DEFAULT_PHYSICS, type InputFrame, type PhysicsConfig, type PlayerPhysicsState } from "./Physics";
import { CombatSystem, type CombatEventPacket } from "./combat/CombatSystem";
import type { Combatant, CombatEffect, DroppedWeapon } from "./combat/CombatSystem";
import type { Projectile } from "./combat/Projectile";
import type { WeaponId, WeaponUseResult } from "./combat/Weapon";
import { COMBAT_TUNING } from "./combat/CombatTuning";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "./combat/WeaponRegistry";
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

interface AttackVisual {
  weaponId: WeaponId;
  kind: "primary" | "secondary" | "throw" | "reload";
  timer: number;
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
  private offlineMode = false;
  private showNames = true;
  private shakeTimer = 0;
  private primaryHeldMs = 0;
  private secondaryHeldMs = 0;
  private footstepTimer = 0;
  private lastAim = { x: 1, y: 0 };
  private lastMouse = { x: 0, y: 0 };
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
    this.offlineMode = true;
    this.start("local", profile, -40);
    this.combat.spawnTrainingDummy({ x: 110, y: DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height });
  }

  startNetwork(localId: string, profile: PlayerProfile, side: "host" | "guest"): void {
    this.offlineMode = false;
    this.start(localId, profile, side === "host" ? -70 : 70);
  }

  setShowNames(show: boolean): void {
    this.showNames = show;
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
    this.combat.start(createDefaultInventory());
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
    const movementInput = this.input.consumeFrame();
    const combatInput = this.input.consumeCombatFrame();
    this.lastMouse = { x: combatInput.mouseX, y: combatInput.mouseY };
    this.lastAim = this.getAim(combatInput);
    const lockedOut = (this.combat.getCombatant(this.localPlayer.state.id)?.respawnTimer ?? 0) > 0;
    const previousState = { ...this.localPlayer.state };
    this.localPlayer.update(lockedOut ? neutralInput() : movementInput, dt, this.getWeightedPhysics());
    this.playMovementFeedback(previousState, this.localPlayer.state, dt);
    this.combat.syncLocalPlayer(this.localPlayer.state, this.localPlayer.name, this.localPlayer.color);
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
        statuses: remote.current.statuses,
        respawnTimer: remote.current.respawnTimer,
      });
    }

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
      this.options.onLocalState(encodePlayerStatePacket({
        ...this.localPlayer.toNetState(time),
        weaponId: this.combat.getPlayerInventory().equippedWeapon,
        hp: localCombatant?.hp,
        statuses: localCombatant?.statuses.map((status) => status.id),
        respawnTimer: localCombatant?.respawnTimer,
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
      remote.player.draw(ctx, this.camera.x, this.camera.y, this.showNames);
      if (remote.current.weaponId === "wings") {
        this.drawWings(ctx, remote.player.state, remote.player.color, remote.player.state.grounded ? "idle" : "glide");
      }
      this.drawRemoteHealth(ctx, remote);
    }
    const localCombatant = this.combat.getCombatant(this.localPlayer.state.id);
    const steady = localCombatant?.statuses.some((status) => status.id === "steady") ?? false;
    if (!steady) {
      this.localPlayer.draw(ctx, this.camera.x, this.camera.y, this.showNames);
      this.drawLocalWeapon(ctx);
    }
    this.drawLocalHealth(ctx);
    this.drawCrosshair(ctx);
    ctx.restore();
  }

  private handleCombatInput(input: ReturnType<InputController["consumeCombatFrame"]>, dt: number, time: number): void {
    if (input.weaponSlotPressed !== null) {
      this.combat.equip(input.weaponSlotPressed);
    }
    if (input.previousWeaponPressed) {
      this.combat.cycleWeapon(-1);
    }
    if (input.nextWeaponPressed) {
      this.combat.cycleWeapon(1);
    }
    if (input.reloadPressed) {
      this.combat.reload(this.localPlayer.state.id, time);
    }
    if (input.pickupPressed) {
      this.combat.pickUpNearest(this.localPlayer.state);
    }
    if (input.dropPressed) {
      this.combat.dropCurrentWeapon(this.localPlayer.state.id, this.localPlayer.state, this.lastAim, time);
    }

    const equipped = this.combat.getPlayerInventory().equippedWeapon;
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

    const charge = this.combat.getPlayerInventory().charge[equipped];
    let secondaryHandled = false;
    if (equipped === "laser-blaster") {
      if (input.primaryPressed && charge) {
        charge.charging = true;
        charge.charge = 0;
      }
      if (input.primaryHeld && charge) {
        charge.charging = true;
      }
      if (input.primaryHeld && charge && charge.charge >= charge.maxCharge) {
        this.recordAttack(this.combat.triggerLaserOvercharge(this.localPlayer.state.id, this.localPlayer.state, time), "primary");
      }
      if ((input.primaryReleased || (input.primaryPressed && !input.primaryHeld)) && charge) {
        charge.charging = false;
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        }), "primary");
      }
    } else if (equipped === "slingshot") {
      if (input.primaryHeld) {
        this.attackVisual = { weaponId: "slingshot", kind: "primary", timer: 0.12 };
      }
      if (input.primaryReleased || (input.primaryPressed && !input.primaryHeld)) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        }), "primary");
      }
    } else if (equipped === "sledgehammer") {
      if (input.primaryHeld) {
        this.attackVisual = { weaponId: "sledgehammer", kind: "primary", timer: 0.12 };
      }
      if (input.primaryReleased) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        }), "primary");
      }
    } else if (equipped === "lightning-rod") {
      if (input.primaryHeld) {
        this.attackVisual = { weaponId: "lightning-rod", kind: "primary", timer: 0.12 };
      }
      if (input.primaryReleased || (input.primaryPressed && !input.primaryHeld)) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        }), "primary");
      }
    } else if (equipped === "minigun") {
      if (input.secondaryHeld || input.secondaryPressed) {
        this.recordAttack(this.combat.useSecondary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.secondaryHeldMs,
          isNewPress: input.secondaryPressed,
        }), "secondary");
        secondaryHandled = true;
      }
      if (input.primaryHeld || input.primaryPressed) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: input.primaryPressed,
        }), "primary");
      }
    } else if (equipped === "sniper") {
      if (input.secondaryHeld || input.secondaryPressed) {
        this.recordAttack(this.combat.useSecondary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.secondaryHeldMs,
          isNewPress: input.secondaryPressed,
        }), "secondary");
        secondaryHandled = true;
      }
      if (input.primaryPressed) {
        this.recordAttack(this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        }), "primary");
      }
    } else if (input.primaryPressed) {
      this.recordAttack(this.combat.usePrimary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim,
        now: time,
        heldMs: this.primaryHeldMs,
        isNewPress: true,
      }), "primary");
    }

    if (!secondaryHandled && (input.secondaryPressed || (equipped === "lightning-rod" && input.secondaryHeld && this.secondaryHeldMs < dt * 1000 + 1))) {
      this.recordAttack(this.combat.useSecondary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim,
        now: time,
        heldMs: this.secondaryHeldMs,
        isNewPress: true,
      }), "secondary");
    }

    if (input.primaryReleased) {
      this.primaryHeldMs = 0;
    }
    if (input.secondaryReleased) {
      this.secondaryHeldMs = 0;
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
        this.shakeTimer = Math.max(this.shakeTimer, 0.22);
        break;
      case "lightning-strike":
      case "sniper-shot":
        this.shakeTimer = Math.max(this.shakeTimer, sound === "lightning-strike" ? 0.28 : 0.14);
        break;
      case "revolver-last":
      case "minigun-overheat":
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

  private getWeightedPhysics(): PhysicsConfig {
    const weapon = weaponRegistry.get(this.combat.getPlayerInventory().equippedWeapon);
    const weight = weapon.weight;
    const runtime = this.combat.getWeaponRuntimeState(weapon.id, this.localPlayer.state.id);
    const local = this.combat.getCombatant(this.localPlayer.state.id);
    const legSlow = local?.statuses.some((status) => status.id === "legShotSlow") ? COMBAT_TUNING.sniper.legShotMoveMultiplier : 1;
    const legStagger = local?.statuses.some((status) => status.id === "legStagger") ? 0.72 : 1;
    const suppressed = local?.statuses.some((status) => status.id === "suppressed") ? 0.82 : 1;
    const steadyLock = local?.statuses.some((status) => status.id === "steady") ? 0 : 1;
    const minigunSlow = weapon.id === "minigun" && runtime.heat > 0.02
      ? COMBAT_TUNING.minigun.firingSlowMultiplier
      : weapon.id === "minigun" && runtime.spin > 0.02
        ? COMBAT_TUNING.minigun.spinSlowMultiplier
        : 1;
    const empowered = local?.statuses.some((status) => status.id === "empowered") ? 1.18 : 1;
    const movementScale = legSlow * legStagger * suppressed * steadyLock * minigunSlow * empowered;
    const physics = {
      ...DEFAULT_PHYSICS,
      maxRunSpeed: DEFAULT_PHYSICS.maxRunSpeed * weight.moveSpeedMultiplier * movementScale,
      acceleration: DEFAULT_PHYSICS.acceleration * weight.accelerationMultiplier * movementScale,
      airAcceleration: DEFAULT_PHYSICS.airAcceleration * weight.airAccelerationMultiplier * movementScale,
      jumpVelocity: DEFAULT_PHYSICS.jumpVelocity * weight.jumpMultiplier * (empowered > 1 ? 1.06 : 1),
      doubleJumpVelocity: DEFAULT_PHYSICS.doubleJumpVelocity * weight.jumpMultiplier * (empowered > 1 ? 1.06 : 1),
      slideSpeed: DEFAULT_PHYSICS.slideSpeed * weight.slideMultiplier * movementScale,
      lowSlideSpeed: DEFAULT_PHYSICS.lowSlideSpeed * weight.slideMultiplier * movementScale,
    };
    return weapon.id === "wings" ? { ...physics, wingFlight: WING_FLIGHT_CONFIG } : physics;
  }

  private drawLocalWeapon(ctx: CanvasRenderingContext2D): void {
    const weaponId = this.combat.getPlayerInventory().equippedWeapon;
    const state = this.localPlayer.state;
    const aim = this.lastAim;
    const centerX = state.x + state.width / 2 - this.camera.x;
    const centerY = state.y + 24 - this.camera.y;
    const facing = Math.sign(aim.x || state.facing) || 1;
    const active = this.attackVisual?.weaponId === weaponId ? this.attackVisual.timer : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = colorForWeapon(weaponId);

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

  private drawCombatEntities(ctx: CanvasRenderingContext2D): void {
    const snapshot = this.combat.getSnapshot();
    for (const combatant of snapshot.combatants) {
      if (combatant.id !== this.localPlayer.state.id && !this.remotes.has(combatant.id)) {
        this.drawCombatant(ctx, combatant);
      }
    }
    for (const dropped of snapshot.droppedWeapons) {
      this.drawDroppedWeapon(ctx, dropped);
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

  private drawCombatant(ctx: CanvasRenderingContext2D, combatant: Combatant): void {
    const x = Math.round(combatant.x - this.camera.x);
    const y = Math.round(combatant.y - this.camera.y);
    const flash = combatant.invulnerable > 0 && Math.floor(performance.now() / 80) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = combatant.respawnTimer > 0 ? 0.25 : 1;
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
      const radius = Math.round(14 + progress * 46);
      ctx.strokeRect(x - radius, y - 5, radius * 2, 10);
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
      const radius = Math.round(18 + Math.sin(performance.now() * 0.018) * 5);
      ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.fillRect(x - 2, y - radius - 12, 4, 12);
      ctx.fillRect(x + radius - 2, y - 2, 4, 12);
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(x, y, width, 5);
    ctx.fillStyle = hp > max * 0.35 ? "#7cff6b" : "#ff6f91";
    ctx.fillRect(x, y, Math.max(0, width * (hp / max)), 5);
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
    const status = local?.statuses.map((item) => item.label).join(", ") || "No status";
    const chargeText = weaponHudDetail(weapon.id, runtime, charge?.maxCharge ?? 0, this.primaryHeldMs, status);
    const special = [
      teleport.pending ? `Teleport ${teleport.timer.toFixed(1)}s - right cancel` : "",
      lightning.charging ? `Lightning in ${lightning.chargeTimer.toFixed(1)}s` : "",
      lightning.empoweredTimer > 0 ? `Empowered ${lightning.empoweredTimer.toFixed(1)}s` : "",
      lightning.strain > 0 ? `Strain ${Math.round(lightning.strain * 100)}%` : "",
    ].filter(Boolean).join(" - ");
    const hpText = local ? `HP ${Math.ceil(local.hp)}/${local.maxHp}` : "HP --";
    const weightText = `Weight ${weapon.weight.label} - Move ${Math.round(weapon.weight.moveSpeedMultiplier * 100)}% - Jump ${Math.round(weapon.weight.jumpMultiplier * 100)}%`;
    const weaponNumber = WEAPON_IDS.includes(weapon.id as (typeof WEAPON_IDS)[number])
      ? WEAPON_IDS.indexOf(weapon.id as (typeof WEAPON_IDS)[number]) + 1
      : 1;
    const armory = WEAPON_IDS.map((id, index) => `<span class="${id === weapon.id ? "is-equipped" : ""}">${index + 1}:${weaponRegistry.get(id).name}</span>`).join("");
    this.combatHud.innerHTML = `
      <div class="combat-hud-card">
        <strong>${weaponNumber}. ${weapon.name}</strong>
        <span>${hpText}</span>
        <span>${ammoText}</span>
        <span>${chargeText}</span>
        ${special ? `<span>${special}</span>` : ""}
        <span>${weightText}</span>
        <span>${weaponHelper(weapon.id)}</span>
      </div>
      ${this.offlineMode ? `<div class="armory-strip">${armory}</div>` : ""}
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
    const x = Math.round(-2200 - this.camera.x);
    ctx.fillStyle = "#dedee8";
    ctx.fillRect(x, y, 4400, 12);
    ctx.fillStyle = "#86869b";
    ctx.fillRect(x, y + 12, 4400, 18);
    ctx.fillStyle = "#444455";
    for (let tileX = x; tileX < x + 4400; tileX += 32) {
      ctx.fillRect(tileX, y + 14, 24, 2);
    }
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
      return `Heavy swing - Throw chamber ${runtime.chamber.toFixed(1)}s`;
    case "wings":
      return "Hold Space flap - release glide - S dive - Shift burst";
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
      return "Tap shots - R reload/perfect - Right throw";
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
      return "Left heavy swing - Right/G spinning throw";
    case "wings":
      return "No attacks - Space fly/glide - flap gust pushes nearby";
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
