import { describe, expect, it } from "vitest";
import {
  WEAPON_ACCURACY,
  buildShotRays,
  perturbDirection,
  recoilRadians,
  spreadRadians,
  type AimContext,
  type WeaponAccuracy,
} from "./aimError";
import { MAX_SPEED } from "../sim/movement";

const STILL: AimContext = { speed: 0, grounded: true, crouching: false, recoilShots: 0 };

describe("spreadRadians", () => {
  it("is zero for a stationary grounded first shot of a laser-accurate weapon", () => {
    expect(spreadRadians(WEAPON_ACCURACY.revolver, STILL)).toBe(0);
    expect(spreadRadians(WEAPON_ACCURACY.kar98, STILL)).toBe(0);
  });

  it("grows with movement speed", () => {
    const still = spreadRadians(WEAPON_ACCURACY.revolver, STILL);
    const moving = spreadRadians(WEAPON_ACCURACY.revolver, { ...STILL, speed: MAX_SPEED });
    expect(moving).toBeGreaterThan(still);
    expect(moving).toBeCloseTo(WEAPON_ACCURACY.revolver.moveSpread, 6);
  });

  it("is worse airborne and better crouched than standing", () => {
    const moving = { ...STILL, speed: MAX_SPEED };
    const standing = spreadRadians(WEAPON_ACCURACY.revolver, moving);
    const airborne = spreadRadians(WEAPON_ACCURACY.revolver, { ...moving, grounded: false });
    const crouched = spreadRadians(WEAPON_ACCURACY.revolver, { ...moving, crouching: true });
    expect(airborne).toBeGreaterThan(standing);
    expect(crouched).toBeLessThan(standing);
  });
});

describe("recoilRadians", () => {
  it("is zero on the first shot and climbs with the burst", () => {
    const acc = WEAPON_ACCURACY.revolver;
    expect(recoilRadians(acc, 0)).toBe(0);
    expect(recoilRadians(acc, 3)).toBeGreaterThan(recoilRadians(acc, 1));
  });

  it("caps at recoilMax however long the burst runs", () => {
    const acc = WEAPON_ACCURACY.revolver;
    expect(recoilRadians(acc, 10_000)).toBe(acc.recoilMax);
  });
});

describe("perturbDirection", () => {
  it("returns the input direction unchanged for zero pitch/yaw", () => {
    const out = perturbDirection([0, 0, -1], 0, 0);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    expect(out[2]).toBeCloseTo(-1, 6);
  });

  it("tilts the ray upward for positive pitch (muzzle climb)", () => {
    const out = perturbDirection([0, 0, -1], 0.2, 0);
    expect(out[1]).toBeGreaterThan(0);
  });

  it("keeps the result a unit vector", () => {
    const out = perturbDirection([0, 0, -1], 0.3, 0.2);
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(1, 6);
  });
});

describe("buildShotRays", () => {
  it("emits one ray per bullet and `pellets` rays for a multi-pellet profile", () => {
    expect(buildShotRays([0, 0, -1], WEAPON_ACCURACY.revolver, STILL).length).toBe(1);
    // No current weapon scatters, but the machinery stays — cover it with a synthetic profile.
    const scatter: WeaponAccuracy = { baseSpread: 0.06, moveSpread: 0, airMult: 1, crouchMult: 1, recoilPerShot: 0, recoilMax: 0, pellets: 8 };
    expect(buildShotRays([0, 0, -1], scatter, STILL).length).toBe(8);
  });

  it("leaves a stationary first shot of a laser weapon perfectly on-axis", () => {
    // spread 0 + recoil 0 ⇒ RNG is multiplied out, so this is deterministic.
    const [ray] = buildShotRays([0, 0, -1], WEAPON_ACCURACY.revolver, STILL, () => 0.999);
    expect(ray[0]).toBeCloseTo(0, 6);
    expect(ray[1]).toBeCloseTo(0, 6);
    expect(ray[2]).toBeCloseTo(-1, 6);
  });
});
