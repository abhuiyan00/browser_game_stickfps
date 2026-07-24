/**
 * Client-side mirror of the grenade constants the UI/VFX need. The server
 * (server/src/combat/grenade.ts) stays the single source of truth for the sim —
 * these are only for the cosmetic HUD cooldown ring and the blast VFX scale, and
 * must be kept in step with the server values by hand (same pattern as perks.ts).
 */
export const GRENADE_COOLDOWN_SEC = 16;
export const GRENADE_BLAST_RADIUS = 6.5;
