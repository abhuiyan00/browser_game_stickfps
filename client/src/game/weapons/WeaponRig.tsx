import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { useWeapon } from "./useWeapon";
import { WeaponViewmodel } from "./WeaponViewmodel";
import { WEAPONS, DEFAULT_FOV, type WeaponId } from "./weaponDefs";
import type { WeaponState } from "./weaponStateMachine";
import type { FireRequest, ReloadRequest, SwitchWeaponRequest, Vec3 } from "../../net/messages";

export interface WeaponRigStateChange {
  activeWeaponId: WeaponId;
  active: WeaponState;
  states: Record<WeaponId, WeaponState>;
}

export interface WeaponRigProps {
  onFireRequest: (req: FireRequest) => void;
  onReloadRequest?: (req: ReloadRequest) => void;
  onSwitchRequest?: (req: SwitchWeaponRequest) => void;
  canEngage?: () => boolean;
  ownedWeapons?: WeaponId[];
  /** Local player's killstreak perk tier — scales predicted fire/reload timing to match the server. */
  perkTier?: number;
  onStateChange?: (change: WeaponRigStateChange) => void;
}

/** Bridges camera-derived aim (origin/direction) into useWeapon, and applies zoom FOV to the camera. */
export function WeaponRig({ onFireRequest, onReloadRequest, onSwitchRequest, canEngage, ownedWeapons, perkTier, onStateChange }: WeaponRigProps) {
  const { camera } = useThree();
  const dirVec = useRef(new Vector3());

  const getOrigin = useCallback((): Vec3 => [camera.position.x, camera.position.y, camera.position.z], [camera]);
  const getDirection = useCallback((): Vec3 => {
    camera.getWorldDirection(dirVec.current);
    return [dirVec.current.x, dirVec.current.y, dirVec.current.z];
  }, [camera]);

  const { activeWeaponId, states } = useWeapon({
    getOrigin,
    getDirection,
    onFireRequest,
    onReloadRequest,
    onSwitchRequest,
    canEngage,
    ownedWeapons,
    perkTier,
  });
  const active = states[activeWeaponId];
  const def = WEAPONS[activeWeaponId];

  useEffect(() => {
    onStateChange?.({ activeWeaponId, active, states });
  }, [activeWeaponId, active, states, onStateChange]);

  useEffect(() => {
    const cam = camera as ThreePerspectiveCamera;
    cam.fov = def.zoom && active.zoomed ? def.zoom.zoomedFov : DEFAULT_FOV;
    cam.updateProjectionMatrix();
  }, [active.zoomed, camera, def.zoom]);

  return <WeaponViewmodel activeWeaponId={activeWeaponId} active={active} />;
}
