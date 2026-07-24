import type {
  BuyRequest,
  FireRequest,
  GrenadeThrowRequest,
  PlayerInput,
  ReloadRequest,
  SwitchWeaponRequest,
  Vec3,
  WeaponId,
} from "./messages";

const WEAPON_IDS: WeaponId[] = ["revolver", "kar98"];

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

/**
 * Every message arriving over the wire is untrusted attacker-controlled input
 * (Data = string | number | Object with no compile-time guarantee). These
 * guards are the trust boundary — nothing downstream should assume shape.
 */
export function isValidPlayerInput(data: unknown): data is PlayerInput {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.forward === "boolean" &&
    typeof d.backward === "boolean" &&
    typeof d.left === "boolean" &&
    typeof d.right === "boolean" &&
    typeof d.jump === "boolean" &&
    (d.crouch === undefined || typeof d.crouch === "boolean") &&
    typeof d.yaw === "number" &&
    Number.isFinite(d.yaw) &&
    typeof d.clientTick === "number" &&
    Number.isFinite(d.clientTick)
  );
}

function isWeaponIdPayload(data: unknown): data is { weaponId: WeaponId } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.weaponId === "string" && WEAPON_IDS.includes(d.weaponId as WeaponId);
}

export function isValidReloadRequest(data: unknown): data is ReloadRequest {
  return isWeaponIdPayload(data);
}

export function isValidSwitchWeaponRequest(data: unknown): data is SwitchWeaponRequest {
  return isWeaponIdPayload(data);
}

export function isValidBuyRequest(data: unknown): data is BuyRequest {
  return isWeaponIdPayload(data);
}

export function isValidFireRequest(data: unknown): data is FireRequest {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.weaponId === "string" &&
    WEAPON_IDS.includes(d.weaponId as WeaponId) &&
    isVec3(d.origin) &&
    isVec3(d.direction) &&
    typeof d.clientTick === "number"
  );
}

export function isValidGrenadeThrowRequest(data: unknown): data is GrenadeThrowRequest {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return isVec3(d.origin) && isVec3(d.direction);
}

export function isValidRoomCodePayload(data: unknown): data is { code: string } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.code === "string";
}
