import { afterEach, describe, expect, it } from "vitest";
import { addFireKick, decayFireKick, readCrosshairGap, resetCrosshairBloom, setMoveSpeed } from "./crosshairBloom";

afterEach(() => resetCrosshairBloom());

describe("crosshairBloom", () => {
  it("is tightest at rest", () => {
    const rest = readCrosshairGap();
    setMoveSpeed(7);
    expect(readCrosshairGap()).toBeGreaterThan(rest);
  });

  it("blooms with movement speed and clamps at the run cap", () => {
    setMoveSpeed(3.5);
    const half = readCrosshairGap();
    setMoveSpeed(7);
    const full = readCrosshairGap();
    setMoveSpeed(20); // past the cap
    expect(full).toBeGreaterThan(half);
    expect(readCrosshairGap()).toBeCloseTo(full, 6); // clamped, no further growth
  });

  it("kicks on fire and decays back down over time", () => {
    const rest = readCrosshairGap();
    addFireKick(20);
    expect(readCrosshairGap()).toBeGreaterThan(rest);
    decayFireKick(100); // long enough to bleed it all off
    expect(readCrosshairGap()).toBeCloseTo(rest, 6);
  });
});
