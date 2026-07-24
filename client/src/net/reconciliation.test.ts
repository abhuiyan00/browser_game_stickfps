import { describe, expect, it } from "vitest";
import { reconcile } from "./reconciliation";
import type { PlayerState } from "../game/player/playerController";

function makeState(position: [number, number, number]): PlayerState {
  return { position, velocity: [0, 0, 0], onGround: true };
}

describe("reconcile", () => {
  it("returns the same state when already in sync", () => {
    const state = makeState([1, 1.6, 1]);
    expect(reconcile(state, [1, 1.6, 1])).toEqual(state);
  });

  it("smooths a small divergence toward the authoritative position", () => {
    const state = makeState([0, 1.6, 0]);
    const result = reconcile(state, [1, 1.6, 0], { correctionRate: 0.5 });
    expect(result.position[0]).toBeCloseTo(0.5, 5);
  });

  it("snaps instead of smoothing when divergence exceeds the threshold", () => {
    const state = makeState([0, 1.6, 0]);
    const result = reconcile(state, [50, 1.6, 0], { snapThreshold: 3 });
    expect(result.position).toEqual([50, 1.6, 0]);
  });

  it("converges to the authoritative position over repeated calls", () => {
    let state = makeState([0, 1.6, 0]);
    const authoritative: [number, number, number] = [2, 1.6, 0];
    for (let i = 0; i < 50; i++) {
      state = reconcile(state, authoritative, { correctionRate: 0.2 });
    }
    expect(state.position[0]).toBeCloseTo(2, 2);
  });
});
