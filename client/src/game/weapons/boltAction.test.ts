import { describe, expect, it } from "vitest";
import { computeBoltPose } from "./boltAction";

describe("computeBoltPose", () => {
  it("starts and ends closed (locked, no pull)", () => {
    expect(computeBoltPose(0)).toEqual({ liftAngle: 0, pullOffset: 0 });
    expect(computeBoltPose(1)).toEqual({ liftAngle: 0, pullOffset: 0 });
  });

  it("lifts fully before pulling back", () => {
    const midLift = computeBoltPose(0.125);
    expect(midLift.liftAngle).toBeGreaterThan(0);
    expect(midLift.pullOffset).toBe(0);

    const fullyLifted = computeBoltPose(0.25);
    expect(fullyLifted.pullOffset).toBe(0);
    expect(fullyLifted.liftAngle).toBeCloseTo(computeBoltPose(0.5).liftAngle);
  });

  it("reaches maximum pull at the midpoint, then returns to 0 by the third quarter", () => {
    const maxPull = computeBoltPose(0.5).pullOffset;
    expect(maxPull).toBeGreaterThan(0);
    expect(computeBoltPose(0.75).pullOffset).toBeCloseTo(0);
  });

  it("lowers the handle back down over the final quarter", () => {
    expect(computeBoltPose(0.75).liftAngle).toBeGreaterThan(computeBoltPose(0.9).liftAngle);
    expect(computeBoltPose(1).liftAngle).toBe(0);
  });

  it("clamps progress outside [0, 1]", () => {
    expect(computeBoltPose(-0.5)).toEqual(computeBoltPose(0));
    expect(computeBoltPose(1.5)).toEqual(computeBoltPose(1));
  });
});
