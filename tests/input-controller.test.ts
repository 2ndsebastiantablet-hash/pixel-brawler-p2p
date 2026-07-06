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
});
