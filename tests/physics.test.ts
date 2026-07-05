import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHYSICS,
  createPlayerState,
  stepPlayer,
  type InputFrame,
} from "../src/game/Physics";

const neutralInput: InputFrame = {
  left: false,
  right: false,
  up: false,
  down: false,
  jumpPressed: false,
  jumpHeld: false,
  dashPressed: false,
};

describe("player physics", () => {
  it("accelerates right and then decelerates without stopping instantly", () => {
    const player = createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height);

    const moving = stepPlayer(player, { ...neutralInput, right: true }, 1 / 30);
    expect(moving.velocityX).toBeGreaterThan(0);
    expect(moving.velocityX).toBeLessThan(DEFAULT_PHYSICS.maxRunSpeed);

    const slowing = stepPlayer(moving, neutralInput, 1 / 60);
    expect(slowing.velocityX).toBeGreaterThan(0);
    expect(slowing.velocityX).toBeLessThan(moving.velocityX);
  });

  it("supports coyote-time jumps and one double jump", () => {
    const airborne = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height - 12),
      grounded: false,
      coyoteTimer: DEFAULT_PHYSICS.coyoteTime * 0.5,
      jumpsUsed: 0,
      velocityY: 160,
    };

    const coyoteJump = stepPlayer(airborne, { ...neutralInput, jumpPressed: true, jumpHeld: true }, 1 / 60);
    expect(coyoteJump.velocityY).toBe(DEFAULT_PHYSICS.jumpVelocity);
    expect(coyoteJump.jumpsUsed).toBe(1);

    const doubleJump = stepPlayer(
      { ...coyoteJump, jumpBufferTimer: 0, velocityY: 70 },
      { ...neutralInput, jumpPressed: true, jumpHeld: true },
      1 / 60,
    );
    expect(doubleJump.velocityY).toBe(DEFAULT_PHYSICS.doubleJumpVelocity);
    expect(doubleJump.jumpsUsed).toBe(2);

    const spent = stepPlayer(
      { ...doubleJump, jumpBufferTimer: 0, velocityY: 55 },
      { ...neutralInput, jumpPressed: true, jumpHeld: true },
      1 / 60,
    );
    expect(spent.velocityY).toBeGreaterThan(DEFAULT_PHYSICS.doubleJumpVelocity);
    expect(spent.jumpsUsed).toBe(2);
  });

  it("buffers a jump shortly before landing", () => {
    const fallingNearGround = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height - 2),
      grounded: false,
      coyoteTimer: 0,
      velocityY: 240,
      jumpsUsed: 2,
    };

    const buffered = stepPlayer(
      fallingNearGround,
      { ...neutralInput, jumpPressed: true, jumpHeld: true },
      1 / 60,
    );

    expect(buffered.grounded).toBe(false);
    expect(buffered.velocityY).toBe(DEFAULT_PHYSICS.jumpVelocity);
    expect(buffered.jumpsUsed).toBe(1);
  });

  it("starts a fast ground slide with a clear slide timer", () => {
    const player = createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height);

    const sliding = stepPlayer(player, { ...neutralInput, right: true, dashPressed: true }, 1 / 60);

    expect(sliding.sliding).toBe(true);
    expect(sliding.slideTimer).toBeGreaterThan(0);
    expect(sliding.velocityX).toBe(DEFAULT_PHYSICS.slideSpeed);
  });
});
