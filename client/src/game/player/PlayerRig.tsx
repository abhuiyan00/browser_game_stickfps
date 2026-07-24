import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useFixedTimestep } from "../loop/useFixedTimestep";
import { useKeyboardState } from "../input/useKeyboardState";
import { createInitialPlayerState, stepPlayer, GROUND_Y, type PlayerState } from "./playerController";
import { PERK_MOVE_MULT } from "../perks";
import { reconcile } from "../../net/reconciliation";
import { decayTrauma, readTrauma } from "../effects/screenShake";
import { decayFireKick, setMoveSpeed } from "../effects/crosshairBloom";
import { playFootstep } from "../../audio/sounds";
import type { PlayerInput as NetPlayerInput, Vec3 } from "../../net/messages";

const MAX_SHAKE = 0.05; // meters of camera jitter at full trauma
const STEP_STRIDE = 2.2; // meters of grounded travel between footstep sounds

export interface PlayerRigProps {
  onStep?: (state: PlayerState) => void;
  /** Called every fixed tick so the net layer can send it to the server (Phase 4). */
  onInput?: (input: NetPlayerInput) => void;
  /** Latest authoritative position for the local player, if connected (Phase 4 reconciliation). */
  getAuthoritativePosition?: () => Vec3 | null;
  /** Local player's killstreak perk tier — scales predicted move speed to match the server. */
  perkTier?: number;
}

export function PlayerRig({ onStep, onInput, getAuthoritativePosition, perkTier = 0 }: PlayerRigProps) {
  const { camera } = useThree();
  const keys = useKeyboardState();
  const playerState = useRef<PlayerState>(createInitialPlayerState());
  const tickRef = useRef(0);
  const perkTierRef = useRef(perkTier);
  perkTierRef.current = perkTier;
  // Physics snaps the eye height on crouch/slide (a 0.6m pop); the camera lerps
  // toward it so the view drops/rises smoothly. Hit origin uses the camera, but
  // the server's ±2m origin-plausibility tolerance easily covers the lag.
  const camYRef = useRef(GROUND_Y);
  const stepDist = useRef(0); // accumulated grounded distance toward the next footstep
  // The simulation position without shake. The fixed tick updates this; a
  // per-frame pass writes camera.position = basePos + trauma jitter, so the
  // camera has exactly one writer (no fighting between movement and shake).
  const basePos = useMemo(() => new Vector3(0, GROUND_Y, 0), []);

  useEffect(() => {
    // YXZ decomposition keeps yaw (Y) readable independent of pitch (X),
    // matching PointerLockControls' internal euler order.
    camera.rotation.order = "YXZ";
    // Dev-only hook for browser-automation tests: headless Chromium delivers a
    // stray look delta when pointer lock engages, so scripted aim needs to read
    // the real camera orientation to correct itself. Stripped from prod builds.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__stickfpsCamera = camera;
    }
  }, [camera]);

  useFixedTimestep((dt) => {
    tickRef.current += 1;
    const yaw = camera.rotation.y;
    // With the pointer unlocked (pause menu open), movement keys belong to the
    // UI, not the game — send neutral input so the player also *stops* moving
    // server-side instead of continuing on their last pressed keys.
    const locked = typeof document !== "undefined" && document.pointerLockElement !== null;
    const input = {
      forward: locked && keys.current.forward,
      backward: locked && keys.current.backward,
      left: locked && keys.current.left,
      right: locked && keys.current.right,
      jump: locked && keys.current.jump,
      crouch: locked && keys.current.crouch,
      yaw,
    };

    const speedMult = PERK_MOVE_MULT[perkTierRef.current] ?? 1;
    let next = stepPlayer(playerState.current, input, dt, speedMult);

    const authoritative = getAuthoritativePosition?.() ?? null;
    if (authoritative) {
      next = reconcile(next, authoritative);
    }

    playerState.current = next;
    camYRef.current += (next.position[1] - camYRef.current) * 0.35;
    basePos.set(next.position[0], camYRef.current, next.position[2]);

    // Drive the dynamic crosshair from live movement, and bleed the fire kick.
    const hSpeed = Math.hypot(next.velocity[0], next.velocity[2]);
    setMoveSpeed(locked ? hSpeed : 0);
    decayFireKick(dt);

    // Footsteps: tick a stride every STEP_STRIDE meters of grounded running.
    // Sliding is silent (you're skating, not stepping); unlocked = in a menu.
    if (locked && next.onGround && !next.sliding && hSpeed > 1.5) {
      stepDist.current += hSpeed * dt;
      if (stepDist.current >= STEP_STRIDE) {
        stepDist.current = 0;
        playFootstep(Math.min(1, hSpeed / 7));
      }
    } else if (stepDist.current > STEP_STRIDE * 0.5) {
      stepDist.current = STEP_STRIDE * 0.5; // keep a partial stride so the next step isn't instant
    }

    onInput?.({ ...input, clientTick: tickRef.current });
    onStep?.(next);
  });

  // Runs after the fixed-timestep pass above (registered later in this
  // component), every render frame: place the camera at the simulated position
  // plus a decaying random shake. Shake is 0 at rest, so this is a plain copy.
  useFrame((_state, delta) => {
    const trauma = readTrauma();
    if (trauma > 0) {
      const mag = trauma * trauma * MAX_SHAKE;
      camera.position.set(
        basePos.x + (Math.random() * 2 - 1) * mag,
        basePos.y + (Math.random() * 2 - 1) * mag,
        basePos.z + (Math.random() * 2 - 1) * mag,
      );
      decayTrauma(delta);
    } else {
      camera.position.copy(basePos);
    }
  });

  return null;
}
