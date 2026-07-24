import { describe, expect, it } from "vitest";
import {
  applyFire,
  applyReload,
  canFire,
  createServerWeaponState,
  stepWeaponState,
  WEAPON_RULES,
} from "./weaponRules";

describe("weaponRules", () => {
  it("fires from idle: ammo decrements and the cooldown starts", () => {
    const state = createServerWeaponState("revolver");
    const fired = applyFire(state);
    expect(fired.ammo).toBe(WEAPON_RULES.revolver.maxAmmo - 1);
    expect(fired.phase).toBe("cooldown");
    expect(canFire(fired)).toBe(false);
  });

  it("reload refills ammo only after the full reload duration has been stepped", () => {
    let state = createServerWeaponState("revolver");
    for (let i = 0; i < WEAPON_RULES.revolver.maxAmmo; i++) {
      state = applyFire(state);
      // step through the cooldown so the next shot is allowed
      for (let t = 0; t < WEAPON_RULES.revolver.cooldownSec * 60 + 1; t++) state = stepWeaponState(state, 1 / 60);
    }
    expect(state.ammo).toBe(0);

    state = applyReload(state);
    expect(state.phase).toBe("reloading");
    expect(state.ammo).toBe(0); // no refill up front

    // halfway through: still empty
    for (let t = 0; t < (WEAPON_RULES.revolver.reloadSec / 2) * 60; t++) state = stepWeaponState(state, 1 / 60);
    expect(state.ammo).toBe(0);

    // past the full duration: refilled and idle again
    for (let t = 0; t < WEAPON_RULES.revolver.reloadSec * 60; t++) state = stepWeaponState(state, 1 / 60);
    expect(state.ammo).toBe(WEAPON_RULES.revolver.maxAmmo);
    expect(state.phase).toBe("idle");
    expect(canFire(state)).toBe(true);
  });

  it("reload is a no-op when already reloading or already full", () => {
    const full = createServerWeaponState("kar98");
    expect(applyReload(full)).toBe(full);

    const emptied = { ...full, ammo: 0 };
    const reloading = applyReload(emptied);
    expect(applyReload(reloading)).toBe(reloading);
  });

  it("reload is allowed from cooldown and cancels it (reload is never shorter than the cooldown)", () => {
    // the invariant that makes cancel-into-reload safe, for every weapon in the table:
    for (const def of Object.values(WEAPON_RULES)) {
      expect(def.reloadSec).toBeGreaterThanOrEqual(def.cooldownSec);
    }
    const fired = applyFire(createServerWeaponState("kar98"));
    const reloading = applyReload(fired);
    expect(reloading.phase).toBe("reloading");
    expect(reloading.cooldownRemaining).toBe(0);
  });

  it("drives each weapon's own fire rate and magazine from the table (Kar98 example)", () => {
    const kar98 = createServerWeaponState("kar98");
    expect(kar98.ammo).toBe(WEAPON_RULES.kar98.maxAmmo);
    const fired = applyFire(kar98);
    expect(fired.ammo).toBe(WEAPON_RULES.kar98.maxAmmo - 1);
    expect(fired.cooldownRemaining).toBeCloseTo(WEAPON_RULES.kar98.cooldownSec, 5);
    // still cooling down one tick later — can't fire faster than the table allows
    expect(canFire(stepWeaponState(fired, 1 / 60))).toBe(false);
  });
});
