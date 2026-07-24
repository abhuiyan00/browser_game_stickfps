import type { HitZone, Vec3, WeaponId } from "../net/messages";

export const MAX_RANGE = 200; // meters
export const MAX_ORIGIN_DRIFT = 2; // meters — tolerance between client-reported and server-authoritative shooter position

/** Damage multiplier per hit zone (Deadshot-style headshots). */
export const ZONE_MULT: Record<HitZone, number> = {
  head: 2.5, // a clean headshot rewards precise aim without one-tapping full-HP targets with the pistol
  body: 1.0,
  legs: 0.85,
};

/**
 * Base per-ray damage (both current weapons fire a single ray; multi-pellet
 * support lives on in WEAPON_ACCURACY.pellets). Zone multipliers apply on top.
 *
 * This is the enforced copy (C1). The client never computes damage.
 */
export const WEAPON_DAMAGE: Record<WeaponId, number> = {
  revolver: 26,
  kar98: 100,
};

/**
 * Hitbox zones as (yOffset, radius) spheres relative to the tracked eye
 * position (MovementState.position, whose y is the eye/camera height). They
 * mirror the visible stickman: RemotePlayers draws it feet-on-ground at
 * position.y - 1.6, with its head sphere at local 1.55 (world position.y - 0.05),
 * torso below, legs beneath — so aiming at what you see lands the matching zone.
 * Anchoring to the authoritative eye means a crouched player's head drops too.
 * Ordered head-first so an exact tie in distance resolves in the shooter's favour.
 */
interface ZoneSphere {
  zone: HitZone;
  yOffset: number;
  radius: number;
}
const ZONES: readonly ZoneSphere[] = [
  { zone: "head", yOffset: -0.05, radius: 0.22 },
  { zone: "body", yOffset: -0.55, radius: 0.34 },
  { zone: "legs", yOffset: -1.15, radius: 0.3 },
];

export interface HitCandidate {
  playerId: string;
  position: Vec3; // eye-height position, as tracked by MovementState
}

export interface RaycastHit {
  playerId: string;
  zone: HitZone;
  point: Vec3;
  distance: number;
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Returns the nearest positive intersection distance along the ray, or null. */
export function intersectRaySphere(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | null {
  const oc = sub(origin, center);
  const b = dot(oc, direction);
  const c = dot(oc, oc) - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;

  const sqrtDisc = Math.sqrt(discriminant);
  const t0 = -b - sqrtDisc;
  if (t0 >= 0) return t0;
  const t1 = -b + sqrtDisc;
  return t1 >= 0 ? t1 : null;
}

/**
 * Rejects a fire request whose reported muzzle origin is implausibly far
 * from the shooter's server-tracked position — otherwise a modified client
 * could raycast from anywhere it likes (C1 aim-spoofing vector).
 */
export function isOriginPlausible(reportedOrigin: Vec3, actualPosition: Vec3): boolean {
  const dx = reportedOrigin[0] - actualPosition[0];
  const dy = reportedOrigin[1] - actualPosition[1];
  const dz = reportedOrigin[2] - actualPosition[2];
  return Math.hypot(dx, dy, dz) <= MAX_ORIGIN_DRIFT;
}

/**
 * The only function in this codebase that decides which player a shot hit and
 * where it landed (C1). Tests every zone sphere of every candidate and returns
 * the nearest surface intersection along the ray — so a head in front of a
 * torso registers the head, and a nearer player shields one behind them.
 */
export function raycastPlayers(origin: Vec3, direction: Vec3, candidates: HitCandidate[]): RaycastHit | null {
  const dir = normalize(direction);
  let closest: RaycastHit | null = null;

  for (const candidate of candidates) {
    for (const zone of ZONES) {
      const center: Vec3 = [candidate.position[0], candidate.position[1] + zone.yOffset, candidate.position[2]];
      const distance = intersectRaySphere(origin, dir, center, zone.radius);
      if (distance === null || distance > MAX_RANGE) continue;
      if (closest === null || distance < closest.distance) {
        closest = {
          playerId: candidate.playerId,
          zone: zone.zone,
          distance,
          point: [origin[0] + dir[0] * distance, origin[1] + dir[1] * distance, origin[2] + dir[2] * distance],
        };
      }
    }
  }

  return closest;
}
