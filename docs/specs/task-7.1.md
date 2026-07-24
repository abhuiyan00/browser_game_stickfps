# Spec — Task 7.1/7.2: Perf & Hardening

## Scope

7.1: pooled bullet tracers/impact particles (no per-frame allocation in the hot path) and simple LOD on stickmen. 7.2: an explicit, reproducible audit confirming every hit/movement-deciding computation is server-side, plus fixing any gap found — not just documenting the intended design.

## Files

- `client/src/game/pooling/ObjectPool.ts` — generic `acquire()/release()` pool, no allocation once warmed up.
- `client/src/game/effects/BulletTracers.tsx` — pooled tracer line segments, shown briefly per shot.
- `client/src/game/effects/ImpactParticles.tsx` — pooled burst sprites at `HitResult.point`.
- `client/src/game/player/Stickman.tsx` — wrapped in drei's `<Detailed>` for distance-based LOD (simplified far geometry).
- `server/src/rooms/Room.ts` — broadcasts a lightweight `shot-fired` event to the whole room on every resolved fire request (hit or miss) so every client can render a tracer for every shot, not just its own or ones that hit. **Also fixes a real vulnerability found during the audit below**: `resolveFireRequest` now rejects a `FireRequest` whose reported `origin` is implausibly far from the shooter's server-authoritative position, instead of raycasting from a client-supplied point unconditionally.
- `server/src/combat/hitValidation.ts` — adds `isOriginPlausible(reportedOrigin, actualPosition)` and `MAX_ORIGIN_DRIFT`.
- `docs/security-audit-phase7.md` — the audit itself: what was checked, the grep commands used, and the one finding + fix.

## Interfaces

```ts
class ObjectPool<T> { acquire(): T; release(item: T): void; }
function isOriginPlausible(reportedOrigin: Vec3, actualPosition: Vec3): boolean; // false beyond MAX_ORIGIN_DRIFT
```

New wire event: `shot-fired` (server → room, `{ shooterId, weaponId, origin, direction }`).

## Constraints carried over

- **C4**: bullet tracers and impact particles must come from a pre-allocated pool sized for worst-case concurrent shots (10 players); steady-state play allocates nothing new per frame.
- **C1 / NFR-5**: this task's audit is exactly the mechanism the spec calls for — confirming (and here, fixing) that no client input is trusted beyond a plausibility check.

## Finding from the audit (fixed, not just noted)

`Room.resolveFireRequest` raycast directly from the client-supplied `FireRequest.origin` with no check against the shooter's actual server-tracked position. A modified client could report an origin anywhere (e.g. muzzle-to-forehead against a distant enemy) and the server would faithfully raycast from that spoofed point — a real aim-spoofing vector, exactly what TASKS.md 7.2 asks this task to catch. Fixed by rejecting fire requests whose origin is more than `MAX_ORIGIN_DRIFT` (2m, chosen to tolerate normal client/server position drift under latency) from `shooter.movement.position`, checked before ammo/cooldown is consumed so a legitimate laggy client doesn't lose a shot to the check.

## Acceptance criteria

1. `cd server && npm test && npm run build` succeed, including a new test that a spoofed far-away origin is rejected and a legitimate near-origin shot is not.
2. `cd client && npm test && npm run build` succeed with the pooling/LOD additions.
3. Grep confirms `ObjectPool.acquire`/`release` are the only allocation points for tracers/particles — no `new` inside a `useFrame` callback for these effects.
4. `docs/security-audit-phase7.md` exists and documents the finding above plus the other authority checks (movement, ammo/cooldown, host-only start) with the grep commands used to verify them.

## Open questions

- Full frame-rate profiling with 10 concurrent real players was not performed — no way to launch 10 browser clients in this environment. LOD and pooling are implemented proactively as good practice; a human should profile against TASKS.md 7.1's literal trigger ("if frame drops appear with 10 players") before assuming they're sufficient.
- `MAX_ORIGIN_DRIFT` (2m) is a judgment call, not a spec'd number — tune against real measured latency in playtesting.
