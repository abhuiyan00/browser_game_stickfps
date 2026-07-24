import { describe, expect, it } from "vitest";
import {
  createGrenade,
  grenadeDamageAt,
  stepGrenade,
  GRENADE_BLAST_RADIUS,
  GRENADE_FUSE_SEC,
  GRENADE_MAX_DAMAGE,
  GRENADE_MIN_DAMAGE,
  GRENADE_THROW_SPEED,
} from "./grenade";
import type { Vec3 } from "../net/messages";

describe("grenade sim", () => {
  it("launches along the (normalized) aim direction with an upward lob", () => {
    const g = createGrenade(1, "p1", "A", [0, 1.6, 0], [0, 0, -2]); // non-unit direction
    // Horizontal speed is the throw speed regardless of the input direction's length.
    expect(g.velocity[2]).toBeCloseTo(-GRENADE_THROW_SPEED, 5);
    expect(g.velocity[0]).toBeCloseTo(0, 5);
    expect(g.velocity[1]).toBeGreaterThan(0); // lobbed up even on a flat throw
    expect(g.fuseRemaining).toBe(GRENADE_FUSE_SEC);
    expect(g.ownerTeam).toBe("A");
  });

  it("falls under gravity and burns the fuse each step", () => {
    const g0 = createGrenade(1, "p1", "A", [0, 5, 0], [0, 0, 0]);
    const g1 = stepGrenade(g0, 1 / 60);
    expect(g1.fuseRemaining).toBeLessThan(g0.fuseRemaining);
    // With no horizontal throw the only motion is the lob then gravity — vy shrinks each tick.
    const g2 = stepGrenade(g1, 1 / 60);
    expect(g2.velocity[1]).toBeLessThan(g1.velocity[1]);
  });

  it("rests on and bounces off the floor rather than sinking through it", () => {
    let g = createGrenade(1, "p1", "A", [0, 0.5, 0], [0, 0, 0]);
    // Drop it: after enough steps it should be sitting at/above the floor, never below.
    for (let i = 0; i < 240; i++) g = stepGrenade(g, 1 / 60);
    expect(g.position[1]).toBeGreaterThanOrEqual(0);
  });

  it("stays inside the arena walls (reflects at ±24)", () => {
    let g = createGrenade(1, "p1", "A", [23, 1.6, 0], [1, 0, 0]); // thrown at the +X wall
    for (let i = 0; i < 60; i++) g = stepGrenade(g, 1 / 60);
    expect(g.position[0]).toBeLessThanOrEqual(24);
    expect(g.position[0]).toBeGreaterThanOrEqual(-24);
  });

  it("deals full damage at the centre, less at the edge, none beyond the blast radius", () => {
    const center: Vec3 = [0, 1, 0];
    expect(grenadeDamageAt(center, [0, 1, 0])).toBe(GRENADE_MAX_DAMAGE);
    const edge = grenadeDamageAt(center, [GRENADE_BLAST_RADIUS - 0.01, 1, 0]);
    expect(edge).toBeGreaterThanOrEqual(GRENADE_MIN_DAMAGE);
    expect(edge).toBeLessThan(GRENADE_MAX_DAMAGE);
    expect(grenadeDamageAt(center, [GRENADE_BLAST_RADIUS + 1, 1, 0])).toBe(0);
  });

  it("damage falls off monotonically with distance", () => {
    const center: Vec3 = [0, 0, 0];
    const near = grenadeDamageAt(center, [1, 0, 0]);
    const mid = grenadeDamageAt(center, [3, 0, 0]);
    const far = grenadeDamageAt(center, [5, 0, 0]);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});
