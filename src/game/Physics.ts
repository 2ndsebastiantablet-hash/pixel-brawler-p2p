export type Facing = -1 | 1;

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
}

export interface PhysicsConfig {
  width: number;
  height: number;
  groundY: number;
  gravity: number;
  maxRunSpeed: number;
  acceleration: number;
  airAcceleration: number;
  deceleration: number;
  jumpVelocity: number;
  doubleJumpVelocity: number;
  coyoteTime: number;
  jumpBufferTime: number;
  slideSpeed: number;
  slideDuration: number;
  slideCooldown: number;
}

export interface PlayerPhysicsState {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  facing: Facing;
  grounded: boolean;
  sliding: boolean;
  slideTimer: number;
  slideCooldownTimer: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumpsUsed: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  width: 32,
  height: 48,
  groundY: 360,
  gravity: 2200,
  maxRunSpeed: 520,
  acceleration: 4200,
  airAcceleration: 2800,
  deceleration: 3400,
  jumpVelocity: -760,
  doubleJumpVelocity: -690,
  coyoteTime: 0.095,
  jumpBufferTime: 0.11,
  slideSpeed: 820,
  slideDuration: 0.18,
  slideCooldown: 0.36,
};

export function createPlayerState(id: string, x: number, y: number, label = "P1"): PlayerPhysicsState {
  return {
    id,
    label,
    x,
    y,
    width: DEFAULT_PHYSICS.width,
    height: DEFAULT_PHYSICS.height,
    velocityX: 0,
    velocityY: 0,
    facing: 1,
    grounded: true,
    sliding: false,
    slideTimer: 0,
    slideCooldownTimer: 0,
    coyoteTimer: DEFAULT_PHYSICS.coyoteTime,
    jumpBufferTimer: 0,
    jumpsUsed: 0,
  };
}

export function stepPlayer(
  current: PlayerPhysicsState,
  input: InputFrame,
  rawDt: number,
  config: PhysicsConfig = DEFAULT_PHYSICS,
): PlayerPhysicsState {
  const dt = Math.min(Math.max(rawDt, 0), 1 / 20);
  const next: PlayerPhysicsState = { ...current };

  next.slideTimer = Math.max(0, next.slideTimer - dt);
  next.slideCooldownTimer = Math.max(0, next.slideCooldownTimer - dt);
  next.jumpBufferTimer = input.jumpPressed
    ? config.jumpBufferTime
    : Math.max(0, next.jumpBufferTimer - dt);
  next.coyoteTimer = next.grounded ? config.coyoteTime : Math.max(0, next.coyoteTimer - dt);

  const horizontalIntent = Number(input.right) - Number(input.left);
  if (horizontalIntent !== 0) {
    next.facing = horizontalIntent > 0 ? 1 : -1;
  }

  const canStartSlide = input.dashPressed && next.grounded && next.slideCooldownTimer === 0;
  if (canStartSlide) {
    const slideDirection = horizontalIntent === 0 ? next.facing : horizontalIntent > 0 ? 1 : -1;
    next.facing = slideDirection;
    next.sliding = true;
    next.slideTimer = config.slideDuration;
    next.slideCooldownTimer = config.slideCooldown;
    next.velocityX = slideDirection * config.slideSpeed;
  }

  next.sliding = next.slideTimer > 0;
  if (next.sliding) {
    next.velocityX = next.facing * config.slideSpeed;
  } else if (horizontalIntent !== 0) {
    const accel = next.grounded ? config.acceleration : config.airAcceleration;
    next.velocityX = approach(next.velocityX, horizontalIntent * config.maxRunSpeed, accel * dt);
  } else {
    next.velocityX = approach(next.velocityX, 0, config.deceleration * dt);
  }

  const canGroundJump = next.grounded || next.coyoteTimer > 0;
  const canDoubleJump = !canGroundJump && next.jumpsUsed < 2;
  let jumpedThisFrame = false;
  if (next.jumpBufferTimer > 0 && (canGroundJump || canDoubleJump)) {
    applyJump(next, canGroundJump ? config.jumpVelocity : config.doubleJumpVelocity, canGroundJump ? 1 : 2);
    jumpedThisFrame = true;
  }

  if (!jumpedThisFrame) {
    next.velocityY += config.gravity * dt;
  }
  next.x += next.velocityX * dt;
  next.y += next.velocityY * dt;

  const groundTop = config.groundY - next.height;
  if (next.y >= groundTop) {
    next.x = Number(next.x.toFixed(4));
    next.y = groundTop;
    next.velocityY = 0;
    next.grounded = true;
    next.coyoteTimer = config.coyoteTime;
    next.jumpsUsed = 0;

    if (next.jumpBufferTimer > 0) {
      applyJump(next, config.jumpVelocity, 1);
      next.y = groundTop - 0.01;
    }
  } else {
    next.grounded = false;
  }

  if (!input.jumpHeld && next.velocityY < config.jumpVelocity * 0.45) {
    next.velocityY = config.jumpVelocity * 0.45;
  }

  return next;
}

function applyJump(state: PlayerPhysicsState, velocity: number, jumpsUsed: number): void {
  state.velocityY = velocity;
  state.grounded = false;
  state.sliding = false;
  state.slideTimer = 0;
  state.coyoteTimer = 0;
  state.jumpBufferTimer = 0;
  state.jumpsUsed = jumpsUsed;
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) {
    return Math.min(current + amount, target);
  }
  if (current > target) {
    return Math.max(current - amount, target);
  }
  return target;
}
