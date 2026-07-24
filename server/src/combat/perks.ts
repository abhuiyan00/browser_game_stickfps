/**
 * Killstreak perks. A player's kill streak (consecutive kills without dying,
 * reset every round) unlocks tiered buffs to fire rate, reload speed, and move
 * speed. These are applied to the AUTHORITATIVE sim on the server; the client
 * mirrors this exact table (client/src/game/perks.ts) so its prediction of its
 * own movement and weapon timing stays in step with the server. **Keep the two
 * files identical.**
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
