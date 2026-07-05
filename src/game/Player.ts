import {
  DEFAULT_PHYSICS,
  createPlayerState,
  stepPlayer,
  type InputFrame,
  type PlayerPhysicsState,
} from "./Physics";
import type { PlayerNetState } from "../net/NetTypes";

export class Player {
  state: PlayerPhysicsState;
  private sequence = 0;

  constructor(
    id: string,
    label: string,
    x: number,
    private readonly color: string,
    private readonly trim: string,
  ) {
    this.state = createPlayerState(id, x, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height, label);
  }

  update(input: InputFrame, dt: number): void {
    this.state = stepPlayer(this.state, input, dt);
  }

  applyNetState(state: PlayerNetState): void {
    this.state = {
      ...this.state,
      id: state.id,
      label: state.label,
      x: state.x,
      y: state.y,
      velocityX: state.velocityX,
      velocityY: state.velocityY,
      facing: state.facing,
      grounded: state.grounded,
      sliding: state.sliding,
    };
  }

  toNetState(now: number): PlayerNetState {
    this.sequence += 1;
    return {
      id: this.state.id,
      label: this.state.label,
      x: this.state.x,
      y: this.state.y,
      velocityX: this.state.velocityX,
      velocityY: this.state.velocityY,
      facing: this.state.facing,
      grounded: this.state.grounded,
      sliding: this.state.sliding,
      sequence: this.sequence,
      sentAt: now,
    };
  }

  draw(context: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
    const screenX = Math.round(this.state.x - cameraX);
    const screenY = Math.round(this.state.y - cameraY);
    const directionOffset = this.state.facing === 1 ? 5 : -5;

    context.save();
    context.imageSmoothingEnabled = false;
    context.fillStyle = "rgba(0, 0, 0, 0.45)";
    context.fillRect(screenX - 4, screenY + this.state.height - 2, this.state.width + 8, 5);

    if (this.state.sliding) {
      context.fillStyle = this.trim;
      context.fillRect(screenX - this.state.facing * 20, screenY + this.state.height - 12, 22, 4);
      context.fillRect(screenX - this.state.facing * 34, screenY + this.state.height - 8, 16, 3);
    }

    context.fillStyle = this.color;
    context.fillRect(screenX + 8, screenY + 14, 16, 24);
    context.fillRect(screenX + 10 + directionOffset, screenY + 38, 8, 10);
    context.fillRect(screenX + 8 - directionOffset, screenY + 38, 8, 10);

    context.fillStyle = this.trim;
    context.fillRect(screenX + 7, screenY + 6, 18, 12);
    context.fillRect(screenX + (this.state.facing === 1 ? 20 : 5), screenY + 10, 4, 4);
    context.fillRect(screenX + 5, screenY + 20, 6, 8);
    context.fillRect(screenX + 21, screenY + 20, 6, 8);

    context.fillStyle = "#ffffff";
    context.font = "12px monospace";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(this.state.label, screenX + this.state.width / 2, screenY - 5);
    context.restore();
  }
}
