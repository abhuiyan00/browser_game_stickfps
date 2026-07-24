import { describe, expect, it } from "vitest";
import { intersectRaySphere, isOriginPlausible, raycastPlayers, ZONE_MULT, type HitCandidate } from "./hitValidation";

describe("intersectRaySphere", () => {
  it("detects a hit on a sphere directly ahead", () => {
    const t = intersectRaySphere([0, 0, 0], [0, 0, -1], [0, 0, -10], 1);
    expect(t).not.toBeNull();
    expect(t).toBeCloseTo(9, 5);
  });

  it("returns null when the ray misses the sphere", () => {
    const t = intersectRaySphere([0, 0, 0], [0, 0, -1], [5, 5, -10], 1);
    expect(t).toBeNull();
  });

  it("returns null for a sphere behind the ray origin", () => {
    const t = intersectRaySphere([0, 0, 0], [0, 0, -1], [0, 0, 10], 1);
    expect(t).toBeNull();
  });
});

describe("raycastPlayers", () => {
  it("picks the nearest of multiple candidates in line", () => {
    const candidates: HitCandidate[] = [
      { playerId: "far", position: [0, 1.6, -20] },
      { playerId: "near", position: [0, 1.6, -5] },
    ];
    const hit = raycastPlayers([0, 1.6, 0], [0, 0, -1], candidates);
    expect(hit?.playerId).toBe("near");
  });

  it("returns null when no candidate is in the ray's path", () => {
    const candidates: HitCandidate[] = [{ playerId: "offside", position: [10, 1.6, -5] }];
    const hit = raycastPlayers([0, 1.6, 0], [0, 0, -1], candidates);
    expect(hit).toBeNull();
  });

  it("ignores candidates outside MAX_RANGE", () => {
    const candidates: HitCandidate[] = [{ playerId: "far", position: [0, 1.6, -500] }];
    const hit = raycastPlayers([0, 1.6, 0], [0, 0, -1], candidates);
    expect(hit).toBeNull();
  });

  // Zones are anchored to the target's eye position (y=1.6 here): head just below
  // the eye, torso beneath, legs at the bottom. Rays fired flat at each height
  // must land the matching zone.
  describe("hit zones", () => {
    const target: HitCandidate[] = [{ playerId: "t", position: [0, 1.6, -5] }];

    it("registers a headshot for a ray at head height", () => {
      const hit = raycastPlayers([0, 1.55, 0], [0, 0, -1], target);
      expect(hit?.zone).toBe("head");
    });

    it("registers a body shot for a ray at torso height", () => {
      const hit = raycastPlayers([0, 1.05, 0], [0, 0, -1], target);
      expect(hit?.zone).toBe("body");
    });

    it("registers a leg shot for a ray at leg height", () => {
      const hit = raycastPlayers([0, 0.45, 0], [0, 0, -1], target);
      expect(hit?.zone).toBe("legs");
    });

    it("resolves the head in front of the torso for an angled shot through both", () => {
      // From above and in front, aimed down through the head into the chest —
      // the nearer surface (head) must win.
      const hit = raycastPlayers([0, 2.2, -4], [0, -0.55, -0.83], target);
      expect(hit?.zone).toBe("head");
    });
  });
});

describe("ZONE_MULT", () => {
  it("rewards headshots and slightly discounts legs", () => {
    expect(ZONE_MULT.head).toBeGreaterThan(ZONE_MULT.body);
    expect(ZONE_MULT.body).toBeGreaterThan(ZONE_MULT.legs);
    expect(ZONE_MULT.body).toBe(1);
  });
});

describe("isOriginPlausible", () => {
  it("accepts an origin close to the shooter's actual position", () => {
    expect(isOriginPlausible([0.1, 1.6, 0.1], [0, 1.6, 0])).toBe(true);
  });

  it("rejects an origin far from the shooter's actual position (spoofed muzzle)", () => {
    expect(isOriginPlausible([50, 1.6, 50], [0, 1.6, 0])).toBe(false);
  });
});
