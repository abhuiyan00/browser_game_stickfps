import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, Group, Mesh, Vector3 } from "three";
import { computeBoltPose } from "./boltAction";
import { addTrauma } from "../effects/screenShake";
import { addFireKick } from "../effects/crosshairBloom";
import { createSpring, impulseSpring, resetSpring, stepSpring } from "../effects/spring";
import { WEAPONS, type WeaponId } from "./weaponDefs";
import type { WeaponState } from "./weaponStateMachine";

export interface WeaponViewmodelProps {
  activeWeaponId: WeaponId;
  active: WeaponState;
}

/** Recoil "kick" strength/recovery speed differ by weapon — the bolt rifle thumps, the revolver snaps. */
const RECOIL: Record<WeaponId, { kick: number; decay: number }> = {
  revolver: { kick: 1, decay: 9 },
  kar98: { kick: 1.8, decay: 4.5 },
};

const MUZZLE_FLASH_MS = 55;
/** How hard the viewmodel sways while moving at full speed. */
const BOB_AMPLITUDE = 0.011;
const BOB_FREQUENCY = 9;
const MAX_SPEED = 7; // matches playerController walk cap — full bob at run speed
/** Look-sway (weapon lag): how much a per-frame look delta feeds the trailing spring, and the clamp that stops a fast spin flinging the gun off-screen. */
const LOOK_SWAY_GAIN = 2.4;
const LOOK_SWAY_MAX = 0.11;
function clampSway(v: number): number {
  return Math.max(-LOOK_SWAY_MAX, Math.min(LOOK_SWAY_MAX, v));
}

/**
 * First-person gun model. Parented directly to the camera object (not the
 * scene root) so it moves with mouse-look for free — R3F's `<primitive>`
 * still lets its children be declared in JSX, they just render into a group
 * that lives outside the normal scene graph.
 *
 * The renderer only traverses `scene`'s descendants, and R3F's default
 * camera isn't one of them — so the camera itself has to be added to the
 * scene once, or anything parented to it (this group) never gets drawn.
 */
export function WeaponViewmodel({ activeWeaponId, active }: WeaponViewmodelProps) {
  const { camera, scene } = useThree();
  const weaponGroup = useMemo(() => new Group(), []);
  // Recoil is a spring now, not a decaying scalar: a shot snaps it up to the
  // per-weapon kick, then it springs back through rest with a slight overshoot.
  const recoilSpring = useRef(createSpring(0));
  const recoilYawSpring = useRef(createSpring(0)); // horizontal kick — a small random sideways jerk per shot
  const prevAmmo = useRef(active.ammo);
  const prevWeapon = useRef(activeWeaponId);
  const flashUntil = useRef(0);
  // Draw-from-holster: 0 = holstered, springs up to 1 (rest) and overshoots ~15%.
  const drawSpring = useRef(createSpring(1));
  const bobPhase = useRef(0);
  const bobIntensity = useRef(0);
  const swayPhase = useRef(Math.random() * Math.PI * 2); // per-instance idle-sway phase, unsynced from the bob
  const prevCamPos = useRef<Vector3 | null>(null);
  // Look-sway (weapon lag) + landing dip — both self-contained, read off the camera each frame.
  const lookSwayYaw = useRef(createSpring(0));
  const lookSwayPitch = useRef(createSpring(0));
  const prevLook = useRef<{ x: number; y: number } | null>(null);
  const landDip = useRef(createSpring(0));
  const prevCamY = useRef<number | null>(null);
  const prevCamVY = useRef(0);

  useEffect(() => {
    if (camera.parent !== scene) scene.add(camera);
    camera.add(weaponGroup);
    return () => {
      camera.remove(weaponGroup);
    };
  }, [camera, scene, weaponGroup]);

  // Switching weapons plays a spring raise-from-holster: the gun visibly whips
  // up and isn't "ready" while it settles, overlapping the state machine's own
  // EQUIP_SEC fire gate (which, not this animation, decides when you can shoot).
  useEffect(() => {
    // Whip the gun up from the holster: drop to lowered (0) and kick its velocity
    // so it overshoots the rest pose (~15%) before settling — a snap-up, not a slide.
    resetSpring(drawSpring.current, 0);
    impulseSpring(drawSpring.current, 4);
  }, [activeWeaponId]);

  useFrame(({ clock }, delta) => {
    // A switch swaps which weapon's ammo we're looking at — resync the baseline
    // so a lower-capacity incoming weapon doesn't read as a shot just fired.
    if (prevWeapon.current !== activeWeaponId) {
      prevWeapon.current = activeWeaponId;
      prevAmmo.current = active.ammo;
    }
    const kick = RECOIL[activeWeaponId].kick;
    if (active.ammo < prevAmmo.current) {
      // Snap the recoil spring up to the per-weapon kick peak and add a little
      // extra velocity so it keeps climbing for a frame (reads as a punch, not a
      // teleport). It then springs back through rest with a slight overshoot —
      // kick → settle, instead of the old linear slide-back.
      recoilSpring.current.value += kick;
      impulseSpring(recoilSpring.current, kick * 4);
      recoilYawSpring.current.value += (Math.random() * 2 - 1) * kick * 0.04;
      flashUntil.current = performance.now() + MUZZLE_FLASH_MS;
      // Fire punch: heavier guns kick the view harder (kick is tuned per weapon).
      addTrauma(kick * 0.11);
      addFireKick(kick * 5); // bloom the crosshair on each shot
    }
    prevAmmo.current = active.ammo;
    // Per-weapon character now lives in the spring damping: heavier guns (low
    // `decay`) bounce more on recovery, an SMG snaps flat. The spring gives every
    // weapon the same kick-overshoot-settle shape, tuned once.
    const recoilDamping = 16 + RECOIL[activeWeaponId].decay;
    const recoilV = stepSpring(recoilSpring.current, 0, 280, recoilDamping, delta);
    const recoilYawV = stepSpring(recoilYawSpring.current, 0, 300, 22, delta);
    const drawV = stepSpring(drawSpring.current, 1, 280, 18, delta);

    // Look-sway (weapon lag): the gun trails fast mouse turns then springs back to
    // centre — the classic weighty-aim feel. A pointer-lock jump/wrap (huge delta)
    // is ignored so the gun never flings off-screen.
    const ry = camera.rotation.y;
    const rx = camera.rotation.x;
    if (!prevLook.current) prevLook.current = { x: rx, y: ry };
    let dyaw = ry - prevLook.current.y;
    let dpitch = rx - prevLook.current.x;
    prevLook.current.x = rx;
    prevLook.current.y = ry;
    if (Math.abs(dyaw) > 0.5) dyaw = 0;
    if (Math.abs(dpitch) > 0.5) dpitch = 0;
    lookSwayYaw.current.value = clampSway(lookSwayYaw.current.value + dyaw * LOOK_SWAY_GAIN);
    lookSwayPitch.current.value = clampSway(lookSwayPitch.current.value + dpitch * LOOK_SWAY_GAIN);
    const lookSwayYawV = stepSpring(lookSwayYaw.current, 0, 90, 14, delta);
    const lookSwayPitchV = stepSpring(lookSwayPitch.current, 0, 90, 14, delta);

    // Landing dip: the viewmodel punches down when you hit the ground after a fall
    // (real falls land at ~5–9 m/s; a one-frame crouch stance-snap is filtered out).
    const camY = camera.position.y;
    if (prevCamY.current === null) prevCamY.current = camY;
    const camVY = delta > 0 ? (camY - prevCamY.current) / delta : 0;
    prevCamY.current = camY;
    if (prevCamVY.current < -3 && prevCamVY.current > -14 && camVY > -0.5) {
      impulseSpring(landDip.current, Math.min(0.5, -prevCamVY.current * 0.05));
    }
    prevCamVY.current = camVY;
    const landV = stepSpring(landDip.current, 0, 180, 12, delta);

    // Walk bob: how fast is the camera actually moving across the ground?
    if (!prevCamPos.current) prevCamPos.current = camera.position.clone();
    const dx = camera.position.x - prevCamPos.current.x;
    const dz = camera.position.z - prevCamPos.current.z;
    prevCamPos.current.copy(camera.position);
    const speed = delta > 0 ? Math.hypot(dx, dz) / delta : 0;
    const targetIntensity = Math.min(1, speed / MAX_SPEED);
    bobIntensity.current += (targetIntensity - bobIntensity.current) * Math.min(1, delta * 8);
    bobPhase.current += delta * BOB_FREQUENCY * (0.4 + bobIntensity.current);

    const bobY = Math.sin(bobPhase.current * 2) * BOB_AMPLITUDE * bobIntensity.current;
    const bobX = Math.cos(bobPhase.current) * BOB_AMPLITUDE * 0.7 * bobIntensity.current;
    // Idle life, split into two independent layers (2e) that only surface when
    // you're standing still (the walk bob owns the motion otherwise): a vertical
    // "breath" and a slower horizontal + roll "micro-sway" on its own phase.
    const idle = 1 - bobIntensity.current;
    const breatheY = Math.sin(clock.elapsedTime * 1.4) * 0.0022 * (0.4 + 0.6 * idle);
    const swayX = Math.cos(clock.elapsedTime * 0.8 + swayPhase.current) * 0.0016 * idle;
    const swayRoll = Math.sin(clock.elapsedTime * 0.55 + swayPhase.current) * 0.012 * idle;

    // Reload: the gun dips down-and-back-up across the reload duration and
    // cants sideways (showing the revolver's cylinder / the Kar98's receiver).
    // sin(p·π) shapes it: 0 at both ends, deepest mid-reload — so the motion
    // finishes exactly when the state machine does, no snap on either edge.
    let reloadDip = 0;
    if (active.phase === "reloading") {
      const def = WEAPONS[activeWeaponId];
      const p = Math.min(1, Math.max(0, 1 - active.reloadRemaining / def.reloadSec));
      reloadDip = Math.sin(p * Math.PI);
    }
    // The Kar98's reload showpiece is the bolt cycle below — keep its dip subtle.
    const dipScale = activeWeaponId === "revolver" ? 1 : 0.4;
    const reloadTilt = -0.55 * reloadDip * dipScale;
    const reloadRoll = 0.3 * reloadDip * dipScale;
    const lower = 1 - drawV; // 1 at switch start -> 0 drawn; briefly negative at the overshoot peak

    weaponGroup.position.set(
      bobX + swayX - lookSwayYawV * 0.5,
      -0.03 * recoilV - lower * 0.22 - reloadDip * dipScale * 0.09 + bobY + breatheY + lookSwayPitchV * 0.4 - landV * 0.14,
      0.1 * recoilV,
    );
    // `lower` also rolls the gun slightly during the draw, so a switch reads as
    // a wrist-flick up from the holster rather than a flat vertical slide. Look-sway
    // and the landing dip ride on top of the recoil/reload/draw rotations.
    weaponGroup.rotation.set(
      reloadTilt + recoilV * 0.12 + lower * 0.7 + lookSwayPitchV * 0.7 + landV * 0.22,
      recoilYawV - lookSwayYawV * 1.1,
      swayRoll + reloadRoll + lower * 0.35 + lookSwayYawV * 0.5,
    );
  });

  // Kar98's zoom simulates looking down a scope — the gun body wouldn't be
  // visible in that view, so hide the model rather than clip through it.
  const hidden = activeWeaponId === "kar98" && active.zoomed;
  const flash = performance.now() < flashUntil.current;

  return (
    <primitive object={weaponGroup} visible={!hidden}>
      {activeWeaponId === "revolver" && <RevolverModel active={active} flash={flash} />}
      {activeWeaponId === "kar98" && <Kar98Model active={active} flash={flash} />}
      <ShellCasings activeWeaponId={activeWeaponId} active={active} />
    </primitive>
  );
}

const SHELL_POOL = 6;
const SHELL_LIFETIME = 0.5; // seconds a casing tumbles before it's recycled
// Ejection port per weapon (camera-local). The revolver keeps its casings in the
// cylinder, so it has no port and drops nothing.
const EJECT_PORTS: Partial<Record<WeaponId, [number, number, number]>> = {
  kar98: [0.31, -0.28, -0.6],
};

interface ShellSlot {
  life: number;
  pos: Vector3;
  vel: Vector3;
}

/**
 * Brass casings flung out the ejection port on each shot — pooled (no per-shot
 * allocation, C4) and animated in camera-local space, so they tumble with the
 * viewmodel. Purely cosmetic feedback; the revolver ejects nothing.
 */
function ShellCasings({ activeWeaponId, active }: { activeWeaponId: WeaponId; active: WeaponState }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const shells = useRef<ShellSlot[]>(
    Array.from({ length: SHELL_POOL }, () => ({ life: 0, pos: new Vector3(), vel: new Vector3() })),
  );
  const prevAmmo = useRef(active.ammo);
  const prevWeapon = useRef(activeWeaponId);
  const cursor = useRef(0);

  useFrame((_state, delta) => {
    // Same baseline resync as the viewmodel: switching weapons must not eject a
    // phantom casing just because the incoming magazine is smaller.
    if (prevWeapon.current !== activeWeaponId) {
      prevWeapon.current = activeWeaponId;
      prevAmmo.current = active.ammo;
    }
    const port = EJECT_PORTS[activeWeaponId];
    if (active.ammo < prevAmmo.current && port) {
      const shell = shells.current[cursor.current];
      cursor.current = (cursor.current + 1) % SHELL_POOL;
      shell.life = SHELL_LIFETIME;
      shell.pos.set(port[0], port[1], port[2]);
      // Out to the right and up, with a little scatter — then gravity pulls it down.
      shell.vel.set(0.35 + Math.random() * 0.15, 0.5 + Math.random() * 0.2, 0.2 + Math.random() * 0.1);
    }
    prevAmmo.current = active.ammo;

    for (let i = 0; i < SHELL_POOL; i++) {
      const shell = shells.current[i];
      const mesh = meshes.current[i];
      if (!mesh) continue;
      if (shell.life <= 0) {
        mesh.visible = false;
        continue;
      }
      shell.life -= delta;
      shell.vel.y -= 3 * delta; // gentle local "gravity"
      shell.pos.addScaledVector(shell.vel, delta);
      mesh.position.copy(shell.pos);
      mesh.rotation.x += delta * 14;
      mesh.rotation.z += delta * 10;
      mesh.scale.setScalar(0.6 + 0.4 * Math.max(0, shell.life / SHELL_LIFETIME));
      mesh.visible = true;
    }
  });

  return (
    <>
      {Array.from({ length: SHELL_POOL }, (_, i) => (
        <mesh key={i} ref={(el) => { meshes.current[i] = el; }} visible={false}>
          <cylinderGeometry args={[0.008, 0.008, 0.03, 6]} />
          <meshStandardMaterial color="#caa24a" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
    </>
  );
}

/** Brief self-lit burst at the barrel tip — visible for ~3 frames after each shot. */
function MuzzleFlash({ active, position }: { active: boolean; position: [number, number, number] }) {
  return (
    <group position={position} visible={active}>
      <mesh>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshStandardMaterial color="#fff8d8" emissive="#ffd76a" emissiveIntensity={6} />
      </mesh>
      {/* additive bloom halo so each shot flares brightly through the value filter */}
      <mesh>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshBasicMaterial color="#ffe6a0" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight color="#ffd76a" intensity={active ? 3 : 0} distance={4} />
    </group>
  );
}

function RevolverModel({ active, flash }: { active: WeaponState; flash: boolean }) {
  const cylinderSpinRef = useRef<Group>(null);

  useFrame((_state, delta) => {
    // A light flourish while reloading — no real cylinder-swap animation, just
    // a spin to read as "cycling the chambers" rather than a static prop.
    if (active.phase === "reloading" && cylinderSpinRef.current) {
      cylinderSpinRef.current.rotation.z += delta * 6;
    }
  });

  return (
    <group position={[0.3, -0.28, -0.55]}>
      <mesh position={[0, -0.08, 0.02]} castShadow>
        <boxGeometry args={[0.06, 0.16, 0.07]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.7} />
      </mesh>
      <group ref={cylinderSpinRef} position={[0, 0, 0.05]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.09, 12]} />
          <meshStandardMaterial color="#555a5e" roughness={0.35} metalness={0.7} />
        </mesh>
      </group>
      <mesh position={[0, 0.005, -0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.022, 0.28, 10]} />
        <meshStandardMaterial color="#33383b" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.05, 0.03]} castShadow>
        <boxGeometry args={[0.03, 0.04, 0.08]} />
        <meshStandardMaterial color="#2b2f31" roughness={0.4} metalness={0.6} />
      </mesh>
      <MuzzleFlash active={flash} position={[0, 0.005, -0.34]} />
    </group>
  );
}

const KAR98_BOLT_BASE_Z = 0.08;

function Kar98Model({ active, flash }: { active: WeaponState; flash: boolean }) {
  const boltRef = useRef<Group>(null);

  useFrame(() => {
    const def = WEAPONS.kar98;
    // A Kar98 must be cycled by hand before it can fire again — that's
    // exactly what the fire cooldown represents narratively, so the bolt
    // cycles once per shot (cooldown) and again, more deliberately, on an
    // explicit reload. Resting/idle keeps the bolt fully closed (progress 1).
    let progress = 1;
    if (active.phase === "cooldown") progress = 1 - active.cooldownRemaining / def.cooldownSec;
    else if (active.phase === "reloading") progress = 1 - active.reloadRemaining / def.reloadSec;

    const pose = computeBoltPose(progress);
    if (boltRef.current) {
      boltRef.current.rotation.z = pose.liftAngle;
      boltRef.current.position.z = KAR98_BOLT_BASE_Z + pose.pullOffset;
    }
  });

  return (
    <group position={[0.26, -0.32, -0.7]}>
      <mesh position={[0, -0.02, -0.15]} castShadow>
        <boxGeometry args={[0.06, 0.09, 0.55]} />
        <meshStandardMaterial color="#4a3520" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.02, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.026, 0.5, 10]} />
        <meshStandardMaterial color="#3a3e41" roughness={0.3} metalness={0.75} />
      </mesh>
      <mesh position={[0, 0.02, -0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.016, 0.45, 10]} />
        <meshStandardMaterial color="#2e3234" roughness={0.3} metalness={0.8} />
      </mesh>
      <group ref={boltRef} position={[0.05, 0.05, KAR98_BOLT_BASE_Z]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.12, 10]} />
          <meshStandardMaterial color="#2e3234" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0.09, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
          <meshStandardMaterial color="#25292b" roughness={0.35} metalness={0.7} />
        </mesh>
      </group>
      <MuzzleFlash active={flash} position={[0, 0.02, -0.76]} />
    </group>
  );
}

