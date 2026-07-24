export type WeaponId = "revolver" | "kar98";
export type WeaponRole = "pistol" | "sniper";

export interface ZoomDef {
  defaultFov: number;
  zoomedFov: number;
}

export interface WeaponDef {
  id: WeaponId;
  label: string;
  role: WeaponRole;
  /** Buy-phase cost. 0 = the free starter pistol every player always owns. Enforced server-side. */
  price: number;
  maxAmmo: number;
  cooldownSec: number;
  reloadSec: number;
  zoom?: ZoomDef;
}

// Data-driven arsenal. The server (weaponRules.ts / hitValidation.ts) owns damage,
// ammo, cooldown and price for real; this client copy drives the viewmodel, HUD,
// buy menu, and local prediction. Keep cooldown/ammo/reload/price in sync with the
// server's WEAPON_RULES + WEAPON_PRICE.
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  revolver: {
    id: "revolver",
    label: "Revolver",
    role: "pistol",
    price: 0,
    maxAmmo: 6,
    cooldownSec: 0.5,
    reloadSec: 1.5,
  },
  kar98: {
    id: "kar98",
    label: "Kar98",
    role: "sniper",
    price: 2400,
    maxAmmo: 5,
    cooldownSec: 1.5,
    reloadSec: 2.2,
    zoom: { defaultFov: 75, zoomedFov: 30 },
  },
};

export const ALL_WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** Must match the Canvas camera's own `fov` (App.tsx) — the value non-zoom weapons reset to on switch. */
export const DEFAULT_FOV = 75;

/** Keyboard shortcut each weapon is bound to, for the switch handler, the buy menu, and the HUD. */
export const WEAPON_HOTKEYS: Record<WeaponId, string> = {
  revolver: "1",
  kar98: "2",
};

/**
 * Settle time after a weapon switch before the incoming weapon can fire.
 * Mirrors the server's enforced copy (server/src/combat/weaponRules.ts) —
 * this one exists so the client doesn't predict shots the server will reject,
 * and so the viewmodel draw animation has a real duration to play over.
 */
export const EQUIP_SEC = 0.35;
