import type { Vec3, WeaponId } from "../net/messages";
import { MAX_SPEED } from "../sim/movement";

/**
 * Per-weapon accuracy profile. Spread (random cone) and recoil (a systematic
 * upward climb over a sustained burst) are both applied SERVER-SIDE to the ray
 * before it is cast — the client only shows a matching crosshair bloom and
 * camera kick for feel. Enforcing them here means a modified client can't fire
 * pixel-perfect full-auto or no-recoil sprays (C1): its reported aim direction
 * is only the starting point, and the server decides the real ray.
 *
 * Design rule that keeps the sim testable and rewards discipline: a stationary,
 * grounded FIRST shot from a hitscan weapon (baseSpread 0, recoilShots 0) is
 * perturbed by exactly nothing, so tap-firing while still is a laser.
 */
export interface WeaponAccuracy {
  /** Radians of random cone even when perfectly still & grounded (0 = first-shot laser). */
  baseSpread: number;
  /** Extra radians of random cone at full ground speed (MAX_SPEED), scaled linearly by speed. */
  moveSpread: number;
  /** Spread multiplier while airborne — feet off the ground is the least steady. */
  airMult: number;
  /** Spread multiplier while crouching or sliding — the steadiest stance. */
  crouchMult: number;
  /** Radians the muzzle climbs per sustained shot (vertical recoil), until recoilMax. */
  recoilPerShot: number;
  /** Cap on the accumulated vertical climb. */
  recoilMax: number;
  /** Rays cast per trigger pull. 1 for every current weapon; > 1 scatters like a shotgun. */
  pellets: number;
}

// Must read as the product spec; this copy is the one enforced. The client's
// weaponDefs is cosmetic. Angles are radians (0.01 rad ≈ 0.57°).
export const WEAPON_ACCURACY: Record<WeaponId, WeaponAccuracy> = {
  revolver: { baseSpread: 0, moveSpread: 0.05, airMult: 2.2, crouchMult: 0.5, recoilPerShot: 0.01, recoilMax: 0.05, pellets: 1 },
  kar98: { baseSpread: 0, moveSpread: 0.1, airMult: 3.0, crouchMult: 0.4, recoilPerShot: 0, recoilMax: 0, pellets: 1 },
};

/** Sustained fire resets to first-shot accuracy after this quiet gap (seconds). */
export const RECOIL_RESET_SEC = 0.35;

export interface AimContext {
  /** Horizontal speed in m/s. */
  speed: number;
  grounded: boolean;
  /** Crouching or sliding — the low, steady stance. */
  crouching: boolean;
  /** Shots already fired in the current burst (0 for the first). */
  recoilShots: number;
}

/** Half-angle (radians) of the random spread cone for one shot, before RNG. */
export function spreadRadians(acc: WeaponAccuracy, ctx: AimContext): number {
  let s = acc.baseSpread + acc.moveSpread * (Math.max(0, ctx.speed) / MAX_SPEED);
  if (!ctx.grounded) s *= acc.airMult;
  else if (ctx.crouching) s *= acc.crouchMult;
  return s;
}

/** Accumulated upward recoil (radians) for the Nth sustained shot, capped. */
export function recoilRadians(acc: WeaponAccuracy, recoilShots: number): number {
  return Math.min(acc.recoilMax, acc.recoilPerShot * Math.max(0, recoilShots));
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Tilts a unit-ish direction by `pitch` (up +) and `yaw` (right +) radians in the
 * ray's own local frame, so recoil climbs relative to where the player is looking
 * rather than always toward world up. Small-angle nudge + renormalize.
 */
export function perturbDirection(direction: Vec3, pitch: number, yaw: number): Vec3 {
  const dir = normalize(direction);
  // Local basis. Guard the near-vertical case where dir ∥ world-up degenerates.
  const worldUp: Vec3 = Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(dir, worldUp));
  const up = cross(right, dir); // unit: right ⟂ dir, both unit
  return normalize([
    dir[0] + right[0] * yaw + up[0] * pitch,
    dir[1] + right[1] * yaw + up[1] * pitch,
    dir[2] + right[2] * yaw + up[2] * pitch,
  ]);
}

/**
 * Builds the perturbed ray(s) for one trigger pull: `pellets` of them, each
 * kicked by recoil (systematic, up) plus a random point in the spread disc.
 * A stationary grounded first shot of a baseSpread-0 weapon returns the exact
 * input direction (spread 0, recoil 0), so hit tests stay deterministic.
 */
export function buildShotRays(
  direction: Vec3,
  acc: WeaponAccuracy,
  ctx: AimContext,
  rng: () => number = Math.random,
): Vec3[] {
  const spread = spreadRadians(acc, ctx);
  const recoil = recoilRadians(acc, ctx.recoilShots);
  const rays: Vec3[] = [];
  for (let i = 0; i < acc.pellets; i++) {
    const angle = rng() * Math.PI * 2;
    const mag = Math.sqrt(rng()) * spread; // sqrt → uniform over the disc, not clustered centre
    const yaw = Math.cos(angle) * mag;
    const pitch = Math.sin(angle) * mag + recoil;
    rays.push(perturbDirection(direction, pitch, yaw));
  }
  return rays;
}
