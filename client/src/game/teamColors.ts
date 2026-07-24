/**
 * Friend/foe colours, shared by the 3D stickmen (RemotePlayers) and the 2D HUD
 * (score + scoreboard) so the two can never drift apart. The scheme is relative
 * to the viewer: your own team reads blue, the enemy team reads red — the single
 * most important at-a-glance signal now that the game is in full colour.
 *
 * Tune the two hexes here to restyle every friend/foe cue in one place.
 */
export const FRIENDLY_COLOR = "#3d9bff"; // self / teammates
export const ENEMY_COLOR = "#ff4d3a"; // opponents
