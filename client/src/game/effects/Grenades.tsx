import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from "three";
import { addTrauma } from "./screenShake";
import { GRENADE_BLAST_RADIUS } from "../grenadeConfig";
import type { GrenadeExplosion, GrenadeSnapshot } from "../../net/messages";

const MAX_PROJECTILES = 8; // headroom — usually 0-2 in flight
const HAZARD = new Color("#ff5a2a");

/**
 * Live grenade projectiles. The server owns every position (broadcast each tick
 * in RoomState-adjacent grenade snapshots); this just renders the current set —
 * a small dark casing with a blinking hazard light. It's a persistent set, not a
 * lifetime effect, so it indexes a fixed pool of meshes rather than acquire/release.
 */
export function GrenadeProjectiles({ getGrenadeProjectiles }: { getGrenadeProjectiles: () => GrenadeSnapshot[] }) {
  const slots = useMemo(() => {
    const geometry = new IcosahedronGeometry(0.16, 0);
    return Array.from({ length: MAX_PROJECTILES }, () => {
      const material = new MeshStandardMaterial({ color: "#2b2f24", emissive: HAZARD, emissiveIntensity: 0.4, roughness: 0.6 });
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      return mesh;
    });
  }, []);

  useFrame(() => {
    const live = getGrenadeProjectiles();
    const blink = 0.25 + Math.abs(Math.sin(performance.now() * 0.012)) * 1.5; // pulsing "armed" light
    for (let i = 0; i < slots.length; i++) {
      const mesh = slots[i];
      const g = live[i];
      if (!g) {
        mesh.visible = false;
        continue;
      }
      mesh.position.set(g.position[0], g.position[1], g.position[2]);
      mesh.rotation.x += 0.2;
      mesh.rotation.y += 0.15;
      (mesh.material as MeshStandardMaterial).emissiveIntensity = blink;
      mesh.visible = true;
    }
  });

  return (
    <>
      {slots.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}

const FLASH_LIFETIME_MS = 440;
const MAX_BLASTS = 6;

interface BlastSlot {
  flash: Mesh;
  light: PointLight;
  bornAt: number;
  active: boolean;
}

/**
 * Grenade detonations. Each blast is an expanding additive flash sphere plus a
 * fading point light, over ~0.4s — and a jolt of camera trauma scaled by how
 * close the blast was to the local camera. Pooled (fixed slot array): a blast
 * only rewrites an existing mesh/light, never allocates in the frame loop (C4).
 */
export function GrenadeExplosions({ drainGrenadeExplosions }: { drainGrenadeExplosions: () => GrenadeExplosion[] }) {
  const { camera } = useThree();
  const slots = useMemo<BlastSlot[]>(() => {
    const geometry = new SphereGeometry(1, 16, 12);
    return Array.from({ length: MAX_BLASTS }, () => {
      const material = new MeshBasicMaterial({ color: "#ffb04a", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
      const flash = new Mesh(geometry, material);
      flash.visible = false;
      flash.frustumCulled = false;
      const light = new PointLight("#ff8a3c", 0, 22, 2);
      light.visible = false;
      return { flash, light, bornAt: 0, active: false };
    });
  }, []);
  const nextRef = useRef(0);

  useFrame(() => {
    const blasts = drainGrenadeExplosions();
    for (const blast of blasts) {
      const slot = slots[nextRef.current % slots.length];
      nextRef.current += 1;
      slot.flash.position.set(blast.position[0], blast.position[1], blast.position[2]);
      slot.light.position.set(blast.position[0], blast.position[1] + 0.5, blast.position[2]);
      slot.bornAt = performance.now();
      slot.active = true;
      slot.flash.visible = true;
      slot.light.visible = true;
      // Camera kick, strongest at the centre of the blast, gone by ~2 radii out.
      const dx = blast.position[0] - camera.position.x;
      const dy = blast.position[1] - camera.position.y;
      const dz = blast.position[2] - camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      addTrauma(Math.max(0, 0.75 * (1 - dist / (GRENADE_BLAST_RADIUS * 2.5))));
    }

    const now = performance.now();
    for (const slot of slots) {
      if (!slot.active) continue;
      const t = (now - slot.bornAt) / FLASH_LIFETIME_MS;
      if (t >= 1) {
        slot.active = false;
        slot.flash.visible = false;
        slot.light.visible = false;
        continue;
      }
      const scale = 0.6 + t * GRENADE_BLAST_RADIUS; // grows out toward the blast radius
      slot.flash.scale.setScalar(scale);
      (slot.flash.material as MeshBasicMaterial).opacity = (1 - t) * 0.7;
      slot.light.intensity = (1 - t) * 26;
    }
  });

  return (
    <>
      {slots.map((slot, i) => (
        <group key={i}>
          <primitive object={slot.flash} />
          <primitive object={slot.light} />
        </group>
      ))}
    </>
  );
}
