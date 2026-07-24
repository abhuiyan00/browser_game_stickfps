import { describe, expect, it } from "vitest";
import { WEAPONS } from "./weaponDefs";
import {
  canFire,
  createWeaponState,
  requestFire,
  requestReload,
  stepWeapon,
  toggleZoom,
} from "./weaponStateMachine";

describe("weaponStateMachine", () => {
  it("decrements ammo and enters cooldown on fire", () => {
    const state = requestFire(createWeaponState("revolver"));
    expect(state.ammo).toBe(WEAPONS.revolver.maxAmmo - 1);
    expect(state.phase).toBe("cooldown");
    expect(state.cooldownRemaining).toBeCloseTo(WEAPONS.revolver.cooldownSec);
  });

  it("blocks fire while on cooldown", () => {
    const afterFirstShot = requestFire(createWeaponState("revolver"));
    const afterSecondAttempt = requestFire(afterFirstShot);
    expect(afterSecondAttempt).toEqual(afterFirstShot);
  });

  it("returns to idle and allows firing again once cooldown elapses", () => {
    let state = requestFire(createWeaponState("revolver"));
    state = stepWeapon(state, WEAPONS.revolver.cooldownSec + 0.001);
    expect(state.phase).toBe("idle");
    expect(canFire(state)).toBe(true);
  });

  it("blocks fire when ammo is exhausted, even if idle", () => {
    let state = createWeaponState("revolver");
    for (let i = 0; i < WEAPONS.revolver.maxAmmo; i++) {
      state = requestFire(state);
      state = stepWeapon(state, WEAPONS.revolver.cooldownSec + 0.001);
    }
    expect(state.ammo).toBe(0);
    expect(canFire(state)).toBe(false);
  });

  it("refills ammo after the reload duration", () => {
    let state = requestFire(createWeaponState("kar98"));
    state = stepWeapon(state, WEAPONS.kar98.cooldownSec + 0.001);
    state = requestReload(state);
    expect(state.phase).toBe("reloading");
    state = stepWeapon(state, WEAPONS.kar98.reloadSec + 0.001);
    expect(state.phase).toBe("idle");
    expect(state.ammo).toBe(WEAPONS.kar98.maxAmmo);
  });

  it("does not reload a full magazine", () => {
    const full = createWeaponState("revolver");
    expect(requestReload(full)).toEqual(full);
  });

  it("only toggles zoom for weapons with a zoom definition", () => {
    const kar98 = createWeaponState("kar98");
    expect(toggleZoom(kar98).zoomed).toBe(true);

    const revolver = createWeaponState("revolver");
    expect(toggleZoom(revolver).zoomed).toBe(false);
  });
});
