import { describe, expect, it } from "vitest";
import { createSpring, impulseSpring, resetSpring, stepSpring } from "./spring";

/** Run a spring toward `target` for `seconds`, sampling the peak displacement past the target. */
function settle(stiffness: number, damping: number, target: number, seconds: number, dt = 1 / 60) {
  const s = createSpring(0);
  let overshoot = 0;
  for (let t = 0; t < seconds; t += dt) {
    stepSpring(s, target, stiffness, damping, dt);
    overshoot = Math.max(overshoot, s.value - target); // how far past a target of `target` it swings
  }
  return { value: s.value, overshoot, velocity: s.velocity };
}

describe("spring integrator", () => {
  it("settles at the target when given time", () => {
    const { value, velocity } = settle(280, 26, 1, 3);
    expect(value).toBeCloseTo(1, 2);
    expect(Math.abs(velocity)).toBeLessThan(0.01);
  });

  it("overshoots when underdamped (the game-feel flavour)", () => {
    // damping 18 with stiffness 280 is well under critical (2·√280 ≈ 33.5).
    const { overshoot } = settle(280, 18, 1, 3);
    expect(overshoot).toBeGreaterThan(0.05); // visibly swings past rest before settling
  });

  it("does not overshoot when overdamped", () => {
    const { overshoot } = settle(280, 80, 1, 3);
    expect(overshoot).toBeLessThan(0.001);
  });

  it("stays finite across a huge frame spike (tab-out)", () => {
    const s = createSpring(0);
    stepSpring(s, 1, 280, 26, 5); // 5-second frame
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Math.abs(s.value)).toBeLessThan(2); // clamped, not exploded
  });

  it("is framerate-independent to a close tolerance", () => {
    const slow = settle(280, 26, 1, 2, 1 / 30).value;
    const fast = settle(280, 26, 1, 2, 1 / 144).value;
    expect(Math.abs(slow - fast)).toBeLessThan(0.01);
  });

  it("impulse injects velocity and reset clears motion", () => {
    const s = createSpring(0);
    impulseSpring(s, 5);
    expect(s.velocity).toBe(5);
    resetSpring(s, 0.5);
    expect(s.value).toBe(0.5);
    expect(s.velocity).toBe(0);
  });
});
