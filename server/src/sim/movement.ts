import type { Vec3 } from "../net/messages";

export interface MovementState {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
  /** True while crouch-sliding (low friction, lowered stance, boosted entry). */
  sliding?: boolean;
  /** Seconds of slide left before it auto-ends. */
  slideRemaining?: number;
  /** Gate that stops a grounded slide from re-triggering forever — re-armed by leaving the ground. */
  canSlide?: boolean;
}

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Crouch / slide trigger. Optional so older callers/tests stay valid. */
  crouch?: boolean;
  yaw: number;
}

// --- Movement tuning (Krunker-style momentum). This is the server's independent
// copy of client/src/game/player/playerController.ts — intentionally duplicated
// (see docs/specs/task-4.1.md) so the server has zero dependency on client code.
// Keep the constants and stepMovement/stepPlayer bodies byte-for-byte in sync. ---
export const MAX_SPEED = 7; // m/s — ground walk cap, reached via the Quake accel projection
export const MAX_SPEED_CAP = 12; // m/s — hard ceiling on horizontal speed so slide-hop chains can't run away
export const GROUND_ACCEL = 60; // m/s^2 toward wish-dir while grounded
export const AIR_ACCEL = 8; // m/s^2 — small: air *control*, not free steering
export const AIR_WISH_SPEED = 7; // the speed air-accel projects toward (enables air-strafe up to this, no more)
export const GROUND_FRICTION = 34; // m/s^2 when grounded with no input
export const GRAVITY = -22; // m/s^2
export const JUMP_SPEED = 7.5; // m/s launch impulse
export const GROUND_Y = 1.6; // standing eye height on the ground plane (y=0)
export const CROUCH_Y = 1.0; // crouched / sliding eye height
export const CROUCH_SPEED_MULT = 0.5; // crouch-walk is slower
export const ARENA_HALF_EXTENT = 24; // playable square half-extent on X/Z (matches the client perimeter walls)
export const SLIDE_MIN_SPEED = 5; // need at least this much horizontal speed to start a slide
export const SLIDE_END_SPEED = 2.5; // a slide that decays below this ends
export const SLIDE_FRICTION = 3; // much lower than GROUND_FRICTION → momentum persists through a slide
export const SLIDE_STEER = 6; // how hard a slide can be curved toward the look direction
export const SLIDE_MAX_SEC = 0.9; // a slide auto-ends after this long
export const SLIDE_BOOST = 1.15; // one-time speed multiplier applied on slide entry

export function createInitialMovementState(position: Vec3 = [0, GROUND_Y, 0]): MovementState {
  return { position: [...position], velocity: [0, 0, 0], onGround: true, sliding: false, slideRemaining: 0, canSlide: true };
}

function clampLength2D(x: number, z: number, max: number): [number, number] {
  const lenSq = x * x + z * z;
  if (lenSq <= max * max || lenSq === 0) return [x, z];
  const scale = max / Math.sqrt(lenSq);
  return [x * scale, z * scale];
}

/**
 * Quake-style acceleration: add speed toward `dir` only up to `wishSpeed` along
 * that axis. Grounded this caps top speed at the walk cap; airborne (small accel,
 * modest wishSpeed) it lets a strafing player redirect momentum without bleeding it.
 */
function accelerate(vx: number, vz: number, dirX: number, dirZ: number, wishSpeed: number, accel: number, dt: number): [number, number] {
  const current = vx * dirX + vz * dirZ;
  const add = wishSpeed - current;
  if (add <= 0) return [vx, vz];
  const accelSpeed = Math.min(accel * dt * wishSpeed, add);
  return [vx + dirX * accelSpeed, vz + dirZ * accelSpeed];
}

function applyFriction(vx: number, vz: number, friction: number, dt: number): [number, number] {
  const speed = Math.hypot(vx, vz);
  if (speed <= 0) return [vx, vz];
  const drop = Math.min(speed, friction * dt);
  const scale = (speed - drop) / speed;
  return [vx * scale, vz * scale];
}

/**
 * Authoritative movement step — must stay identical to the client's `stepPlayer`.
 */
export function stepMovement(state: MovementState, input: MovementInput, dt: number, speedMult = 1): MovementState {
  const [px, py, pz] = state.position;
  let [vx, vy, vz] = state.velocity;

  const forwardX = -Math.sin(input.yaw);
  const forwardZ = -Math.cos(input.yaw);
  const rightX = Math.cos(input.yaw);
  const rightZ = -Math.sin(input.yaw);

  let wishX = 0;
  let wishZ = 0;
  if (input.forward) {
    wishX += forwardX;
    wishZ += forwardZ;
  }
  if (input.backward) {
    wishX -= forwardX;
    wishZ -= forwardZ;
  }
  if (input.right) {
    wishX += rightX;
    wishZ += rightZ;
  }
  if (input.left) {
    wishX -= rightX;
    wishZ -= rightZ;
  }
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  // --- Slide state machine (resolved from start-of-tick grounded state) ---
  const grounded0 = state.onGround;
  const crouch = input.crouch ?? false;
  let sliding = state.sliding ?? false;
  let slideRemaining = state.slideRemaining ?? 0;
  let canSlide = state.canSlide ?? true;
  const horizSpeed0 = Math.hypot(vx, vz);

  if (sliding) {
    slideRemaining -= dt;
    if (!crouch || !grounded0 || slideRemaining <= 0 || horizSpeed0 < SLIDE_END_SPEED) {
      sliding = false;
      slideRemaining = 0;
      if (grounded0) canSlide = false; // must leave the ground to slide again — no perpetual grounded glide
    }
  } else if (grounded0 && crouch && canSlide && horizSpeed0 >= SLIDE_MIN_SPEED) {
    sliding = true;
    slideRemaining = SLIDE_MAX_SEC;
    const boosted = Math.min(horizSpeed0 * SLIDE_BOOST, MAX_SPEED_CAP);
    const scale = boosted / horizSpeed0;
    vx *= scale;
    vz *= scale;
  }
  if (!grounded0) canSlide = true; // airborne re-arms the next slide

  // --- Horizontal acceleration / friction ---
  if (sliding) {
    [vx, vz] = applyFriction(vx, vz, SLIDE_FRICTION, dt);
    if (wishLen > 0) [vx, vz] = accelerate(vx, vz, wishX, wishZ, Math.hypot(vx, vz), SLIDE_STEER, dt);
  } else if (grounded0) {
    if (wishLen > 0) {
      const wishSpeed = (crouch ? MAX_SPEED * CROUCH_SPEED_MULT : MAX_SPEED) * speedMult;
      [vx, vz] = accelerate(vx, vz, wishX, wishZ, wishSpeed, GROUND_ACCEL, dt);
    } else {
      [vx, vz] = applyFriction(vx, vz, GROUND_FRICTION, dt);
    }
  } else if (wishLen > 0) {
    [vx, vz] = accelerate(vx, vz, wishX, wishZ, AIR_WISH_SPEED, AIR_ACCEL, dt);
  }
  [vx, vz] = clampLength2D(vx, vz, MAX_SPEED_CAP);

  // --- Vertical: jump preserves horizontal momentum (no walk clamp in the air) ---
  const stanceEye = crouch || sliding ? CROUCH_Y : GROUND_Y;
  let onGround = grounded0;
  let ny: number;
  if (grounded0 && input.jump) {
    vy = JUMP_SPEED;
    onGround = false;
    sliding = false; // leaving the ground ends the slide (slide-hop keeps the boosted speed)
    slideRemaining = 0;
    canSlide = true;
    ny = py + vy * dt;
  } else if (!grounded0) {
    vy += GRAVITY * dt;
    ny = py + vy * dt;
    if (ny <= stanceEye) {
      ny = stanceEye;
      vy = 0;
      onGround = true;
    }
  } else {
    ny = stanceEye; // glued to the ground at the current stance height
    vy = 0;
  }

  let nx = px + vx * dt;
  let nz = pz + vz * dt;
  if (nx > ARENA_HALF_EXTENT) {
    nx = ARENA_HALF_EXTENT;
    vx = 0;
  } else if (nx < -ARENA_HALF_EXTENT) {
    nx = -ARENA_HALF_EXTENT;
    vx = 0;
  }
  if (nz > ARENA_HALF_EXTENT) {
    nz = ARENA_HALF_EXTENT;
    vz = 0;
  } else if (nz < -ARENA_HALF_EXTENT) {
    nz = -ARENA_HALF_EXTENT;
    vz = 0;
  }

  return {
    position: [nx, ny, nz],
    velocity: [vx, vy, vz],
    onGround,
    sliding,
    slideRemaining,
    canSlide,
  };
}
