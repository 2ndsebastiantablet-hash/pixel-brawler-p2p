import { Camera } from "./Camera";
import { InputController } from "./Input";
import { Player } from "./Player";
import { DEFAULT_PHYSICS } from "./Physics";
import {
  encodePlayerStatePacket,
  interpolateRemoteState,
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
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly input = new InputController();
  private readonly camera = new Camera();
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly bursts: LandingBurst[] = [];
  private localPlayer = new Player("local", "local", "Player", -40, "#18dff5");
  private animationFrame = 0;
  private lastTime = 0;
  private sendAccumulator = 0;
  private running = false;
  private showNames = true;
  private shakeTimer = 0;

  constructor(parent: HTMLElement, private readonly options: GameOptions) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.canvas.width = 960;
    this.canvas.height = 540;
    parent.append(this.canvas);

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
  }

  startNetwork(localId: string, profile: PlayerProfile, side: "host" | "guest"): void {
    this.start(localId, profile, side === "host" ? -70 : 70);
  }

  setShowNames(show: boolean): void {
    this.showNames = show;
  }

  stop(): void {
    this.running = false;
    this.remotes.clear();
    this.bursts.length = 0;
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

  private start(id: string, profile: PlayerProfile, x: number): void {
    this.localPlayer = new Player(id, profile.clientId, profile.name, x, profile.color);
    this.remotes.clear();
    this.bursts.length = 0;
    this.shakeTimer = 0;
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
    this.localPlayer.update(this.input.consumeFrame(), dt);
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
    for (const remote of this.remotes.values()) {
      remote.player.draw(ctx, this.camera.x, this.camera.y, this.showNames);
    }
    this.localPlayer.draw(ctx, this.camera.x, this.camera.y, this.showNames);
    ctx.restore();
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
