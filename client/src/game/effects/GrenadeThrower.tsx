import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Vec3 } from "../../net/messages";

/** Ability input only counts while the pointer is captured — same gate as weapon fire. */
function isPointerLocked(): boolean {
  return typeof document !== "undefined" && document.pointerLockElement !== null;
}

export interface GrenadeThrowerProps {
  /** Called with the camera-derived origin + aim direction on a [G] press. The server decides if a throw actually happens. */
  onThrow: (origin: Vec3, direction: Vec3) => void;
  /** Same engagement gate as firing (action phase, alive) — avoids predicting a throw the server will reject. */
  canThrow?: () => boolean;
}

/**
 * Listens for [G] and forwards the current camera origin/aim to `onThrow`. Lives
 * inside the Canvas so it can read the live camera; renders nothing. The actual
 * cooldown + spawn are server-authoritative — this only expresses intent (C1).
 */
export function GrenadeThrower({ onThrow, canThrow }: GrenadeThrowerProps) {
  const { camera } = useThree();
  useEffect(() => {
    const dir = new Vector3();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyG" || !isPointerLocked()) return;
      if (canThrow && !canThrow()) return;
      camera.getWorldDirection(dir);
      onThrow([camera.position.x, camera.position.y, camera.position.z], [dir.x, dir.y, dir.z]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [camera, onThrow, canThrow]);
  return null;
}
