import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { ObjectPool } from "../pooling/ObjectPool";
import type { HitResult } from "../../net/messages";

const PARTICLE_LIFETIME_MS = 150;
const POOL_SIZE = 16;

interface ParticleSlot {
  mesh: Mesh;
  expiresAt: number;
}

function createParticle(): ParticleSlot {
  const geometry = new SphereGeometry(0.08, 6, 6);
  const material = new MeshBasicMaterial({ color: "#ffcf6b" });
  const mesh = new Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  return { mesh, expiresAt: 0 };
}

function resetParticle(slot: ParticleSlot): void {
  slot.mesh.visible = false;
}

export interface ImpactParticlesProps {
  drainHitEvents: () => HitResult[];
}

/**
 * Single-sphere "flash" impact effect (a real multi-particle burst is out of
 * scope for v1 — see docs/specs/task-7.1.md). Pooled the same way as
 * `BulletTracers`: every mesh is pre-allocated and mounted once; a hit only
 * toggles visibility/position, never allocates (C4).
 */
export function ImpactParticles({ drainHitEvents }: ImpactParticlesProps) {
  const pool = useMemo(() => new ObjectPool<ParticleSlot>(createParticle, resetParticle, POOL_SIZE), []);
  const activeRef = useRef<ParticleSlot[]>([]);

  useFrame(() => {
    const hits = drainHitEvents();
    for (const hit of hits) {
      const slot = pool.acquire();
      slot.mesh.position.set(hit.point[0], hit.point[1], hit.point[2]);
      slot.mesh.visible = true;
      slot.expiresAt = performance.now() + PARTICLE_LIFETIME_MS;
      activeRef.current.push(slot);
    }

    if (activeRef.current.length === 0) return;
    const now = performance.now();
    activeRef.current = activeRef.current.filter((slot) => {
      if (now >= slot.expiresAt) {
        pool.release(slot);
        return false;
      }
      return true;
    });
  });

  return (
    <>
      {pool.all().map((slot, i) => (
        <primitive key={i} object={slot.mesh} />
      ))}
    </>
  );
}
