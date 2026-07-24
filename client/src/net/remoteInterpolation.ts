import type { Vec3 } from "./messages";

interface BufferedSample {
  position: Vec3;
  yaw: number;
  receivedAt: number;
}

export interface InterpolatedSample {
  position: Vec3;
  yaw: number;
}

const INTERP_DELAY_MS = 100;
const BUFFER_SIZE = 2;
/**
 * Snapshots arrive every server tick (~16ms) while a player is connected —
 * anything this stale means they're gone, and rendering the last sample
 * forever would leave a frozen ghost standing in the arena.
 */
const STALE_MS = 1000;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Angle-aware lerp along the shortest arc. Yaw arrives wrapped to (-π, π]
 * (three.js re-derives the camera euler from its quaternion), so a raw lerp
 * across the ±π seam would spin the model the long way round for a frame or two.
 */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + diff * t;
}

/**
 * Buffers the last two snapshots per remote player and renders them
 * `INTERP_DELAY_MS` in the past, interpolated — the standard fixed-delay
 * interpolation technique so remote motion stays smooth despite snapshots
 * arriving only once per server tick (FR-4.4).
 */
export class RemotePlayerInterpolator {
  private buffers = new Map<string, BufferedSample[]>();

  push(playerId: string, position: Vec3, yaw: number, now: number = Date.now()): void {
    const buffer = this.buffers.get(playerId) ?? [];
    buffer.push({ position, yaw, receivedAt: now });
    while (buffer.length > BUFFER_SIZE) buffer.shift();
    this.buffers.set(playerId, buffer);
  }

  sample(playerId: string, now: number = Date.now()): InterpolatedSample | null {
    const buffer = this.buffers.get(playerId);
    if (!buffer || buffer.length === 0) return null;
    if (now - buffer[buffer.length - 1].receivedAt > STALE_MS) return null;
    if (buffer.length === 1) return { position: buffer[0].position, yaw: buffer[0].yaw };

    const [a, b] = buffer;
    const renderTime = now - INTERP_DELAY_MS;
    const span = b.receivedAt - a.receivedAt;
    if (span <= 0) return { position: b.position, yaw: b.yaw };

    const t = Math.min(1, Math.max(0, (renderTime - a.receivedAt) / span));
    return {
      position: [
        lerp(a.position[0], b.position[0], t),
        lerp(a.position[1], b.position[1], t),
        lerp(a.position[2], b.position[2], t),
      ],
      yaw: lerpAngle(a.yaw, b.yaw, t),
    };
  }

  remove(playerId: string): void {
    this.buffers.delete(playerId);
  }

  activeIds(): string[] {
    return Array.from(this.buffers.keys());
  }
}
