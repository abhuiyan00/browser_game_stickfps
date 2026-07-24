/**
 * Dynamic-crosshair spread bus. PlayerRig feeds live movement speed each tick and
 * a decaying kick per shot; the HUD crosshair reads the combined gap to size
 * itself, so the reticle visibly blooms when you move or fire and tightens when
 * you stand still. Purely a readout — the server owns the real spread
 * (combat/aimError.ts) — but it mirrors that model so what you see matches how
 * accurate the shot actually is.
 *
 * A module singleton (like the screen-shake bus) since there is one local view.
 */
const BASE_GAP = 4; // px between crosshair center and each arm at rest
const MOVE_GAP = 12; // px added at full run speed
const MAX_FIRE_KICK = 22; // px ceiling on stacked fire kicks
const FIRE_DECAY = 42; // px/sec the fire kick bleeds off
const RUN_SPEED = 7; // m/s that maps to full movement bloom (matches MAX_SPEED)

let moveSpeed = 0;
let fireKick = 0;

export function setMoveSpeed(speed: number): void {
  moveSpeed = Math.max(0, speed);
}

export function addFireKick(px: number): void {
  fireKick = Math.min(MAX_FIRE_KICK, fireKick + px);
}

export function decayFireKick(dt: number): void {
  fireKick = Math.max(0, fireKick - dt * FIRE_DECAY);
}

/** Combined half-gap in pixels: base + movement bloom + recent fire kick. */
export function readCrosshairGap(): number {
  return BASE_GAP + Math.min(1, moveSpeed / RUN_SPEED) * MOVE_GAP + fireKick;
}

/** Reset to a tight resting reticle — tests and teardown. */
export function resetCrosshairBloom(): void {
  moveSpeed = 0;
  fireKick = 0;
}
