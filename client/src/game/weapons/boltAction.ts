export interface BoltPose {
  /** Radians the handle has rotated up off its resting/locked position. */
  liftAngle: number;
  /** Meters the bolt has slid back along the receiver (0 = fully forward/closed). */
  pullOffset: number;
}

const LIFT_ANGLE = Math.PI / 2.4; // ~75°, reads clearly as "unlocked" without looking detached
const PULL_DISTANCE = 0.09; // meters, in the gun model's own local scale

/**
 * A bolt-action cycle is four equal beats: lift the handle (unlock), pull
 * the bolt back (ejects the spent casing), push it forward (chambers the
 * next round), then rotate the handle back down (lock). `progress` is 0..1
 * across whatever the caller considers one cycle — the cooldown after a
 * shot (a Kar98 must be cycled before it can fire again) or the longer
 * explicit reload.
 */
export function computeBoltPose(progress: number): BoltPose {
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.25) return { liftAngle: LIFT_ANGLE * (p / 0.25), pullOffset: 0 };
  if (p < 0.5) return { liftAngle: LIFT_ANGLE, pullOffset: PULL_DISTANCE * ((p - 0.25) / 0.25) };
  if (p < 0.75) return { liftAngle: LIFT_ANGLE, pullOffset: PULL_DISTANCE * (1 - (p - 0.5) / 0.25) };
  return { liftAngle: LIFT_ANGLE * (1 - (p - 0.75) / 0.25), pullOffset: 0 };
}
