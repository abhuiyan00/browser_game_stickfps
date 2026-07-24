import type { PlayerInput, Vec3 } from "../net/messages";

/** Everything a bot perceives on a tick — assembled by the Room from authoritative state. */
export interface BotView {
  /** The bot's own eye-height position. */
  position: Vec3;
  /** Horizontal speed (m/s). */
  speed: number;
  onGround: boolean;
  hp: number;
  /** Alive opponents, eye-height positions. */
  enemies: readonly { position: Vec3 }[];
  /** True only during the action phase — bots hold fire and idle otherwise. */
  canEngage: boolean;
  /** True when the equipped weapon is ready to fire (idle & has ammo). */
  weaponReady: boolean;
  /** True when the equipped weapon is out of ammo and not already reloading. */
  weaponEmpty: boolean;
}

export interface BotDecision {
  input: PlayerInput;
  /** Set when the bot pulls the trigger this tick — a normalized world direction from its muzzle. */
  fireDirection?: Vec3;
  /** Set when the bot wants to start a reload. */
  reload?: boolean;
}

const TURN_RATE = 7; // rad/s the aim slews toward a target (a natural turn, not a snap)
const AIM_TOLERANCE = 0.13; // rad — must be roughly on-target before pulling the trigger
const BODY_Y = -0.55; // aim offset from the tracked eye down to the torso centre (see hitValidation ZONES)

/**
 * Single difficulty knob (0..1). Higher = deadlier: tighter aim and faster
 * reactions. Lower it to make bots easier, raise it for a real fight.
 */
const DIFFICULTY = 0.7;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Server-side opponent AI. One instance per bot; `decide` runs every tick with
 * the current authoritative view and returns intents only — the Room feeds them
 * through the same movement/fire/reload paths a human's inputs use, so a bot is
 * never more authoritative than a player (it can't bypass cooldowns, ammo, hit
 * detection, or round phases).
 *
 * Behaviour is deliberately SIMPLE and readable: after a short reaction delay,
 * acquire the nearest enemy, turn to face it, walk to hold a preferred stand-off
 * range (advance if far, back off if close — no circle-strafing or hopping), and
 * fire when roughly aligned and the weapon is ready, with a per-bot aim error so
 * bots miss like players rather than headshot like aimbots. All randomness is
 * injected so the sim stays deterministic under test.
 */
export class BotBrain {
  private yaw: number;
  private reactionRemaining = 0;
  private hasTarget = false;
  private readonly accuracy: number; // 0..1, higher = tighter grouping
  private readonly preferredRange: number; // metres to hold from a target

  constructor(private rng: () => number = Math.random) {
    this.yaw = rng() * Math.PI * 2;
    // Easier bots (low DIFFICULTY) get looser aim; deadlier bots group tighter.
    this.accuracy = 0.4 + rng() * 0.3 * DIFFICULTY; // ~0.40 .. 0.61 at DIFFICULTY 0.7
    this.preferredRange = 7 + rng() * 6; // 7 .. 13 m
  }

  decide(dt: number, view: BotView): BotDecision {
    const input: PlayerInput = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      crouch: false,
      yaw: this.yaw,
      clientTick: 0,
    };

    const target = this.nearestEnemy(view);
    if (view.hp <= 0 || !view.canEngage || !target) {
      // Idle: hold position and re-arm the reaction delay (longer when easier), so
      // the next engagement starts with a human-like beat.
      this.hasTarget = false;
      this.reactionRemaining = 0.28 + this.rng() * 0.3 * (1.3 - DIFFICULTY);
      return { input };
    }

    this.hasTarget = true;
    this.reactionRemaining = Math.max(0, this.reactionRemaining - dt);

    const dx = target.position[0] - view.position[0];
    const dz = target.position[2] - view.position[2];
    const dist = Math.hypot(dx, dz) || 0.0001;

    // Face the target: slew the current yaw toward it at a capped rate.
    const targetYaw = Math.atan2(-dx, -dz);
    const turn = wrapAngle(targetYaw - this.yaw);
    this.yaw = wrapAngle(this.yaw + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn)));
    input.yaw = this.yaw;

    // Simple movement: just hold a stand-off range — walk in if far, back off if
    // close. No strafing, no jumping.
    if (dist > this.preferredRange + 1.5) input.forward = true;
    else if (dist < this.preferredRange - 1.5) input.backward = true;

    // Shooting: reload if dry; otherwise fire once the reaction beat has passed,
    // the aim is roughly on-target, and the weapon is off cooldown.
    if (view.weaponEmpty) return { input, reload: true };
    const aligned = Math.abs(turn) < AIM_TOLERANCE;
    if (this.reactionRemaining <= 0 && aligned && view.weaponReady) {
      return { input, fireDirection: this.aimAt(target.position, view.position) };
    }
    return { input };
  }

  private nearestEnemy(view: BotView): { position: Vec3 } | null {
    let best: { position: Vec3 } | null = null;
    let bestDist = Infinity;
    for (const enemy of view.enemies) {
      const d = Math.hypot(enemy.position[0] - view.position[0], enemy.position[2] - view.position[2]);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  /** Aim at the target's torso plus a per-bot random error, so bots spray and bodyshot like players (occasionally lining up a head). */
  private aimAt(targetPos: Vec3, muzzle: Vec3): Vec3 {
    const miss = (1 - this.accuracy) * 1.0; // metres of scatter around the aim point (bigger when easier)
    const highAim = this.rng() < 0.15 ? 0.5 : 0; // now and then, lift the line into the head zone
    const tx = targetPos[0] + (this.rng() * 2 - 1) * miss;
    const ty = targetPos[1] + BODY_Y + (this.rng() * 2 - 1) * miss + highAim;
    const tz = targetPos[2] + (this.rng() * 2 - 1) * miss;
    const dx = tx - muzzle[0];
    const dy = ty - muzzle[1];
    const dz = tz - muzzle[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    return [dx / len, dy / len, dz / len];
  }
}
