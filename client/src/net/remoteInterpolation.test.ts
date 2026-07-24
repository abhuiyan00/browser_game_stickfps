import { describe, expect, it } from "vitest";
import { RemotePlayerInterpolator } from "./remoteInterpolation";

describe("RemotePlayerInterpolator", () => {
  it("returns null for an unknown player", () => {
    const interp = new RemotePlayerInterpolator();
    expect(interp.sample("ghost")).toBeNull();
  });

  it("returns the single sample verbatim before a second snapshot arrives", () => {
    const interp = new RemotePlayerInterpolator();
    interp.push("p1", [1, 1.6, 1], 0, 1000);
    expect(interp.sample("p1", 1050)).toEqual({ position: [1, 1.6, 1], yaw: 0 });
  });

  it("interpolates between the two most recent snapshots at the render delay", () => {
    const interp = new RemotePlayerInterpolator();
    interp.push("p1", [0, 1.6, 0], 0, 1000);
    interp.push("p1", [10, 1.6, 0], 0, 1100);
    // render time = now(1200) - 100ms delay = 1100 -> t=1 (right at the second sample)
    const atSecond = interp.sample("p1", 1200);
    expect(atSecond?.position[0]).toBeCloseTo(10, 5);

    // render time = now(1150) - 100ms delay = 1050 -> halfway between 1000 and 1100
    const halfway = interp.sample("p1", 1150);
    expect(halfway?.position[0]).toBeCloseTo(5, 5);
  });

  it("only keeps the two most recent snapshots", () => {
    const interp = new RemotePlayerInterpolator();
    interp.push("p1", [0, 1.6, 0], 0, 1000);
    interp.push("p1", [5, 1.6, 0], 0, 1100);
    interp.push("p1", [10, 1.6, 0], 0, 1200);
    const result = interp.sample("p1", 1300);
    // buffer should now be [1100@5, 1200@10]; render time 1200 -> t=1 -> position 10
    expect(result?.position[0]).toBeCloseTo(10, 5);
  });

  it("returns null once samples go stale, so leavers don't render as frozen ghosts", () => {
    const interp = new RemotePlayerInterpolator();
    interp.push("p1", [0, 1.6, 0], 0, 1000);
    interp.push("p1", [1, 1.6, 0], 0, 1016);
    expect(interp.sample("p1", 1100)).not.toBeNull();
    // over a second since the last snapshot — the player is gone, not standing still
    expect(interp.sample("p1", 2100)).toBeNull();
  });

  it("interpolates yaw across the ±π wrap along the shortest arc", () => {
    const interp = new RemotePlayerInterpolator();
    // 3.0 rad -> -3.0 rad is a 0.28 rad step through the seam, not a 6 rad spin.
    interp.push("p1", [0, 1.6, 0], 3.0, 1000);
    interp.push("p1", [0, 1.6, 0], -3.0, 1100);
    const halfway = interp.sample("p1", 1150); // render time 1050 -> t=0.5
    // Halfway along the short arc from 3.0 toward π (≈ 3.1416...)
    expect(halfway?.yaw).toBeCloseTo(3.0 + (Math.PI - 3.0), 3);
    // And definitively NOT the long-way midpoint (0.0)
    expect(Math.abs(halfway?.yaw ?? 0)).toBeGreaterThan(2.5);
  });

  it("removes a player's buffer", () => {
    const interp = new RemotePlayerInterpolator();
    interp.push("p1", [0, 1.6, 0], 0, 1000);
    interp.remove("p1");
    expect(interp.sample("p1")).toBeNull();
    expect(interp.activeIds()).toEqual([]);
  });
});
