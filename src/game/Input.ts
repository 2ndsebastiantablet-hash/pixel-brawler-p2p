import type { InputFrame } from "./Physics";

const trackedKeys = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "Space", "ShiftLeft", "ShiftRight"]);

export class InputController {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
    this.target.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  consumeFrame(): InputFrame {
    const frame: InputFrame = {
      left: this.held.has("KeyA"),
      right: this.held.has("KeyD"),
      up: this.held.has("KeyW"),
      down: this.held.has("KeyS"),
      jumpPressed: this.pressed.has("Space"),
      jumpHeld: this.held.has("Space"),
      dashPressed: this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"),
    };
    this.pressed.clear();
    return frame;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!trackedKeys.has(event.code)) {
      return;
    }
    event.preventDefault();
    if (!event.repeat && !this.held.has(event.code)) {
      this.pressed.add(event.code);
    }
    this.held.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!trackedKeys.has(event.code)) {
      return;
    }
    event.preventDefault();
    this.held.delete(event.code);
    this.pressed.delete(event.code);
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clear();
    }
  };

  private readonly clear = (): void => {
    this.held.clear();
    this.pressed.clear();
  };
}
