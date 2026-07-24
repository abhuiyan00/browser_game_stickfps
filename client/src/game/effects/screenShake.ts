/**
 * Screen-shake "trauma" bus. The client renders exactly one local camera, so a
 * module singleton is enough and saves threading a ref through the whole scene
 * graph — anything (weapon fire, taking a hit) can add trauma, and PlayerRig
 * reads it each frame to jitter the camera. Purely cosmetic; touches no state
 * the server cares about.
 *
 * Trauma is 0..1 and decays linearly. Shake magnitude scales with trauma² so a
 * light tap barely nudges the view while a shotgun blast or a hit really kicks.
 */
const TRAUMA_DECAY = 2.4; // trauma units per second — full → zero in ~0.4s

const bus = { trauma: 0 };

/** Add kick (clamped to 1). Fire and damage call this. */
export function addTrauma(amount: number): void {
  bus.trauma = Math.min(1, bus.trauma + Math.max(0, amount));
}

export function readTrauma(): number {
  return bus.trauma;
}

/** Bleed trauma toward zero; call once per frame with the frame delta. */
export function decayTrauma(dt: number): void {
  bus.trauma = Math.max(0, bus.trauma - dt * TRAUMA_DECAY);
}

/** Reset to calm — used by tests and round transitions. */
export function resetTrauma(): void {
  bus.trauma = 0;
}
