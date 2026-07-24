/**
 * Fictional setting for the game — the "story and world" surfaced in the lobby
 * briefing, the in-match map tag, and the scoreboard. Pure flavour: none of this
 * has any gameplay or networking effect, it just gives the industrial yard a
 * name, two crews a rivalry, and the match a reason to exist.
 */

/** The arena's callsign — shown as a map identifier in the lobby and HUD. */
export const MAP_NAME = "FOUNDRY-7";
export const MAP_SUBTITLE = "DECOMMISSIONED MUNITIONS YARD";

/** The two crews. Fixed to the A/B team labels (the HUD still colours self blue / enemy red). */
export const FACTIONS: Record<"A" | "B", { name: string; motto: string }> = {
  A: { name: "IRONCLADS", motto: "hold the line" },
  B: { name: "ASH SYNDICATE", motto: "take what burns" },
};

/** One-paragraph setting blurb for the lobby. */
export const SETTING_BLURB =
  "The old world ran on diesel and never stopped burning. In its rusted-out foundries, two crews fight over the last working furnaces — for brass, for fuel, for ground. Tonight the contract is Foundry-7: wipe the other crew, or hold the yard until the sirens fall silent.";

/** Short mission-briefing bullets for the lobby. */
export const BRIEFING_LINES: readonly string[] = [
  "OBJECTIVE — eliminate the opposing crew, or hold the yard when the round clock runs out.",
  "ECONOMY — take rounds to bank scrip, then spend it in the buy phase before the shutters open.",
  "THE YARD — cover is thin and the sightlines are long. Keep moving; slide the corners.",
];
