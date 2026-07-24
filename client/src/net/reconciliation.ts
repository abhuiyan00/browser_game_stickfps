import type { PlayerState } from "../game/player/playerController";
import type { Vec3 } from "./messages";

export interface ReconciliationOptions {
  /** Beyond this distance (meters), snap instead of smoothing — e.g. after a respawn/teleport. */
  snapThreshold?: number;
  /** Fraction of the remaining gap closed per call (0..1). */
  correctionRate?: number;
}

const DEFAULT_OPTIONS: Required<ReconciliationOptions> = {
  snapThreshold: 3,
  correctionRate: 0.15,
};

/**
 * Blends the locally predicted player position toward the server's
 * authoritative snapshot. Full input-replay reconciliation is out of scope
 * for v1 (see docs/specs/task-4.1.md Open Questions) — this smooths minor
 * prediction error and snaps on large divergence.
 */
export function reconcile(predicted: PlayerState, authoritative: Vec3, options: ReconciliationOptions = {}): PlayerState {
  const { snapThreshold, correctionRate } = { ...DEFAULT_OPTIONS, ...options };

  const dx = authoritative[0] - predicted.position[0];
  const dy = authoritative[1] - predicted.position[1];
  const dz = authoritative[2] - predicted.position[2];
  const distance = Math.hypot(dx, dy, dz);

  if (distance === 0) return predicted;

  if (distance > snapThreshold) {
    return { ...predicted, position: [...authoritative] };
  }

  return {
    ...predicted,
    position: [
      predicted.position[0] + dx * correctionRate,
      predicted.position[1] + dy * correctionRate,
      predicted.position[2] + dz * correctionRate,
    ],
  };
}
