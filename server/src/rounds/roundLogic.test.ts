import { describe, expect, it } from "vitest";
import {
  ACTION_PHASE_MS,
  BUY_PHASE_MS,
  HALFWAY_ROUND,
  MAX_ROUNDS,
  ROUND_END_MS,
  WINS_TO_CLINCH,
  beginActionPhase,
  beginNextRound,
  beginRoundEnd,
  hasClinchedMatch,
  isPhaseElapsed,
  isSideSwapRound,
  startFirstRound,
} from "./roundLogic";

describe("roundLogic", () => {
  it("starts round 1 in the buy phase with the correct phase end", () => {
    const state = startFirstRound(1000);
    expect(state).toEqual({ roundNumber: 1, phase: "buy", phaseEndsAt: 1000 + BUY_PHASE_MS });
  });

  it("reports a phase as elapsed only once now reaches phaseEndsAt", () => {
    const state = startFirstRound(0);
    expect(isPhaseElapsed(state, BUY_PHASE_MS - 1)).toBe(false);
    expect(isPhaseElapsed(state, BUY_PHASE_MS)).toBe(true);
  });

  it("transitions buy -> action with the action-phase duration", () => {
    const buy = startFirstRound(0);
    const action = beginActionPhase(buy, BUY_PHASE_MS);
    expect(action.phase).toBe("action");
    expect(action.roundNumber).toBe(1);
    expect(action.phaseEndsAt).toBe(BUY_PHASE_MS + ACTION_PHASE_MS);
  });

  it("holds a round-end intermission with the same round number", () => {
    const action = beginActionPhase(startFirstRound(0), BUY_PHASE_MS);
    const ended = beginRoundEnd(action, 50_000);
    expect(ended.phase).toBe("round-end");
    expect(ended.roundNumber).toBe(1);
    expect(ended.phaseEndsAt).toBe(50_000 + ROUND_END_MS);
  });

  it("advances to the next round's buy phase", () => {
    const action = beginActionPhase(startFirstRound(0), BUY_PHASE_MS);
    const next = beginNextRound(action, BUY_PHASE_MS + ACTION_PHASE_MS);
    expect(next).toEqual({
      roundNumber: 2,
      phase: "buy",
      phaseEndsAt: BUY_PHASE_MS + ACTION_PHASE_MS + BUY_PHASE_MS,
    });
  });

  it("ends the match once the round cap is exceeded", () => {
    const state = { roundNumber: MAX_ROUNDS, phase: "action" as const, phaseEndsAt: 0 };
    const next = beginNextRound(state, 100);
    expect(next.phase).toBe("match-end");
  });

  it("flags the side-swap round as the one right after halfway", () => {
    expect(isSideSwapRound(HALFWAY_ROUND)).toBe(false);
    expect(isSideSwapRound(HALFWAY_ROUND + 1)).toBe(true);
    expect(isSideSwapRound(HALFWAY_ROUND + 2)).toBe(false);
  });

  it("declares a clinch at a majority of all rounds, not before", () => {
    expect(WINS_TO_CLINCH).toBe(Math.floor(MAX_ROUNDS / 2) + 1);
    expect(hasClinchedMatch(WINS_TO_CLINCH - 1)).toBe(false);
    expect(hasClinchedMatch(WINS_TO_CLINCH)).toBe(true);
    expect(hasClinchedMatch(WINS_TO_CLINCH + 1)).toBe(true);
  });
});
