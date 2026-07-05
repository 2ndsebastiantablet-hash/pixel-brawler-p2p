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

interface RemotePlayer {
  player: Player;
  current: PlayerNetState;
  target: PlayerNetState;
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
  private localPlayer = new Player("local", "P1", -40, "#4fd6ff", "#fff06a");
  private animationFrame = 0;
  private lastTime = 0;
  private sendAccumulator = 0;
  private running = false;

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

  startOffline(): void {
    this.start("local", "P1", -40);
    this.remotes.clear();
  }

  startNetwork(localId: string, label: "P1" | "P2"): void {
    this.start(localId, label, label === "P1" ? -70 : 70);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
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

    const player = new Player(state.id, state.label || "P2", state.x, "#ff6b92", "#7cff6b");
    player.applyNetState(state);
    this.remotes.set(state.id, { player, current: state, target: state });
  }

  removeRemote(peerId: string): void {
    this.remotes.delete(peerId);
  }

  private start(id: string, label: "P1" | "P2", x: number): void {
    this.localPlayer = new Player(id, label, x, "#4fd6ff", "#fff06a");
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
    this.camera.follow(
      this.localPlayer.state.x + this.localPlayer.state.width / 2,
      this.localPlayer.state.y + this.localPlayer.state.height / 2,
      this.canvas.width,
      this.canvas.height,
    );

    for (const remote of this.remotes.values()) {
      remote.current = interpolateRemoteState(remote.current, remote.target, Math.min(dt * 12, 1));
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
    ctx.fillStyle = "#020204";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid(ctx);
    this.drawPlatform(ctx);
    for (const remote of this.remotes.values()) {
      remote.player.draw(ctx, this.camera.x, this.camera.y);
    }
    this.localPlayer.draw(ctx, this.camera.x, this.camera.y);
    ctx.restore();
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
    ctx.fillStyle = "#d8d8e0";
    ctx.fillRect(x, y, 4400, 12);
    ctx.fillStyle = "#7e7e91";
    ctx.fillRect(x, y + 12, 4400, 18);
    ctx.fillStyle = "#3f3f4e";
    for (let tileX = x; tileX < x + 4400; tileX += 32) {
      ctx.fillRect(tileX, y + 14, 24, 2);
    }
  }

  private renderEmpty(): void {
    this.context.fillStyle = "#020204";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private readonly resize = (): void => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, window.innerWidth);
    const height = Math.max(320, window.innerHeight);
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.canvas.width = width;
    this.canvas.height = height;
  };
}
