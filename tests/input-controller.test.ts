import { afterEach, describe, expect, it } from "vitest";
import { InputController } from "../src/game/Input";

describe("input controller", () => {
  let controller: InputController | null = null;

  afterEach(() => {
    controller?.dispose();
    controller = null;
    document.body.replaceChildren();
  });

  it("does not prevent mouse focus or typing events inside menu inputs", () => {
    const input = document.createElement("input");
    document.body.append(input);
    controller = new InputController(window);

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    input.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(false);

    const keyDown = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyA" });
    input.dispatchEvent(keyDown);
    expect(keyDown.defaultPrevented).toBe(false);
  });

  it("maps Q, E, and F to equipment slot actions", () => {
    controller = new InputController(window);

    const front = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyQ" });
    const back = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyE" });
    const attachment = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "KeyF" });
    window.dispatchEvent(front);
    window.dispatchEvent(back);
    window.dispatchEvent(attachment);

    expect(front.defaultPrevented).toBe(true);
    expect(back.defaultPrevented).toBe(true);
    expect(attachment.defaultPrevented).toBe(true);
    expect(controller.consumeCombatFrame()).toMatchObject({
      frontStrapPressed: true,
      backStrapPressed: true,
      attachmentPressed: true,
    });
  });

  it("keeps numbered keys out of prototype weapon-slot cycling", () => {
    controller = new InputController(window);

    const keyDown = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Digit0" });
    window.dispatchEvent(keyDown);

    expect(keyDown.defaultPrevented).toBe(true);
    expect(controller.consumeCombatFrame().weaponSlotPressed).toBeNull();
  });
});
