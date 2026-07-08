export type Facing = -1 | 1;
export type PlayerAction =
  | "idle"
  | "run"
  | "jump"
  | "doubleJump"
  | "slide"
  | "lowSlide"
  | "airDive"
  | "duck"
  | "groundSlam"
  | "slamLanding";

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  downPressed: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
}

export interface PhysicsConfig {
  width: number;
  height: number;
  groundY: number;
  platformLeft: number;
  platformRight: number;
  deathY: number;
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
  duckSpeedMultiplier: number;
  lowSlideSpeed: number;
  lowSlideDuration: number;
  lowSlideRecovery: number;
  airDiveVelocityX: number;
  airDiveVelocityY: number;
  airDiveDuration: number;
  groundSlamVelocity: number;
  slamLandingDuration: number;
  wingFlight?: WingFlightConfig;
}

export interface WingFlightConfig {
  enabled: boolean;
  liftAcceleration: number;
  climbAcceleration: number;
  glideGravityScale: number;
  diveAcceleration: number;
  maxRiseSpeed: number;
  maxFallSpeed: number;
  horizontalAccelerationScale: number;
  airBurstSpeed: number;
  airBurstVerticalSpeed: number;
  airBurstCooldown: number;
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
  action: PlayerAction;
  ducking: boolean;
  sliding: boolean;
  lowSliding: boolean;
  airDiving: boolean;
  airDiveTimer: number;
  airDiveUsed: boolean;
  groundSlamming: boolean;
  justSlamLanded: boolean;
  slideTimer: number;
  slideCooldownTimer: number;
  lowSlideRecoveryTimer: number;
  slamRecoveryTimer: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumpsUsed: number;
  wingFlapping: boolean;
  wingGliding: boolean;
  wingDiving: boolean;
  wingBurstTimer: number;
  wingBurstCooldown: number;
  wingFlapHeldMs: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  width: 32,
  height: 48,
  groundY: 360,
  platformLeft: -2200,
  platformRight: 2200,
  deathY: 820,
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
  duckSpeedMultiplier: 0.38,
  lowSlideSpeed: 880,
  lowSlideDuration: 0.34,
  lowSlideRecovery: 0.12,
  airDiveVelocityX: 620,
  airDiveVelocityY: 920,
  airDiveDuration: 0.2,
  groundSlamVelocity: 1280,
  slamLandingDuration: 0.16,
};

export const PLATFORM_LEFT = DEFAULT_PHYSICS.platformLeft;
export const PLATFORM_RIGHT = DEFAULT_PHYSICS.platformRight;
export const VOID_DEATH_Y = DEFAULT_PHYSICS.deathY;

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
    action: "idle",
    ducking: false,
    sliding: false,
    lowSliding: false,
    airDiving: false,
    airDiveTimer: 0,
    airDiveUsed: false,
    groundSlamming: false,
    justSlamLanded: false,
    slideTimer: 0,
    slideCooldownTimer: 0,
    lowSlideRecoveryTimer: 0,
    slamRecoveryTimer: 0,
    coyoteTimer: DEFAULT_PHYSICS.coyoteTime,
    jumpBufferTimer: 0,
    jumpsUsed: 0,
    wingFlapping: false,
    wingGliding: false,
    wingDiving: false,
    wingBurstTimer: 0,
    wingBurstCooldown: 0,
    wingFlapHeldMs: 0,
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

  next.justSlamLanded = false;
  next.slideTimer = Math.max(0, next.slideTimer - dt);
  next.slideCooldownTimer = Math.max(0, next.slideCooldownTimer - dt);
  next.lowSlideRecoveryTimer = Math.max(0, next.lowSlideRecoveryTimer - dt);
  next.slamRecoveryTimer = Math.max(0, next.slamRecoveryTimer - dt);
  next.airDiveTimer = Math.max(0, next.airDiveTimer - dt);
  next.wingBurstTimer = Math.max(0, (next.wingBurstTimer ?? 0) - dt);
  next.wingBurstCooldown = Math.max(0, (next.wingBurstCooldown ?? 0) - dt);
  next.wingFlapping = false;
  next.wingGliding = false;
  next.wingDiving = false;
  next.wingFlapHeldMs = input.jumpHeld ? (next.wingFlapHeldMs ?? 0) + dt * 1000 : 0;
  next.jumpBufferTimer = input.jumpPressed
    ? config.jumpBufferTime
    : Math.max(0, next.jumpBufferTimer - dt);
  next.coyoteTimer = next.grounded ? config.coyoteTime : Math.max(0, next.coyoteTimer - dt);
  next.ducking = false;

  const horizontalIntent = Number(input.right) - Number(input.left);
  if (horizontalIntent !== 0) {
    next.facing = horizontalIntent > 0 ? 1 : -1;
  }

  const canAct = next.slamRecoveryTimer === 0 && next.lowSlideRecoveryTimer === 0;
  const wings = config.wingFlight?.enabled ? config.wingFlight : undefined;
  const wantsLowSlide = input.down && input.dashPressed && next.grounded;
  const wantsGroundSlide = input.dashPressed && next.grounded && !input.down;
  const wantsAirDive = !wings && input.dashPressed && !next.grounded && !next.airDiveUsed;
  const wantsWingBurst = Boolean(wings && input.dashPressed && !next.grounded && next.wingBurstCooldown === 0);
  const wantsGroundSlam = !wings && input.downPressed && !next.grounded && !next.groundSlamming;
  const canStartSlide = wantsGroundSlide && canAct && next.slideCooldownTimer === 0;
  const canStartLowSlide = wantsLowSlide && canAct && next.slideCooldownTimer === 0;
  let startedGroundSlam = false;

  if (canStartLowSlide) {
    const slideDirection = horizontalIntent === 0 ? next.facing : horizontalIntent > 0 ? 1 : -1;
    next.facing = slideDirection;
    next.sliding = true;
    next.lowSliding = true;
    next.slideTimer = config.lowSlideDuration;
    next.slideCooldownTimer = config.slideCooldown + config.lowSlideRecovery;
    next.lowSlideRecoveryTimer = config.lowSlideRecovery;
    next.velocityX = slideDirection * config.lowSlideSpeed;
  }

  if (canStartSlide) {
    const slideDirection = horizontalIntent === 0 ? next.facing : horizontalIntent > 0 ? 1 : -1;
    next.facing = slideDirection;
    next.sliding = true;
    next.lowSliding = false;
    next.slideTimer = config.slideDuration;
    next.slideCooldownTimer = config.slideCooldown;
    next.velocityX = slideDirection * config.slideSpeed;
  }

  if (wantsAirDive && canAct) {
    const diveDirection = horizontalIntent === 0 ? next.facing : horizontalIntent > 0 ? 1 : -1;
    next.facing = diveDirection;
    next.airDiving = true;
    next.airDiveUsed = true;
    next.airDiveTimer = config.airDiveDuration;
    next.velocityX = diveDirection * config.airDiveVelocityX;
    next.velocityY = config.airDiveVelocityY;
  }

  if (wantsWingBurst && canAct && wings) {
    const burstDirection = horizontalIntent === 0 ? next.facing : horizontalIntent > 0 ? 1 : -1;
    next.facing = burstDirection;
    next.velocityX = burstDirection * wings.airBurstSpeed;
    next.velocityY = Math.min(next.velocityY, wings.airBurstVerticalSpeed);
    next.wingBurstTimer = 0.18;
    next.wingBurstCooldown = wings.airBurstCooldown;
  }

  if (wantsGroundSlam && canAct && !next.airDiving) {
    next.groundSlamming = true;
    startedGroundSlam = true;
    next.airDiving = false;
    next.airDiveTimer = 0;
    next.velocityX = approach(next.velocityX, 0, config.deceleration * dt);
    next.velocityY = config.groundSlamVelocity;
  }

  next.sliding = next.slideTimer > 0;
  if (!next.sliding) {
    next.lowSliding = false;
  }
  next.airDiving = next.airDiveTimer > 0;

  if (next.sliding) {
    next.velocityX = next.facing * (next.lowSliding ? config.lowSlideSpeed : config.slideSpeed);
  } else if (next.airDiving) {
    next.velocityX = next.facing * config.airDiveVelocityX;
    next.velocityY = Math.max(next.velocityY, config.airDiveVelocityY);
  } else if (next.groundSlamming) {
    next.velocityX = approach(next.velocityX, 0, config.deceleration * dt);
    next.velocityY = Math.max(next.velocityY, config.groundSlamVelocity);
  } else if (horizontalIntent !== 0) {
    const accel = next.grounded ? config.acceleration : config.airAcceleration;
    const speed = input.down && next.grounded ? config.maxRunSpeed * config.duckSpeedMultiplier : config.maxRunSpeed;
    const wingScale = wings && !next.grounded ? wings.horizontalAccelerationScale : 1;
    next.velocityX = approach(next.velocityX, horizontalIntent * speed, accel * wingScale * dt);
  } else {
    next.velocityX = approach(next.velocityX, 0, config.deceleration * (wings && !next.grounded ? 0.42 : 1) * dt);
  }

  if (input.down && next.grounded && !next.sliding && canAct) {
    next.ducking = true;
    next.velocityX = approach(next.velocityX, 0, config.deceleration * dt * 0.6);
  }

  const canGroundJump = next.grounded || next.coyoteTimer > 0;
  const canDoubleJump = !canGroundJump && next.jumpsUsed < 2;
  let jumpedThisFrame = false;
  if (!next.groundSlamming && next.slamRecoveryTimer === 0 && next.jumpBufferTimer > 0 && (canGroundJump || canDoubleJump)) {
    applyJump(next, canGroundJump ? config.jumpVelocity : config.doubleJumpVelocity, canGroundJump ? 1 : 2);
    jumpedThisFrame = true;
  }
  if (wings && !jumpedThisFrame && next.grounded && input.jumpHeld && next.slamRecoveryTimer === 0) {
    applyJump(next, config.jumpVelocity * 0.92, 1);
    jumpedThisFrame = true;
  }

  if (!jumpedThisFrame && !next.airDiving && !next.groundSlamming) {
    if (wings && !next.grounded) {
      if (input.down) {
        next.wingDiving = true;
        next.velocityY += (config.gravity + wings.diveAcceleration) * dt;
      } else if (input.jumpHeld) {
        next.wingFlapping = true;
        const climbBonus = input.up ? wings.climbAcceleration : 0;
        next.velocityY += (config.gravity - wings.liftAcceleration - climbBonus) * dt;
      } else {
        next.wingGliding = true;
        next.velocityY += config.gravity * wings.glideGravityScale * dt;
      }
      next.velocityY = clamp(next.velocityY, wings.maxRiseSpeed, wings.maxFallSpeed);
    } else {
      next.velocityY += config.gravity * dt;
    }
  }
  next.x += next.velocityX * dt;
  next.y += startedGroundSlam ? 0 : next.velocityY * dt;

  const groundTop = config.groundY - next.height;
  if (next.y >= groundTop && isOverPlatform(next, config)) {
    const landedFromSlam = next.groundSlamming;
    next.x = Number(next.x.toFixed(4));
    next.y = groundTop;
    next.velocityY = 0;
    next.grounded = true;
    next.airDiving = false;
    next.airDiveTimer = 0;
    next.airDiveUsed = false;
    next.groundSlamming = false;
    next.coyoteTimer = config.coyoteTime;
    next.jumpsUsed = 0;

    if (landedFromSlam) {
      next.justSlamLanded = true;
      next.slamRecoveryTimer = config.slamLandingDuration;
    } else if (next.jumpBufferTimer > 0) {
      applyJump(next, config.jumpVelocity, 1);
      next.y = groundTop - 0.01;
    }
  } else {
    next.grounded = false;
  }

  if (!input.jumpHeld && !wings && next.velocityY < config.jumpVelocity * 0.45) {
    next.velocityY = config.jumpVelocity * 0.45;
  }

  next.action = getAction(next, horizontalIntent);
  return next;
}

export function isOverPlatform(state: Pick<PlayerPhysicsState, "x" | "width">, config: PhysicsConfig = DEFAULT_PHYSICS): boolean {
  const centerX = state.x + state.width / 2;
  return centerX >= config.platformLeft && centerX <= config.platformRight;
}

function applyJump(state: PlayerPhysicsState, velocity: number, jumpsUsed: number): void {
  state.velocityY = velocity;
  state.grounded = false;
  state.sliding = false;
  state.lowSliding = false;
  state.ducking = false;
  state.groundSlamming = false;
  state.airDiving = false;
  state.airDiveTimer = 0;
  state.slideTimer = 0;
  state.coyoteTimer = 0;
  state.jumpBufferTimer = 0;
  state.jumpsUsed = jumpsUsed;
  state.action = jumpsUsed > 1 ? "doubleJump" : "jump";
}

function getAction(state: PlayerPhysicsState, horizontalIntent: number): PlayerAction {
  if (state.slamRecoveryTimer > 0 || state.justSlamLanded) {
    return "slamLanding";
  }
  if (state.groundSlamming) {
    return "groundSlam";
  }
  if (state.airDiving) {
    return "airDive";
  }
  if (state.lowSliding) {
    return "lowSlide";
  }
  if (state.sliding) {
    return "slide";
  }
  if (state.ducking) {
    return "duck";
  }
  if (!state.grounded) {
    return state.jumpsUsed > 1 ? "doubleJump" : "jump";
  }
  return horizontalIntent === 0 ? "idle" : "run";
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
