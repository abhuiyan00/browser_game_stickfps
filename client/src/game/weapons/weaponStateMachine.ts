import { WEAPONS, type WeaponId } from "./weaponDefs";

export type WeaponPhase = "idle" | "cooldown" | "reloading";

export interface WeaponState {
  weaponId: WeaponId;
  ammo: number;
  phase: WeaponPhase;
  cooldownRemaining: number;
  reloadRemaining: number;
  zoomed: boolean;
}

export function createWeaponState(weaponId: WeaponId): WeaponState {
  const def = WEAPONS[weaponId];
  return {
    weaponId,
    ammo: def.maxAmmo,
    phase: "idle",
    cooldownRemaining: 0,
    reloadRemaining: 0,
    zoomed: false,
  };
}

export function canFire(state: WeaponState): boolean {
  return state.phase === "idle" && state.ammo > 0;
}

/**
 * Cosmetic/predictive only — the server independently validates ammo/cooldown (C1).
 * `cooldownMult` (<1) mirrors the server's killstreak fire-rate perk so the local
 * prediction opens the trigger again at the same time the server will.
 */
export function requestFire(state: WeaponState, cooldownMult = 1): WeaponState {
  if (!canFire(state)) return state;
  const def = WEAPONS[state.weaponId];
  return {
    ...state,
    ammo: state.ammo - 1,
    phase: "cooldown",
    cooldownRemaining: def.cooldownSec * cooldownMult,
  };
}

export function requestReload(state: WeaponState, reloadMult = 1): WeaponState {
  const def = WEAPONS[state.weaponId];
  if (state.phase === "reloading" || state.ammo === def.maxAmmo) return state;
  return { ...state, phase: "reloading", reloadRemaining: def.reloadSec * reloadMult };
}

export function toggleZoom(state: WeaponState): WeaponState {
  const def = WEAPONS[state.weaponId];
  if (!def.zoom) return state;
  return { ...state, zoomed: !state.zoomed };
}

export function stepWeapon(state: WeaponState, dt: number): WeaponState {
  if (state.phase === "cooldown") {
    const remaining = state.cooldownRemaining - dt;
    return remaining <= 0
      ? { ...state, phase: "idle", cooldownRemaining: 0 }
      : { ...state, cooldownRemaining: remaining };
  }
  if (state.phase === "reloading") {
    const remaining = state.reloadRemaining - dt;
    if (remaining <= 0) {
      const def = WEAPONS[state.weaponId];
      return { ...state, phase: "idle", reloadRemaining: 0, ammo: def.maxAmmo };
    }
    return { ...state, reloadRemaining: remaining };
  }
  return state;
}
