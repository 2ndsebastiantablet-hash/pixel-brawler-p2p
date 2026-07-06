import { Camera } from "./Camera";
import { InputController } from "./Input";
import { Player } from "./Player";
import { DEFAULT_PHYSICS } from "./Physics";
import { CombatSystem, type CombatEventPacket } from "./combat/CombatSystem";
import type { Combatant, CombatEffect, DroppedWeapon } from "./combat/CombatSystem";
import type { Projectile } from "./combat/Projectile";
import { WEAPON_IDS, createDefaultInventory, weaponRegistry } from "./combat/WeaponRegistry";
import {
  encodePlayerStatePacket,
  interpolateRemoteState,
  type CombatEventPacket as NetCombatEventPacket,
  type PlayerNetState,
  type PlayerStatePacket,
} from "../net/NetTypes";
import type { PlayerProfile } from "../ui/Profile";

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

interface GameOptions {
  onLocalState: (packet: PlayerStatePacket) => void;
  onCombatEvent: (packet: NetCombatEventPacket) => void;
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
  private lastAim = { x: 1, y: 0 };
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
  }

  applyCombatEvent(event: NetCombatEventPacket): void {
    this.combat.applyRemoteEvent(event as CombatEventPacket);
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
    this.lastAim = this.getAim(combatInput);
    this.localPlayer.update(movementInput, dt);
    this.combat.syncLocalPlayer(this.localPlayer.state, this.localPlayer.name, this.localPlayer.color);
    this.handleCombatInput(combatInput, dt, time);

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

    this.camera.follow(
      this.localPlayer.state.x + this.localPlayer.state.width / 2,
      this.localPlayer.state.y + this.localPlayer.state.height / 2,
      this.canvas.width,
      this.canvas.height,
    );

    for (const remote of this.remotes.values()) {
      remote.current = interpolateRemoteState(remote.current, remote.target, Math.min(dt * 12, 1));
      remote.player.advanceAnimation(dt);
      remote.player.applyNetState(remote.current);
    }

    this.combat.update(dt, [this.localPlayer.state]);
    for (const event of this.combat.consumeEvents()) {
      this.options.onCombatEvent(event);
    }
    this.renderCombatHud();

    this.sendAccumulator += dt;
    if (this.sendAccumulator >= 1 / 20) {
      this.sendAccumulator = 0;
      this.options.onLocalState(encodePlayerStatePacket(this.localPlayer.toNetState(time)));
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
      remote.player.draw(ctx, this.camera.x, this.camera.y, this.showNames);
    }
    this.localPlayer.draw(ctx, this.camera.x, this.camera.y, this.showNames);
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
      this.primaryHeldMs = 0;
    }

    const charge = this.combat.getPlayerInventory().charge[equipped];
    if (equipped === "laser-blaster") {
      if (input.primaryPressed && charge) {
        charge.charging = true;
        charge.charge = 0;
      }
      if (input.primaryHeld && charge) {
        charge.charging = true;
      }
      if ((input.primaryReleased || (input.primaryPressed && !input.primaryHeld)) && charge) {
        charge.charging = false;
        this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        });
      }
    } else if (equipped === "minigun") {
      if (input.primaryHeld) {
        this.combat.usePrimary({
          ownerId: this.localPlayer.state.id,
          player: this.localPlayer.state,
          aim,
          now: time,
          heldMs: this.primaryHeldMs,
          isNewPress: true,
        });
      }
    } else if (input.primaryPressed) {
      this.combat.usePrimary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim,
        now: time,
        heldMs: this.primaryHeldMs,
        isNewPress: true,
      });
    }

    if (input.secondaryPressed || (equipped === "lightning-rod" && input.secondaryReleased)) {
      this.combat.useSecondary({
        ownerId: this.localPlayer.state.id,
        player: this.localPlayer.state,
        aim,
        now: time,
        heldMs: 0,
        isNewPress: true,
      });
    }
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

  private drawCombatEntities(ctx: CanvasRenderingContext2D): void {
    const snapshot = this.combat.getSnapshot();
    for (const combatant of snapshot.combatants) {
      if (combatant.id !== this.localPlayer.state.id) {
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
      ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.82)";
      ctx.strokeText(`${number.amount}`, Math.round(number.x - this.camera.x), Math.round(number.y - this.camera.y));
      ctx.fillStyle = number.color;
      ctx.fillText(`${number.amount}`, Math.round(number.x - this.camera.x), Math.round(number.y - this.camera.y));
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
    ctx.fillStyle = projectile.trailColor;
    ctx.fillRect(Math.round(x - projectile.vx * 0.018), Math.round(y - projectile.vy * 0.018), 10, 3);
    ctx.fillStyle = projectile.color;
    ctx.fillRect(x - projectile.radius, y - projectile.radius, projectile.radius * 2, projectile.radius * 2);
  }

  private drawDroppedWeapon(ctx: CanvasRenderingContext2D, dropped: DroppedWeapon): void {
    const x = Math.round(dropped.x - this.camera.x);
    const y = Math.round(dropped.y - this.camera.y);
    ctx.fillStyle = dropped.pickupable ? "#ffd84d" : "#ffffff";
    ctx.fillRect(x - 10, y - 3, 20, 6);
    ctx.fillRect(x + 4, y - 7, 5, 5);
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
    } else if (effect.kind === "spark" || effect.kind === "dry-fire" || effect.kind === "pickup") {
      ctx.fillRect(x - 6, y - 6, 12, 12);
    } else if (effect.kind === "lightning") {
      ctx.beginPath();
      ctx.moveTo(x, y - 70);
      ctx.lineTo(x + 10, y - 38);
      ctx.lineTo(x - 8, y - 12);
      ctx.lineTo(x, y);
      ctx.stroke();
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

  private drawCrosshair(ctx: CanvasRenderingContext2D): void {
    const equipped = weaponRegistry.get(this.combat.getPlayerInventory().equippedWeapon);
    const aim = this.lastAim;
    const centerX = this.localPlayer.state.x + this.localPlayer.state.width / 2 - this.camera.x;
    const centerY = this.localPlayer.state.y + this.localPlayer.state.height / 2 - this.camera.y;
    const x = Math.round(centerX + aim.x * Math.min(220, equipped.primary.range));
    const y = Math.round(centerY + aim.y * Math.min(220, equipped.primary.range));
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
    const local = this.combat.getCombatant(this.localPlayer.state.id);
    const ammoText = ammo ? `Ammo ${ammo.magazine}/${ammo.reserve}${ammo.reloadTimer > 0 ? " Reloading" : ""}` : "No ammo";
    const status = local?.statuses.map((item) => item.label).join(", ") || "No status";
    const chargeText = charge ? `Charge ${charge.charge.toFixed(1)} / ${charge.maxCharge}s · Heat ${Math.round(charge.heat * 100)}%` : status;
    const armory = WEAPON_IDS.map((id, index) => `<span class="${id === weapon.id ? "is-equipped" : ""}">${index + 1}:${weaponRegistry.get(id).name}</span>`).join("");
    this.combatHud.innerHTML = `
      <div class="combat-hud-card">
        <strong>${WEAPON_IDS.indexOf(weapon.id) + 1}. ${weapon.name}</strong>
        <span>${ammoText}</span>
        <span>${chargeText}</span>
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
