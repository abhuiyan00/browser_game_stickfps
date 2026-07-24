import { useCallback, useEffect, useRef, useState } from "react";
import { useFixedTimestep } from "../loop/useFixedTimestep";
import { ALL_WEAPON_IDS, EQUIP_SEC, WEAPON_HOTKEYS, type WeaponId } from "./weaponDefs";
import {
  canFire,
  createWeaponState,
  requestFire,
  requestReload,
  stepWeapon,
  toggleZoom,
  type WeaponState,
} from "./weaponStateMachine";
import { playDryFire, playGunshot, playReload } from "../../audio/sounds";
import { PERK_COOLDOWN_MULT, PERK_RELOAD_MULT } from "../perks";
import type { FireRequest, ReloadRequest, SwitchWeaponRequest, Vec3 } from "../../net/messages";

export interface UseWeaponOptions {
  getOrigin: () => Vec3;
  getDirection: () => Vec3;
  onFireRequest: (req: FireRequest) => void;
  /** Keeps the server's ammo counter in sync — a local-only reload leaves the weapon empty server-side. */
  onReloadRequest?: (req: ReloadRequest) => void;
  /** Tells the server which weapon is in hand — it rejects fire requests for anything else. */
  onSwitchRequest?: (req: SwitchWeaponRequest) => void;
  /**
   * Gate for firing beyond pointer lock: false during the buy phase, after
   * elimination, and at match end. The server enforces the same rules; this
   * stops the client predicting shots the server will reject (and lying about
   * ammo as a result).
   */
  canEngage?: () => boolean;
  /**
   * Weapons the player owns this round (from server room-state). Hotkey
   * switching is limited to these — the server rejects equipping anything
   * unowned, so predicting it would just desync the viewmodel.
   */
  ownedWeapons?: WeaponId[];
  /** Local player's killstreak perk tier — scales predicted fire cooldown + reload to match the server. */
  perkTier?: number;
}

export interface UseWeaponResult {
  activeWeaponId: WeaponId;
  /** Every carried weapon's own state — each keeps independent ammo/cooldown, mirroring the server (Room.ts `weapons` record). */
  states: Record<WeaponId, WeaponState>;
  fire: () => void;
  reload: () => void;
  zoom: () => void;
  switchWeapon: (weaponId: WeaponId) => void;
}

const HOTKEY_TO_WEAPON = Object.fromEntries(
  ALL_WEAPON_IDS.map((id) => [WEAPON_HOTKEYS[id], id]),
) as Record<string, WeaponId>;

function createAllWeaponStates(): Record<WeaponId, WeaponState> {
  const states = {} as Record<WeaponId, WeaponState>;
  for (const id of ALL_WEAPON_IDS) states[id] = createWeaponState(id);
  return states;
}

/** Weapon/game input only counts while the pointer is captured — otherwise clicking pause-menu buttons would fire the gun. */
function isPointerLocked(): boolean {
  return typeof document !== "undefined" && document.pointerLockElement !== null;
}

/**
 * Wires mouse/keyboard input to the weapon state machine. `onFireRequest` is
 * called at most once per successful `fire()` invocation — never from inside
 * a `setState` updater — so React StrictMode's double-invoke of updaters
 * can't cause a duplicate network send (see docs/specs/task-3.1.md).
 *
 * All carried weapons tick every frame (not just the active one), same as
 * the server steps every entry in `player.weapons` regardless of which is
 * equipped — so ammo/cooldown shown after switching back is never stale.
 */
export function useWeapon({
  getOrigin,
  getDirection,
  onFireRequest,
  onReloadRequest,
  onSwitchRequest,
  canEngage,
  ownedWeapons,
  perkTier = 0,
}: UseWeaponOptions): UseWeaponResult {
  const [activeWeaponId, setActiveWeaponId] = useState<WeaponId>("revolver");
  const [states, setStates] = useState<Record<WeaponId, WeaponState>>(createAllWeaponStates);
  const activeRef = useRef(activeWeaponId);
  activeRef.current = activeWeaponId;
  const ownedRef = useRef<WeaponId[]>(ownedWeapons ?? ALL_WEAPON_IDS);
  ownedRef.current = ownedWeapons ?? ALL_WEAPON_IDS;
  const perkTierRef = useRef(perkTier);
  perkTierRef.current = perkTier;
  const statesRef = useRef(states);
  statesRef.current = states;
  const tickRef = useRef(0);
  /** Seconds left of the equip settle delay — mirrors the server's per-player `switchRemaining`. */
  const drawRemainingRef = useRef(0);

  useFixedTimestep((dt) => {
    tickRef.current += 1;
    if (drawRemainingRef.current > 0) drawRemainingRef.current = Math.max(0, drawRemainingRef.current - dt);
    setStates((prev) => {
      const next = { ...prev };
      for (const id of ALL_WEAPON_IDS) next[id] = stepWeapon(prev[id], dt);
      return next;
    });
  });

  const reload = useCallback(() => {
    const id = activeRef.current;
    const before = statesRef.current[id];
    const reloadMult = PERK_RELOAD_MULT[perkTierRef.current] ?? 1;
    const after = requestReload(before, reloadMult);
    if (after === before) return; // already reloading or already full — nothing to do or tell the server
    playReload(id);
    onReloadRequest?.({ weaponId: id });
    setStates((prev) => ({ ...prev, [id]: requestReload(prev[id], reloadMult) }));
  }, [onReloadRequest]);

  const fire = useCallback(() => {
    if (!canEngage?.()) return;
    if (drawRemainingRef.current > 0) return;
    const id = activeRef.current;
    const state = statesRef.current[id];
    if (!canFire(state)) {
      // Empty magazine on an otherwise-ready trigger pull: dry click, then
      // start the reload automatically (standard FPS convenience).
      if (state.phase === "idle" && state.ammo === 0) {
        playDryFire();
        reload();
      }
      return;
    }
    playGunshot(id);
    onFireRequest({
      weaponId: id,
      origin: getOrigin(),
      direction: getDirection(),
      clientTick: tickRef.current,
    });
    const cooldownMult = PERK_COOLDOWN_MULT[perkTierRef.current] ?? 1;
    setStates((prev) => ({ ...prev, [id]: requestFire(prev[id], cooldownMult) }));
  }, [getOrigin, getDirection, onFireRequest, canEngage, reload]);

  const zoom = useCallback(() => {
    const id = activeRef.current;
    setStates((prev) => ({ ...prev, [id]: toggleZoom(prev[id]) }));
  }, []);

  const switchWeapon = useCallback(
    (weaponId: WeaponId) => {
      if (weaponId === activeRef.current) return;
      // De-zoom the outgoing weapon so re-selecting it later doesn't silently
      // snap the camera back into a zoomed FOV.
      setStates((prev) => {
        const prevId = activeRef.current;
        if (!prev[prevId].zoomed) return prev;
        return { ...prev, [prevId]: { ...prev[prevId], zoomed: false } };
      });
      drawRemainingRef.current = EQUIP_SEC;
      onSwitchRequest?.({ weaponId });
      setActiveWeaponId(weaponId);
    },
    [onSwitchRequest],
  );

  // A new round resets the server loadout to just the pistol — if we were
  // holding a bought weapon, drop back to the revolver so the viewmodel and
  // the server's `equipped` don't diverge.
  useEffect(() => {
    const owned = ownedWeapons ?? ALL_WEAPON_IDS;
    if (!owned.includes(activeRef.current)) switchWeapon("revolver");
  }, [ownedWeapons, switchWeapon]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!isPointerLocked()) return;
      if (e.button === 0) fire();
      if (e.button === 2) zoom();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPointerLocked()) return;
      if (e.code === "KeyR") reload();
      const weaponId = HOTKEY_TO_WEAPON[e.key];
      if (weaponId && ownedRef.current.includes(weaponId)) switchWeapon(weaponId);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [fire, reload, zoom, switchWeapon]);

  return { activeWeaponId, states, fire, reload, zoom, switchWeapon };
}
