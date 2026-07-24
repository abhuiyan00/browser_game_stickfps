import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3 } from "three";
import { ObjectPool } from "../pooling/ObjectPool";
import type { ShotFired } from "../../net/messages";

const TRACER_LIFETIME_MS = 80;
const TRACER_LENGTH = 200; // matches server MAX_RANGE (combat/hitValidation.ts)
const POOL_SIZE = 16; // headroom above 10 concurrent shooters

interface TracerSlot {
  line: Line;
  expiresAt: number;
}

function createTracer(): TracerSlot {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
  const material = new LineBasicMaterial({ color: "#fff6b0", transparent: true, opacity: 0.85 });
  const line = new Line(geometry, material);
  line.visible = false;
  line.frustumCulled = false;
  return { line, expiresAt: 0 };
}

function resetTracer(slot: TracerSlot): void {
  slot.line.visible = false;
}

export interface BulletTracersProps {
  drainShotEvents: () => ShotFired[];
}

/**
 * Pooled tracer lines. `ObjectPool` pre-allocates every `Line` up front (see
 * `all()` below, mounted once as R3F primitives); a "shot" only toggles
 * visibility and rewrites an existing geometry's positions — no `new` in the
 * per-frame hot path (C4).
 */
export function BulletTracers({ drainShotEvents }: BulletTracersProps) {
  const pool = useMemo(() => new ObjectPool<TracerSlot>(createTracer, resetTracer, POOL_SIZE), []);
  const activeRef = useRef<TracerSlot[]>([]);
  const start = useMemo(() => new Vector3(), []);
  const end = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const shots = drainShotEvents();
    for (const shot of shots) {
      const slot = pool.acquire();
      start.set(shot.origin[0], shot.origin[1], shot.origin[2]);
      end.set(
        shot.origin[0] + shot.direction[0] * TRACER_LENGTH,
        shot.origin[1] + shot.direction[1] * TRACER_LENGTH,
        shot.origin[2] + shot.direction[2] * TRACER_LENGTH,
      );
      const positions = slot.line.geometry.attributes.position as BufferAttribute;
      positions.setXYZ(0, start.x, start.y, start.z);
      positions.setXYZ(1, end.x, end.y, end.z);
      positions.needsUpdate = true;
      slot.line.visible = true;
      slot.expiresAt = performance.now() + TRACER_LIFETIME_MS;
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
        <primitive key={i} object={slot.line} />
      ))}
    </>
  );
}
