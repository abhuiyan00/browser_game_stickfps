/**
 * Tiny damped-spring integrator — the backbone of the "advanced" viewmodel and
 * stickman animation. A spring turns a target value into motion with real
 * weight: it accelerates toward the target, overshoots, and settles, instead of
 * snapping or lerping linearly. That overshoot-and-settle is most of what reads
 * as "AAA game feel" on a recoil kick, a weapon draw, a landing squash, or a
 * limb flopping in a death topple.
 *
 * State is per-instance (one {@link Spring} per animated channel), so unlike the
 * screen-shake / crosshair buses these are plain objects held in a `useRef`, not
 * a module singleton. Purely cosmetic — springs never touch game state.
 *
 * The math is a standard second-order system `x'' = k·(target − x) − c·x'`:
 *   - `stiffness` (k) is how hard it pulls toward the target (ω² — higher = snappier).
 *   - `damping` (c) bleeds velocity. Critical damping is `2·√k`; below that the
 *     spring overshoots (the flavour we usually want), above it it eases in flat.
 */
export interface Spring {
  /** Current value — read this each frame to drive a transform. */
  value: number;
  /** Current rate of change. Carries momentum between frames and across impulses. */
  velocity: number;
}

export function createSpring(value = 0): Spring {
  return { value, velocity: 0 };
}

// Fixed sub-step for the integrator. Semi-implicit Euler on a spring stays
// stable while dt < ~2/√k; at k=280 that's ~0.12s, but sub-stepping at a fixed
// 1/240s keeps stiff springs identical regardless of framerate (30fps and
// 144fps settle the same) and immune to the odd long frame.
const SUBSTEP = 1 / 240;
// Ignore frames longer than this (tab-out, GC pause) so the spring resumes from
// rest-ish instead of violently catching up on hundreds of ms of "force".
const MAX_FRAME = 0.05;

/**
 * Advance `spring` toward `target` by `dt` seconds and return the new value.
 * Sub-steps internally, so pass the raw frame delta.
 */
export function stepSpring(spring: Spring, target: number, stiffness: number, damping: number, dt: number): number {
  let remaining = Math.min(dt, MAX_FRAME);
  while (remaining > 0) {
    const h = remaining < SUBSTEP ? remaining : SUBSTEP;
    const accel = (target - spring.value) * stiffness - spring.velocity * damping;
    spring.velocity += accel * h;
    spring.value += spring.velocity * h;
    remaining -= h;
  }
  return spring.value;
}

/** Kick the spring's velocity — a fire recoil, a weapon whip on draw, a hit. */
export function impulseSpring(spring: Spring, deltaVelocity: number): void {
  spring.velocity += deltaVelocity;
}

/** Snap to a value with no residual motion — reuse a pooled spring for a new corpse, reset on round change. */
export function resetSpring(spring: Spring, value = 0): void {
  spring.value = value;
  spring.velocity = 0;
}
