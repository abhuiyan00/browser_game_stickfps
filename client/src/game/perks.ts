/**
 * Killstreak perks — the CLIENT mirror of server/src/combat/perks.ts. The server
 * owns the authoritative buff; this copy exists so the client's prediction of its
 * own weapon timing (weaponStateMachine) and movement (playerController) uses the
 * same multipliers, and so the HUD can show the active tier. **Keep this table
 * byte-identical to the server's** or prediction will fight reconciliation.
 */
export const PERK_COOLDOWN_MULT = [1, 0.88, 0.78] as const; // fire-cooldown scale by tier
export const PERK_RELOAD_MULT = [1, 0.85, 0.72] as const; // reload-duration scale by tier
export const PERK_MOVE_MULT = [1, 1.05, 1.1] as const; // ground walk-speed scale by tier

/** Streak → perk tier (0 = none). 3+ kills = tier 1, 5+ = tier 2. */
export function perkTierForStreak(streak: number): number {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1;
  return 0;
}

/** Perk tier → short HUD label. Empty at tier 0. */
export const PERK_LABELS = ["", "PERK I", "PERK II"] as const;
