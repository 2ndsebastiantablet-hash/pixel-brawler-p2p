import {
  DEFAULT_PHYSICS,
  createPlayerState,
  stepPlayer,
  type InputFrame,
  type PlayerAction,
  type PlayerPhysicsState,
} from "./Physics";
import type { PlayerNetState } from "../net/NetTypes";

export class Player {
  state: PlayerPhysicsState;
  private sequence = 0;
  private animationTime = 0;

  constructor(
    id: string,
    public clientId: string,
    public name: string,
    x: number,
    public color: string,
  ) {
    this.state = createPlayerState(id, x, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height, name);
  }

  update(input: InputFrame, dt: number): void {
    this.animationTime += dt;
    this.state = stepPlayer(this.state, input, dt);
  }

  advanceAnimation(dt: number): void {
    this.animationTime += dt;
  }

  applyNetState(state: PlayerNetState): void {
    this.clientId = state.clientId;
    this.name = state.name;
    this.color = state.color;
    this.state = {
      ...this.state,
      id: state.id,
      label: state.name,
      x: state.x,
      y: state.y,
      velocityX: state.velocityX,
      velocityY: state.velocityY,
      facing: state.facing,
      grounded: state.grounded,
      sliding: state.sliding,
      lowSliding: state.action === "lowSlide",
      airDiving: state.action === "airDive",
      groundSlamming: state.action === "groundSlam",
      ducking: state.action === "duck",
      action: state.action,
    };
  }

  toNetState(now: number): PlayerNetState {
    this.sequence += 1;
    return {
      id: this.state.id,
      clientId: this.clientId,
      name: this.name,
      color: this.color,
      x: this.state.x,
      y: this.state.y,
      velocityX: this.state.velocityX,
      velocityY: this.state.velocityY,
      facing: this.state.facing,
      grounded: this.state.grounded,
      sliding: this.state.sliding,
      action: this.state.action,
      sequence: this.sequence,
      sentAt: now,
    };
  }

  draw(context: CanvasRenderingContext2D, cameraX: number, cameraY: number, showName: boolean): void {
    const screenX = Math.round(this.state.x - cameraX);
    const screenY = Math.round(this.state.y - cameraY);
    const feetY = screenY + this.state.height;
    const cx = screenX + this.state.width / 2;
    const phase = Math.sin(this.animationTime * 14);

    context.save();
    context.imageSmoothingEnabled = false;
    this.drawShadow(context, cx, feetY);
    context.fillStyle = this.color;

    switch (this.state.action) {
      case "slide":
        this.drawSlide(context, cx, feetY, false);
        break;
      case "lowSlide":
        this.drawSlide(context, cx, feetY, true);
        break;
      case "duck":
        this.drawDuck(context, cx, feetY);
        break;
      case "airDive":
        this.drawAirDive(context, cx, feetY);
        break;
      case "groundSlam":
        this.drawGroundSlam(context, cx, feetY);
        break;
      case "slamLanding":
        this.drawSlamLanding(context, cx, feetY);
        break;
      case "run":
        this.drawStanding(context, cx, feetY, "run", phase);
        break;
      case "jump":
      case "doubleJump":
        this.drawStanding(context, cx, feetY, this.state.action, phase);
        break;
      case "idle":
      default:
        this.drawStanding(context, cx, feetY, "idle", phase);
        break;
    }

    if (showName) {
      this.drawName(context, cx, screenY);
    }
    context.restore();
  }

  private drawStanding(
    context: CanvasRenderingContext2D,
    cx: number,
    feetY: number,
    action: PlayerAction,
    phase: number,
  ): void {
    const f = this.state.facing;
    const bob = action === "run" ? Math.round(phase * 2) : action === "idle" ? Math.round(phase * 0.8) : -2;
    const stride = action === "run" ? (phase >= 0 ? 1 : -1) : 0;
    const jumpTuck = action === "doubleJump" ? 4 : action === "jump" ? 2 : 0;

    this.drawHead(context, cx + f * 2, feetY - 49 + bob + jumpTuck);
    this.rect(context, cx - 7, feetY - 31 + bob + jumpTuck, 14, 20 - jumpTuck);

    this.rect(context, cx + f * 5, feetY - 29 + bob, f * 18, 6);
    this.rect(context, cx - f * 10, feetY - 28 + bob, f * -14, 6);
    this.rect(context, cx + f * 18, feetY - 24 + bob, 8, 8);
    this.rect(context, cx - f * 22, feetY - 22 + bob, 8, 8);

    this.rect(context, cx - 7, feetY - 13 + jumpTuck, 8, 13 - jumpTuck);
    this.rect(context, cx + 1, feetY - 13 + jumpTuck, 8, 13 - jumpTuck);

    const frontLeg = f * (8 + stride * 4);
    const backLeg = -f * (9 + stride * 3);
    this.rect(context, cx + frontLeg - 3, feetY - 6, 14 * f, 6);
    this.rect(context, cx + backLeg - 3, feetY - 6, -11 * f, 6);
  }

  private drawSlide(context: CanvasRenderingContext2D, cx: number, feetY: number, low: boolean): void {
    const f = this.state.facing;
    const bodyY = feetY - (low ? 19 : 24);

    this.drawHead(context, cx + f * 15, bodyY - 17);
    this.rect(context, cx - 12, bodyY - 2, 30, low ? 11 : 14);
    this.rect(context, cx + f * 16, bodyY + 1, f * 20, 6);
    this.rect(context, cx - f * 16, bodyY + 4, f * -18, 6);

    this.rect(context, cx + f * 5, feetY - 9, f * 34, 7);
    this.rect(context, cx - f * 8, feetY - 8, f * -20, 7);
    if (low) {
      this.rect(context, cx + f * 31, feetY - 5, f * 14, 5);
    }
  }

  private drawDuck(context: CanvasRenderingContext2D, cx: number, feetY: number): void {
    const f = this.state.facing;
    this.drawHead(context, cx + f * 2, feetY - 38);
    this.rect(context, cx - 9, feetY - 22, 18, 15);
    this.rect(context, cx + f * 5, feetY - 19, f * 18, 6);
    this.rect(context, cx - f * 7, feetY - 18, f * -16, 6);
    this.rect(context, cx - 12, feetY - 9, 24, 7);
    this.rect(context, cx + f * 9, feetY - 5, f * 16, 5);
  }

  private drawAirDive(context: CanvasRenderingContext2D, cx: number, feetY: number): void {
    const f = this.state.facing;
    this.drawHead(context, cx + f * 18, feetY - 41);
    this.rect(context, cx - 5, feetY - 35, f * 24, 10);
    this.rect(context, cx + f * 18, feetY - 31, f * 21, 6);
    this.rect(context, cx - f * 10, feetY - 32, f * -20, 6);
    this.rect(context, cx - f * 9, feetY - 24, f * -23, 7);
    this.rect(context, cx - f * 2, feetY - 17, f * -20, 7);
  }

  private drawGroundSlam(context: CanvasRenderingContext2D, cx: number, feetY: number): void {
    const f = this.state.facing;
    this.drawHead(context, cx, feetY - 49);
    this.rect(context, cx - 8, feetY - 32, 16, 24);
    this.rect(context, cx - 24, feetY - 36, 15, 6);
    this.rect(context, cx + 9, feetY - 36, 15, 6);
    this.rect(context, cx - 7, feetY - 10, 7, 10);
    this.rect(context, cx + 1, feetY - 10, 7, 10);
    this.rect(context, cx + f * 5, feetY - 3, f * 11, 5);
  }

  private drawSlamLanding(context: CanvasRenderingContext2D, cx: number, feetY: number): void {
    const f = this.state.facing;
    this.drawHead(context, cx + f * 2, feetY - 35);
    this.rect(context, cx - 11, feetY - 20, 22, 15);
    this.rect(context, cx + f * 7, feetY - 18, f * 21, 6);
    this.rect(context, cx - f * 7, feetY - 17, f * -19, 6);
    this.rect(context, cx - 18, feetY - 7, 36, 7);
    this.rect(context, cx + f * 13, feetY - 3, f * 15, 5);
    this.rect(context, cx - f * 13, feetY - 3, f * -15, 5);
  }

  private drawHead(context: CanvasRenderingContext2D, cx: number, y: number): void {
    this.rect(context, cx - 8, y, 16, 4);
    this.rect(context, cx - 12, y + 4, 24, 12);
    this.rect(context, cx - 8, y + 16, 16, 4);
  }

  private drawShadow(context: CanvasRenderingContext2D, cx: number, feetY: number): void {
    context.fillStyle = "rgba(0, 0, 0, 0.42)";
    this.rect(context, cx - 21, feetY - 2, 42, 5);
    context.fillStyle = this.color;
  }

  private drawName(context: CanvasRenderingContext2D, cx: number, topY: number): void {
    context.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(0, 0, 0, 0.82)";
    context.strokeText(this.name, cx, topY - 6);
    context.fillStyle = "#ffffff";
    context.fillText(this.name, cx, topY - 6);
  }

  private rect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    let nextX = x;
    let nextWidth = width;
    if (nextWidth < 0) {
      nextX += nextWidth;
      nextWidth = Math.abs(nextWidth);
    }
    context.fillRect(Math.round(nextX), Math.round(y), Math.round(nextWidth), Math.round(height));
  }
}
