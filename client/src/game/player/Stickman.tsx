import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Detailed } from "@react-three/drei";
import { AdditiveBlending } from "three";
import type { Group } from "three";
import { createSpring, impulseSpring, resetSpring, stepSpring } from "../effects/spring";
import type { WeaponId } from "../weapons/weaponDefs";

/**
 * Written each frame by the owner (RemotePlayers) and read by this model's
 * own useFrame — a plain mutable object so per-frame motion never round-trips
 * through React state.
 */
export interface StickmanPose {
  /** Horizontal speed in m/s — drives the walk-cycle limb swing. */
  speed: number;
  /** Dead players fall over and stay down until the next round resets them. */
  dead: boolean;
  /** Signed sideways lean (radians): the body rolls into a strafe or slide. */
  lean: number;
  /** 0..1 hit-react that decays — a quick backward torso jerk when shot. */
  flinch: number;
  /** Bumped by the owner each time this player lands from a fall — edge-triggers a squash. */
  landTick: number;
  /** 0..1 impact strength of the last landing; scales how deep the squash goes. */
  landImpact: number;
  /** Weapon in hand (from the roster) — picks which third-person gun prop shows. */
  equipped: WeaponId;
  /** Monotonic count of this player's confirmed shots — edge-triggers muzzle flash + arm recoil. */
  fireTick: number;
}

export interface StickmanProps {
  position?: [number, number, number];
  rotationY?: number;
  color?: string;
  /** Show the floating teammate marker above the head. */
  marker?: boolean;
  poseRef?: { current: StickmanPose };
}

const LOD_DISTANCES = [0, 18]; // meters: full detail up close, simplified beyond ~18m
const SWING_FREQUENCY = 2.4; // stride cycles per meter-ish — tuned to read right at 6 m/s
const MAX_SWING = 0.55; // radians of hip/shoulder rotation at full speed

/**
 * Full-detail body with limbs hung from shoulder/hip pivot groups so they can
 * swing procedurally while walking. The mesh capsules hang below their pivot
 * (offset -half-length), so rotating the pivot swings the limb like a joint.
 */
function StickmanHigh({ color, poseRef }: { color: string; poseRef?: { current: StickmanPose } }) {
  // A subtle self-lit tint in the team colour so friend/foe reads even in shadow
  // (kept below the bloom threshold so players tint without glowing).
  const material = useMemo(() => ({ color, emissive: color, emissiveIntensity: 0.15 }), [color]);
  const rootRef = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const gunRevolver = useRef<Group>(null);
  const gunKar98 = useRef<Group>(null);
  const flashRevolver = useRef<Group>(null);
  const flashKar98 = useRef<Group>(null);
  const phase = useRef(0);
  const amplitude = useRef(0);
  // Per-instance so no two players breathe or collapse in lockstep.
  const seed = useMemo(() => Math.random() * Math.PI * 2, []);
  // One spring per limb for the death flop — each lags the body's topple and
  // settles at its own rate instead of rotating rigidly with it.
  const limb = useRef({
    armL: createSpring(0),
    armR: createSpring(0),
    legL: createSpring(0),
    legR: createSpring(0),
  });
  const flopped = useRef(false);
  // Shooting-arm kick, driven by the owner's fireTick edge.
  const armRecoil = useRef(createSpring(0));
  const lastFire = useRef<number | null>(null);
  const flashUntil = useRef(0);

  useFrame(({ clock }, delta) => {
    const pose = poseRef?.current;
    const dead = pose?.dead ?? false;
    const equipped = pose?.equipped ?? "revolver";

    // Gun prop + muzzle flash are toggled imperatively — the pose mutates every
    // frame without a React re-render, so JSX conditionals would go stale.
    if (gunRevolver.current) gunRevolver.current.visible = equipped === "revolver";
    if (gunKar98.current) gunKar98.current.visible = equipped === "kar98";

    // Fire edge: one confirmed shot = one flash + one arm kick. Baseline on the
    // first frame, so joining mid-match doesn't replay the join-time count.
    const ft = pose?.fireTick ?? 0;
    if (lastFire.current === null) lastFire.current = ft;
    if (ft !== lastFire.current) {
      lastFire.current = ft;
      if (!dead) {
        impulseSpring(armRecoil.current, equipped === "kar98" ? 8 : 6);
        flashUntil.current = performance.now() + 70;
      }
    }
    const flashOn = !dead && performance.now() < flashUntil.current;
    if (flashRevolver.current) flashRevolver.current.visible = flashOn && equipped === "revolver";
    if (flashKar98.current) flashKar98.current.visible = flashOn && equipped === "kar98";

    if (dead) {
      // First dead frame: kick the arms so they flail up before hanging. Then
      // every limb springs toward a slack dangle at its own stiffness — the lag
      // and overshoot read as a ragdoll rather than a rigid rotation.
      if (!flopped.current) {
        flopped.current = true;
        impulseSpring(limb.current.armL, -4);
        impulseSpring(limb.current.armR, -5);
        impulseSpring(limb.current.legL, -1.5);
      }
      if (armL.current) {
        armL.current.rotation.x = stepSpring(limb.current.armL, -0.7, 120, 9, delta);
        armL.current.rotation.z = 0; // clear the kar98 support-hand reach
      }
      if (armR.current) {
        armR.current.rotation.x = stepSpring(limb.current.armR, -0.95, 110, 8, delta);
        armR.current.rotation.z = 0;
      }
      if (legL.current) legL.current.rotation.x = stepSpring(limb.current.legL, 0.35, 150, 13, delta);
      if (legR.current) legR.current.rotation.x = stepSpring(limb.current.legR, 0.2, 160, 14, delta);
      if (rootRef.current) {
        rootRef.current.position.set(0, 0, 0);
        rootRef.current.rotation.z = 0;
      }
      amplitude.current = 0;
      return;
    }

    // Alive: clear the flop springs so the next death flails from scratch (the
    // pose logic below overwrites the limb rotations every frame anyway).
    if (flopped.current) {
      flopped.current = false;
      resetSpring(limb.current.armL);
      resetSpring(limb.current.armR);
      resetSpring(limb.current.legL);
      resetSpring(limb.current.legR);
      resetSpring(armRecoil.current);
    }

    const speed = pose ? pose.speed : 0;
    const target = Math.min(1, speed / 6);
    amplitude.current += (target - amplitude.current) * Math.min(1, delta * 10);
    phase.current += delta * speed * SWING_FREQUENCY;

    const swing = Math.sin(phase.current) * MAX_SWING * amplitude.current;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;

    // Everyone is armed: the shooting arm holds a level aim instead of swinging
    // with the gait, kicks up on each shot, and idles with a faint waver.
    const t = clock.elapsedTime;
    const recoilV = stepSpring(armRecoil.current, 0, 260, 16, delta);
    const waver = Math.sin(t * 1.7 + seed) * 0.025;
    if (armR.current) {
      armR.current.rotation.x = -Math.PI / 2 - recoilV * 0.8 + waver;
      armR.current.rotation.z = -0.06;
    }
    if (armL.current) {
      if (equipped === "kar98") {
        // Two-handed rifle: the support arm reaches across to the fore-stock.
        armL.current.rotation.x = -1.25 + waver;
        armL.current.rotation.z = -0.5;
      } else {
        // One-handed revolver: the off arm hangs and counter-swings the gait.
        armL.current.rotation.x = -swing * 0.7;
        armL.current.rotation.z = 0;
      }
    }

    // Idle life (2e): surfaces only when nearly still (walk owns the motion
    // otherwise). Two independent layers — a vertical breath (~0.22 Hz) and a
    // slower horizontal + roll micro-sway (~0.08 Hz) — each on a per-player
    // phase, so a line of standing players never looks frozen or synced.
    const idle = 1 - amplitude.current;
    if (rootRef.current) {
      rootRef.current.position.y = Math.sin(t * 1.38 + seed) * 0.012 * idle;
      rootRef.current.position.x = Math.sin(t * 0.5 + seed * 2) * 0.006 * idle;
      rootRef.current.rotation.z = Math.sin(t * 0.5 + seed * 2) * 0.02 * idle;
    }
  });

  return (
    <group ref={rootRef}>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.6, 4, 8]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <group ref={armL} position={[-0.3, 1.42, 0]}>
        <mesh position={[0, -0.33, 0]} rotation={[0, 0, Math.PI / 10]} castShadow>
          <capsuleGeometry args={[0.06, 0.55, 4, 8]} />
          <meshStandardMaterial {...material} />
        </mesh>
      </group>
      <group ref={armR} position={[0.3, 1.42, 0]}>
        <mesh position={[0, -0.33, 0]} rotation={[0, 0, -Math.PI / 10]} castShadow>
          <capsuleGeometry args={[0.06, 0.55, 4, 8]} />
          <meshStandardMaterial {...material} />
        </mesh>
        {/* Hand anchor: the arm pivot aims by rotating X to -π/2, so a +π/2
            counter-rotation here keeps the gun level, barrel along -Z. */}
        <group position={[0, -0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <group ref={gunRevolver} visible={false}>
            <mesh position={[0, -0.03, 0.03]} castShadow>
              <boxGeometry args={[0.03, 0.08, 0.05]} />
              <meshStandardMaterial color="#3a2a1c" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.03, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.06, 8]} />
              <meshStandardMaterial color="#555a5e" roughness={0.35} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0.035, -0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.016, 0.018, 0.2, 8]} />
              <meshStandardMaterial color="#33383b" roughness={0.3} metalness={0.8} />
            </mesh>
            <group ref={flashRevolver} visible={false} position={[0, 0.035, -0.21]}>
              <RemoteMuzzleFlash />
            </group>
          </group>
          <group ref={gunKar98} visible={false}>
            <mesh position={[0, 0.01, -0.12]} castShadow>
              <boxGeometry args={[0.035, 0.055, 0.55]} />
              <meshStandardMaterial color="#4a3520" roughness={0.75} />
            </mesh>
            <mesh position={[0, 0.035, -0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.011, 0.013, 0.4, 8]} />
              <meshStandardMaterial color="#2e3234" roughness={0.3} metalness={0.8} />
            </mesh>
            <mesh position={[0.035, 0.045, -0.02]} castShadow>
              <boxGeometry args={[0.05, 0.02, 0.02]} />
              <meshStandardMaterial color="#25292b" roughness={0.35} metalness={0.7} />
            </mesh>
            <group ref={flashKar98} visible={false} position={[0, 0.035, -0.72]}>
              <RemoteMuzzleFlash />
            </group>
          </group>
        </group>
      </group>
      <group ref={legL} position={[-0.14, 0.82, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.7, 4, 8]} />
          <meshStandardMaterial {...material} />
        </mesh>
      </group>
      <group ref={legR} position={[0.14, 0.82, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.7, 4, 8]} />
          <meshStandardMaterial {...material} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Third-person muzzle flash: emissive core + additive halo, no light source
 * (up to 9 of these could strobe at once — a pointLight each would be a
 * shader-recompile hazard and a perf cliff). Parent group toggles visibility.
 */
function RemoteMuzzleFlash() {
  return (
    <>
      <mesh>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial color="#fff8d8" emissive="#ffd76a" emissiveIntensity={5} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color="#ffe6a0" transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

/** Single-capsule silhouette for distant players — collapses draw calls (FR-7.2 LOD). */
function StickmanLow({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.9, 0]}>
      <capsuleGeometry args={[0.22, 1.1, 2, 4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/** Floating diamond over teammates' heads — an extra friend/foe cue on top of the team colour. */
function TeammateMarker() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 2.08 + Math.sin(clock.elapsedTime * 2.4) * 0.05;
    ref.current.rotation.y = clock.elapsedTime * 1.5;
  });
  return (
    <group ref={ref} position={[0, 2.08, 0]}>
      <mesh>
        <octahedronGeometry args={[0.09]} />
        <meshStandardMaterial color="#ffffff" emissive="#e8f4ff" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/**
 * Low-poly stickman avatar with distance-based LOD, a procedural walk cycle,
 * and a death topple. Cheap enough to render x10 (5v5) and cheap to network —
 * only position/rotation ever needs syncing; all animation is derived locally.
 */
export function Stickman({ position = [0, 0, 0], rotationY = 0, color = "#e8e8e8", marker = false, poseRef }: StickmanProps) {
  const bodyRef = useRef<Group>(null);
  const fallSpring = useRef(createSpring(0)); // 0 standing .. 1 flat; springs, so it slams down and settles with a small overshoot
  const squash = useRef(createSpring(0)); // landing squash-and-stretch, 0 at rest
  const lastLandTick = useRef(0);
  const wasDead = useRef(false);
  const toppleRoll = useRef(0); // sideways fall bias captured at the moment of death (momentum + per-corpse seed)
  const toppleTwist = useRef(0); // small yaw twist so the corpse isn't a flat faceplant
  const seed = useMemo(() => Math.random(), []);

  useFrame((_state, delta) => {
    const pose = poseRef?.current;
    const dead = pose?.dead ?? false;

    // Rising edge into death: pick a topple direction from the player's last lean
    // (momentum carries the fall) plus a per-corpse seed, so no two collapse alike.
    if (dead && !wasDead.current) {
      const lean = pose?.lean ?? 0;
      toppleRoll.current = lean * 3 + (seed - 0.5) * 0.8;
      toppleTwist.current = (seed - 0.5) * 1.2;
    }
    wasDead.current = dead;

    // Landing squash: one compression per landing, edge-detected off the owner's
    // landTick, its depth scaled by how hard they hit (landImpact).
    const lt = pose?.landTick ?? 0;
    if (lt !== lastLandTick.current) {
      lastLandTick.current = lt;
      if (!dead) squash.current.value = Math.min(1, pose?.landImpact ?? 0);
    }

    const fall = stepSpring(fallSpring.current, dead ? 1 : 0, 90, 13, delta);
    const sq = stepSpring(squash.current, 0, 170, 13, delta);

    if (bodyRef.current) {
      // A downed body topples along its captured direction; a live one leans into
      // its motion and jerks back from a hit. The topple dominates once dead.
      const lean = dead ? 0 : (pose?.lean ?? 0);
      const flinch = dead ? 0 : (pose?.flinch ?? 0);
      bodyRef.current.rotation.x = (-Math.PI / 2) * fall - flinch * 0.35;
      bodyRef.current.rotation.z = lean + toppleRoll.current * fall;
      bodyRef.current.rotation.y = toppleTwist.current * fall;
      bodyRef.current.position.y = 0.25 * fall;
      // Squash-and-stretch: compress vertically + bulge horizontally on impact,
      // then spring back through a slight stretch (a small bounce) to rest.
      bodyRef.current.scale.set(1 + 0.12 * sq, 1 - 0.18 * sq, 1 + 0.12 * sq);
    }
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={bodyRef}>
        <Detailed distances={LOD_DISTANCES}>
          <StickmanHigh color={color} poseRef={poseRef} />
          <StickmanLow color={color} />
        </Detailed>
      </group>
      {marker && !(poseRef?.current.dead ?? false) && <TeammateMarker />}
    </group>
  );
}
