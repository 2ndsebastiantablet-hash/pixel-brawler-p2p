import type { InputFrame } from "./Physics";

const trackedKeys = new Set([
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyR",
  "KeyQ",
  "KeyE",
  "KeyF",
  "KeyG",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
]);

export interface CombatInputFrame {
  mouseX: number;
  mouseY: number;
  primaryPressed: boolean;
  primaryHeld: boolean;
  primaryReleased: boolean;
  secondaryPressed: boolean;
  secondaryHeld: boolean;
  secondaryReleased: boolean;
  reloadPressed: boolean;
  previousWeaponPressed: boolean;
  nextWeaponPressed: boolean;
  pickupPressed: boolean;
  dropPressed: boolean;
  weaponSlotPressed: number | null;
}

export class InputController {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly mouseHeld = new Set<number>();
  private readonly mousePressed = new Set<number>();
  private readonly mouseReleased = new Set<number>();
  private mouseX = 0;
  private mouseY = 0;

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
    this.target.addEventListener("mousemove", this.handleMouseMove);
    this.target.addEventListener("mousedown", this.handleMouseDown);
    this.target.addEventListener("mouseup", this.handleMouseUp);
    this.target.addEventListener("contextmenu", this.handleContextMenu);
    this.target.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("mousemove", this.handleMouseMove);
    this.target.removeEventListener("mousedown", this.handleMouseDown);
    this.target.removeEventListener("mouseup", this.handleMouseUp);
    this.target.removeEventListener("contextmenu", this.handleContextMenu);
    this.target.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  consumeFrame(): InputFrame {
    const frame: InputFrame = {
      left: this.held.has("KeyA"),
      right: this.held.has("KeyD"),
      up: this.held.has("KeyW"),
      down: this.held.has("KeyS"),
      downPressed: this.pressed.has("KeyS"),
      jumpPressed: this.pressed.has("Space"),
      jumpHeld: this.held.has("Space"),
      dashPressed: this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"),
    };
    return frame;
  }

  consumeCombatFrame(): CombatInputFrame {
    const slot = getPressedSlot(this.pressed);
    const frame: CombatInputFrame = {
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      primaryPressed: this.mousePressed.has(0),
      primaryHeld: this.mouseHeld.has(0),
      primaryReleased: this.mouseReleased.has(0),
      secondaryPressed: this.mousePressed.has(2),
      secondaryHeld: this.mouseHeld.has(2),
      secondaryReleased: this.mouseReleased.has(2),
      reloadPressed: this.pressed.has("KeyR"),
      previousWeaponPressed: this.pressed.has("KeyQ"),
      nextWeaponPressed: this.pressed.has("KeyE"),
      pickupPressed: this.pressed.has("KeyF"),
      dropPressed: this.pressed.has("KeyG"),
      weaponSlotPressed: slot,
    };
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
    return frame;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isUiEditingTarget(event.target)) {
      return;
    }
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
    if (isUiEditingTarget(event.target)) {
      return;
    }
    if (!trackedKeys.has(event.code)) {
      return;
    }
    event.preventDefault();
    this.held.delete(event.code);
    this.pressed.delete(event.code);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (isUiTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.mouseHeld.add(event.button);
    this.mousePressed.add(event.button);
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (isUiTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.mouseHeld.delete(event.button);
    this.mouseReleased.add(event.button);
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (isUiTarget(event.target)) {
      return;
    }
    event.preventDefault();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clear();
    }
  };

  private readonly clear = (): void => {
    this.held.clear();
    this.pressed.clear();
    this.mouseHeld.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
  };
}

function getPressedSlot(pressed: Set<string>): number | null {
  for (let index = 1; index <= 9; index += 1) {
    if (pressed.has(`Digit${index}`)) {
      return index - 1;
    }
  }
  return null;
}

function isUiEditingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function isUiTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, button, .menu-overlay, .pause-overlay"));
}
