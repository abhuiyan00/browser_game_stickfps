export type RoundPhase = "buy" | "action" | "round-end" | "match-end";

export interface RoundState {
  roundNumber: number;
  phase: RoundPhase;
  /** Epoch ms. Meaningless once phase is "match-end". */
  phaseEndsAt: number;
}

// Provisional — see docs/specs/task-6.1.md Open Questions / TASKS.md 6.1.
export const MAX_ROUNDS = 12;
export const HALFWAY_ROUND = Math.ceil(MAX_ROUNDS / 2);
// Fast-paced tuning: a short setup breather, then straight into the fight.
export const BUY_PHASE_MS = 8_000;
export const ACTION_PHASE_MS = 60_000;
/**
 * Intermission after a round is decided, before the next buy phase. Without
 * it the next round starts on the very next server tick — the eliminated
 * player's death screen and the "who won the round" moment last ~16ms.
 */
export const ROUND_END_MS = 3_000;
export const STARTING_MONEY = 800;
export const ROUND_WIN_MONEY = 3000;

/** Rounds needed to make the match mathematically undecidable for the other team (7 of 12). */
export const WINS_TO_CLINCH = Math.floor(MAX_ROUNDS / 2) + 1;

export function startFirstRound(now: number): RoundState {
  return { roundNumber: 1, phase: "buy", phaseEndsAt: now + BUY_PHASE_MS };
}

/**
 * True once a team has clinched — playing the remaining rounds can't change
 * the winner, so the match ends early (standard tactical-FPS behavior).
 */
export function hasClinchedMatch(wins: number): boolean {
  return wins >= WINS_TO_CLINCH;
}

/** True for the round immediately after the halfway point, when teams swap sides. */
export function isSideSwapRound(roundNumber: number): boolean {
  return roundNumber === HALFWAY_ROUND + 1;
}

export function isPhaseElapsed(state: RoundState, now: number): boolean {
  return state.phase !== "match-end" && now >= state.phaseEndsAt;
}

export function beginActionPhase(state: RoundState, now: number): RoundState {
  return { ...state, phase: "action", phaseEndsAt: now + ACTION_PHASE_MS };
}

/** The post-round intermission — same round number, next round begins when it elapses. */
export function beginRoundEnd(state: RoundState, now: number): RoundState {
  return { ...state, phase: "round-end", phaseEndsAt: now + ROUND_END_MS };
}

/** Called when a round ends, whether by elimination or action-phase timeout. */
export function beginNextRound(state: RoundState, now: number): RoundState {
  const nextRoundNumber = state.roundNumber + 1;
  if (nextRoundNumber > MAX_ROUNDS) {
    return { ...state, phase: "match-end" };
  }
  return { roundNumber: nextRoundNumber, phase: "buy", phaseEndsAt: now + BUY_PHASE_MS };
}
