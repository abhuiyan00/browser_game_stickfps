import type { Team, Vec3 } from "../net/messages";

/**
 * Frag grenade — a server-simulated projectile. It arcs under its own gravity,
 * bounces off the floor and the arena walls a few times, and detonates when its
 * fuse runs out, dealing radial damage with linear falloff.
 *
 * Everything here is authoritative and self-contained (pure functions over a
 * plain state): the Room owns the live grenades, steps them each tick, and
 * broadcasts positions + a detonation event. The client only renders what it's
 * told — it never decides where a grenade is or who it hurt.
 *
 * The arena half-extent matches sim/movement.ts (the perimeter walls) so a
 * grenade can't skid outside the play space the players are boxed into.
 */
const ARENA_HALF_EXTENT = 24;

export const GRENADE_GRAVITY = -20; // m/s^2 — its own arc (players fall at -22)
export const GRENADE_THROW_SPEED = 17; // m/s along the aim direction
export const GRENADE_THROW_LIFT = 3.5; // m/s extra upward, so a flat throw still lobs
export const GRENADE_FUSE_SEC = 1.6; // time from throw to detonation
export const GRENADE_RADIUS = 0.22; // visual size + resting height above the floor
export const GRENADE_BOUNCE_DAMP = 0.42; // fraction of speed kept through a bounce
export const GRENADE_SKID_DAMP = 0.7; // horizontal speed kept each time it scrapes the floor
export const GRENADE_BLAST_RADIUS = 6.5; // m — beyond this, no damage
export const GRENADE_MAX_DAMAGE = 92; // dead-centre damage
export const GRENADE_MIN_DAMAGE = 16; // just-inside-the-edge damage (a graze still stings)
export const GRENADE_COOLDOWN_SEC = 16; // per-player throttle between throws

const FLOOR_Y = GRENADE_RADIUS;

export interface GrenadeState {
  /** Room-unique id so the client can track/interpolate each projectile. */
  id: number;
  ownerId: string;
  ownerTeam: Team;
  position: Vec3;
  velocity: Vec3;
  fuseRemaining: number;
}

/** Spawns a grenade from `origin`, launched along `direction` (any length) plus a fixed upward lob. */
export function createGrenade(id: number, ownerId: string, ownerTeam: Team, origin: Vec3, direction: Vec3): GrenadeState {
  const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const dx = direction[0] / len;
  const dy = direction[1] / len;
  const dz = direction[2] / len;
  return {
    id,
    ownerId,
    ownerTeam,
    position: [origin[0], origin[1], origin[2]],
    velocity: [dx * GRENADE_THROW_SPEED, dy * GRENADE_THROW_SPEED + GRENADE_THROW_LIFT, dz * GRENADE_THROW_SPEED],
    fuseRemaining: GRENADE_FUSE_SEC,
  };
}

/** One physics step: gravity, integrate, bounce off floor + walls, burn the fuse. Pure — returns a new state. */
export function stepGrenade(g: GrenadeState, dt: number): GrenadeState {
  const [px, py, pz] = g.position;
  let [vx, vy, vz] = g.velocity;

  vy += GRENADE_GRAVITY * dt;
  let nx = px + vx * dt;
  let ny = py + vy * dt;
  let nz = pz + vz * dt;

  // Floor: bounce the downward velocity, scrub some horizontal speed as it skids.
  if (ny <= FLOOR_Y) {
    ny = FLOOR_Y;
    if (vy < 0) vy = -vy * GRENADE_BOUNCE_DAMP;
    vx *= GRENADE_SKID_DAMP;
    vz *= GRENADE_SKID_DAMP;
  }
  // Walls: reflect and damp on each axis.
  if (nx > ARENA_HALF_EXTENT) {
    nx = ARENA_HALF_EXTENT;
    vx = -vx * GRENADE_BOUNCE_DAMP;
  } else if (nx < -ARENA_HALF_EXTENT) {
    nx = -ARENA_HALF_EXTENT;
    vx = -vx * GRENADE_BOUNCE_DAMP;
  }
  if (nz > ARENA_HALF_EXTENT) {
    nz = ARENA_HALF_EXTENT;
    vz = -vz * GRENADE_BOUNCE_DAMP;
  } else if (nz < -ARENA_HALF_EXTENT) {
    nz = -ARENA_HALF_EXTENT;
    vz = -vz * GRENADE_BOUNCE_DAMP;
  }

  return {
    ...g,
    position: [nx, ny, nz],
    velocity: [vx, vy, vz],
    fuseRemaining: g.fuseRemaining - dt,
  };
}

/**
 * Blast damage at `target` from a detonation at `center`: full at the centre,
 * falling linearly to the edge, zero beyond GRENADE_BLAST_RADIUS. Rounded to a
 * whole HP value like weapon damage.
 */
export function grenadeDamageAt(center: Vec3, target: Vec3): number {
  const d = Math.hypot(target[0] - center[0], target[1] - center[1], target[2] - center[2]);
  if (d >= GRENADE_BLAST_RADIUS) return 0;
  const t = 1 - d / GRENADE_BLAST_RADIUS; // 1 at the centre, ->0 at the edge
  return Math.round(GRENADE_MIN_DAMAGE + (GRENADE_MAX_DAMAGE - GRENADE_MIN_DAMAGE) * t);
}
