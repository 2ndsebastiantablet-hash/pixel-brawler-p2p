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
  downPressed: false,
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

  it("prioritizes S plus Shift on the ground as a longer low slide", () => {
    const player = createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height);

    const lowSliding = stepPlayer(player, { ...neutralInput, down: true, downPressed: true, dashPressed: true }, 1 / 60);

    expect(lowSliding.action).toBe("lowSlide");
    expect(lowSliding.sliding).toBe(true);
    expect(lowSliding.slideTimer).toBe(DEFAULT_PHYSICS.lowSlideDuration);
    expect(lowSliding.velocityX).toBe(DEFAULT_PHYSICS.lowSlideSpeed);
  });

  it("ducks on the ground with S and slows horizontal movement", () => {
    const player = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height),
      velocityX: DEFAULT_PHYSICS.maxRunSpeed,
    };

    const ducking = stepPlayer(player, { ...neutralInput, down: true, right: true }, 1 / 60);

    expect(ducking.action).toBe("duck");
    expect(ducking.ducking).toBe(true);
    expect(ducking.velocityX).toBeLessThan(DEFAULT_PHYSICS.maxRunSpeed);
  });

  it("uses Shift in the air as a quick diagonal air dive", () => {
    const airborne = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height - 120),
      grounded: false,
      velocityY: 0,
      jumpsUsed: 1,
    };

    const diving = stepPlayer(airborne, { ...neutralInput, right: true, dashPressed: true }, 1 / 60);

    expect(diving.action).toBe("airDive");
    expect(diving.airDiving).toBe(true);
    expect(diving.airDiveUsed).toBe(true);
    expect(diving.velocityX).toBeGreaterThan(DEFAULT_PHYSICS.maxRunSpeed);
    expect(diving.velocityY).toBe(DEFAULT_PHYSICS.airDiveVelocityY);
  });

  it("uses Wings flight config for lift, glide, dive, and movement-only air burst", () => {
    const wingFlight = {
      enabled: true,
      liftAcceleration: 1900,
      climbAcceleration: 520,
      glideGravityScale: 0.34,
      diveAcceleration: 1450,
      maxRiseSpeed: -620,
      maxFallSpeed: 620,
      horizontalAccelerationScale: 1.45,
      airBurstSpeed: 780,
      airBurstVerticalSpeed: -160,
      airBurstCooldown: 0.7,
    };
    const config = { ...DEFAULT_PHYSICS, wingFlight };
    const airborne = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height - 140),
      grounded: false,
      coyoteTimer: 0,
      jumpsUsed: 2,
      velocityX: 0,
      velocityY: 120,
    };

    const lifting = stepPlayer(airborne, { ...neutralInput, jumpHeld: true, up: true, right: true }, 1 / 30, config);
    expect(lifting.velocityY).toBeLessThan(airborne.velocityY);
    expect(lifting.velocityX).toBeGreaterThan(0);
    expect(lifting.wingFlapping).toBe(true);

    const normalFall = stepPlayer(airborne, neutralInput, 1 / 30);
    const gliding = stepPlayer(airborne, neutralInput, 1 / 30, config);
    expect(gliding.velocityY).toBeLessThan(normalFall.velocityY);
    expect(gliding.wingGliding).toBe(true);

    const diving = stepPlayer(airborne, { ...neutralInput, down: true }, 1 / 30, config);
    expect(diving.velocityY).toBeGreaterThan(gliding.velocityY);
    expect(diving.wingDiving).toBe(true);
    expect(diving.groundSlamming).toBe(false);

    const bursting = stepPlayer(airborne, { ...neutralInput, right: true, dashPressed: true }, 1 / 60, config);
    expect(bursting.airDiving).toBe(false);
    expect(bursting.velocityX).toBeGreaterThan(DEFAULT_PHYSICS.airDiveVelocityX);
    expect(bursting.velocityY).toBeLessThan(airborne.velocityY);
    expect(bursting.wingBurstCooldown).toBeGreaterThan(0);
  });

  it("lets temporary angel wings reuse Wings flight after Virgin Blood revival", () => {
    const angelWingFlight = {
      enabled: true,
      liftAcceleration: 1900,
      climbAcceleration: 520,
      glideGravityScale: 0.34,
      diveAcceleration: 1450,
      maxRiseSpeed: -620,
      maxFallSpeed: 620,
      horizontalAccelerationScale: 1.45,
      airBurstSpeed: 780,
      airBurstVerticalSpeed: -160,
      airBurstCooldown: 0.7,
    };
    const revived = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height - 160),
      grounded: false,
      coyoteTimer: 0,
      jumpsUsed: 2,
      velocityX: 0,
      velocityY: 90,
    };

    const flapping = stepPlayer(revived, { ...neutralInput, jumpHeld: true, up: true }, 1 / 30, { ...DEFAULT_PHYSICS, wingFlight: angelWingFlight });

    expect(flapping.wingFlapping).toBe(true);
    expect(flapping.velocityY).toBeLessThan(revived.velocityY);
  });

  it("uses S in the air as a ground slam and recovers on landing", () => {
    const airborne = {
      ...createPlayerState("p1", 0, DEFAULT_PHYSICS.groundY - DEFAULT_PHYSICS.height - 12),
      grounded: false,
      velocityY: 0,
      jumpsUsed: 1,
    };

    const slamming = stepPlayer(airborne, { ...neutralInput, down: true, downPressed: true }, 1 / 60);
    expect(slamming.action).toBe("groundSlam");
    expect(slamming.groundSlamming).toBe(true);
    expect(slamming.velocityY).toBe(DEFAULT_PHYSICS.groundSlamVelocity);

    const landed = stepPlayer(slamming, neutralInput, 1 / 30);
    expect(landed.grounded).toBe(true);
    expect(landed.action).toBe("slamLanding");
    expect(landed.justSlamLanded).toBe(true);
    expect(landed.slamRecoveryTimer).toBeGreaterThan(0);
  });
});
