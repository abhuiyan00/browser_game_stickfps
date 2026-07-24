import type { WeaponId } from "../net/messages";

export interface WeaponDef {
  maxAmmo: number;
  cooldownSec: number;
  reloadSec: number;
}

// Must stay in sync with client/src/game/weapons/weaponDefs.ts — the numbers
// are the product spec (PROJECT.md); this copy is the one that is ever
// actually enforced (C1). The client's copy is cosmetic only.
//
// Invariant relied on elsewhere: reloadSec >= cooldownSec for every weapon, so
// reloading out of a cooldown can never be used to fire faster (weaponRules.test.ts).
export const WEAPON_RULES: Record<WeaponId, WeaponDef> = {
  revolver: { maxAmmo: 6, cooldownSec: 0.5, reloadSec: 1.5 },
  kar98: { maxAmmo: 5, cooldownSec: 1.5, reloadSec: 2.2 },
};

/**
 * Buy-phase cost. The pistol is the free starter every player always owns;
 * everything else is purchased during the buy phase and stripped back to the
 * pistol at the start of each round (CS-style loadout economy). Enforced on
 * the server (Room.buyWeapon); the client's copy (weaponDefs) is for the menu.
 */
export const WEAPON_PRICE: Record<WeaponId, number> = {
  revolver: 0,
  kar98: 2400,
};

/**
 * Settle time after switching weapons before the incoming weapon can fire.
 * Enforced server-side so alternating switch+fire messages can't interleave
 * the two weapons' independent cooldowns into a higher combined fire rate.
 * Must stay in sync with the client's EQUIP_SEC (weaponDefs.ts).
 */
export const EQUIP_SEC = 0.35;

export type WeaponPhase = "idle" | "cooldown" | "reloading";

export interface ServerWeaponState {
  weaponId: WeaponId;
  ammo: number;
  phase: WeaponPhase;
  cooldownRemaining: number;
  reloadRemaining: number;
}

export function createServerWeaponState(weaponId: WeaponId): ServerWeaponState {
  const def = WEAPON_RULES[weaponId];
  return { weaponId, ammo: def.maxAmmo, phase: "idle", cooldownRemaining: 0, reloadRemaining: 0 };
}

export function canFire(state: ServerWeaponState): boolean {
  return state.phase === "idle" && state.ammo > 0;
}

/** Mutates nothing — returns the post-fire state. `cooldownMult` (<1) is a killstreak fire-rate perk. Caller decides whether the shot hit. */
export function applyFire(state: ServerWeaponState, cooldownMult = 1): ServerWeaponState {
  if (!canFire(state)) return state;
  const def = WEAPON_RULES[state.weaponId];
  return { ...state, ammo: state.ammo - 1, phase: "cooldown", cooldownRemaining: def.cooldownSec * cooldownMult };
}

/**
 * Begins a reload unless one is already running or the magazine is full.
 * Reloading is allowed from cooldown (reloadSec >= cooldownSec for every
 * weapon, so this can never be used to fire faster). Ammo refills only when
 * the timer completes in stepWeaponState — not up front.
 */
export function applyReload(state: ServerWeaponState, reloadMult = 1): ServerWeaponState {
  const def = WEAPON_RULES[state.weaponId];
  if (state.phase === "reloading" || state.ammo === def.maxAmmo) return state;
  return { ...state, phase: "reloading", cooldownRemaining: 0, reloadRemaining: def.reloadSec * reloadMult };
}

export function stepWeaponState(state: ServerWeaponState, dt: number): ServerWeaponState {
  if (state.phase === "cooldown") {
    const remaining = state.cooldownRemaining - dt;
    return remaining <= 0 ? { ...state, phase: "idle", cooldownRemaining: 0 } : { ...state, cooldownRemaining: remaining };
  }
  if (state.phase === "reloading") {
    const remaining = state.reloadRemaining - dt;
    if (remaining <= 0) {
      const def = WEAPON_RULES[state.weaponId];
      return { ...state, phase: "idle", reloadRemaining: 0, ammo: def.maxAmmo };
    }
    return { ...state, reloadRemaining: remaining };
  }
  return state;
}
