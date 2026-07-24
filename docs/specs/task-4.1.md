# Spec — Task 4.1: Networking (server-authoritative)

## Scope

A Geckos.io server that is sole authority over movement resolution and hit validation, addressable by 6-character room codes. Client sends inputs and fire *requests* only; the server runs the same movement function authoritatively and performs all raycasts. No WebRTC mesh between clients (C2) — every message flows through the server.

## Files

**Server**
- `server/src/net/messages.ts` — canonical message shapes (source of truth; client's `net/messages.ts` mirrors this).
- `server/src/rooms/roomCode.ts` — 6-char code generator, ambiguous characters (`0/O`, `1/I`) excluded.
- `server/src/sim/fixedInterval.ts` — drift-corrected fixed-rate loop for a Node process (no `requestAnimationFrame` server-side).
- `server/src/sim/movement.ts` — server-authoritative `stepPlayer` — **intentionally duplicated** from `client/src/game/player/playerController.ts`, not imported, so the server has no runtime dependency on client code. Follow-up: extract to a shared package once the shape stabilizes (tracked in PROGRESS.md).
- `server/src/combat/weaponRules.ts` — server's own authoritative per-player ammo/cooldown state (does not trust the client's local `useWeapon` state at all).
- `server/src/combat/hitValidation.ts` — ray-vs-sphere hit test (each player modeled as a 0.4 m radius sphere centered at chest height) against all other connected players in the room.
- `server/src/rooms/Room.ts` — per-room player map, fixed-60Hz tick (movement resolution + snapshot broadcast), fire-request handling.
- `server/src/rooms/RoomManager.ts` — create/join/leave, channel-id → room/player bookkeeping, disconnect cleanup.
- `server/src/net/geckosServer.ts` — wires `io.onConnection` to `RoomManager`; declares every wire event name in one place.
- `server/src/index.ts` — express app (`/healthz`), CORS, http server, attaches the Geckos server.

**Client**
- `client/src/net/geckosClient.ts` — connects to the server given a room code; typed `send`/`on` wrappers over the raw channel.
- `client/src/net/prediction.ts` — reconciliation: compares the local predicted `PlayerState` against the authoritative snapshot for the local player and blends toward it when divergence exceeds a threshold (no full input-replay lag compensation in v1 — see Open Questions).
- `client/src/net/remoteInterpolation.ts` — buffers the last two `PositionSnapshot`s per remote player id and interpolates render position by elapsed time between them.
- Wiring: `App.tsx` replaces the Phase 3 `console.debug` fire-request stub with a real `geckosClient` send; `PlayerRig` gains an `onStep` consumer that also sends `PlayerInput` each fixed tick.

## Interfaces

```ts
type WeaponId = "revolver" | "kar98";
type Vec3 = [number, number, number];

interface PlayerInput { forward: boolean; backward: boolean; left: boolean; right: boolean; jump: boolean; yaw: number; clientTick: number; }
interface FireRequest { weaponId: WeaponId; origin: Vec3; direction: Vec3; clientTick: number; }
interface PositionSnapshot { playerId: string; position: Vec3; yaw: number; onGround: boolean; serverTick: number; }
interface HitResult { shooterId: string; targetId: string; damage: number; point: Vec3; serverTick: number; }
interface FireAck { weaponId: WeaponId; ammoRemaining: number; }
interface RoomState { code: string; hostId: string; players: { id: string; team: "A" | "B" }[]; phase: string; }
```

Wire event names (all lowercase-kebab, declared once in `geckosServer.ts` / `geckosClient.ts`):
`create-room`, `join-room`, `room-state`, `player-input`, `position-snapshot-batch`, `fire-request`, `fire-ack`, `hit-result`, `net-error`.

## Constraints carried over

- **C1** — `Room.ts` is the only place a hit is ever decided. The client-side weapon state machine (Phase 3) is cosmetic; the server keeps its own `weaponRules.ts` state per player and re-validates ammo/cooldown independently before raycasting.
- **C2** — every message goes through the Geckos server; there is no direct client-to-client channel anywhere in this codebase.
- **C3** — `fixedInterval.ts` drives `Room`'s tick at a fixed 60Hz, independent of any client's render or message rate.
- **C5** — this server is a long-lived Node process (`server/src/index.ts` + `fixedInterval.ts`'s `setInterval`-based loop), which is exactly what a Vercel serverless function cannot host.

## Acceptance criteria

1. `cd server && npm run build` succeeds; `npm test` passes (movement parity, hit-validation ray-sphere math, room-code format/uniqueness).
2. `cd client && npm run build` and `npm test` succeed with the new net modules.
3. Starting the server (`npm run dev` in `/server`) and the client (`npm run dev` in `/client`) together, then creating a room from two browser tabs and joining with the same code, results in both tabs receiving `room-state` with both player ids listed.
4. Grep confirms `hitValidation.ts` and `Room.ts` are the only files that construct a `HitResult`.
5. No file under `client/src/` imports anything from `server/src/` (no shared runtime dependency, per the duplication decision above).

## Open questions

- Full client-side reconciliation with input-replay (re-simulating unacknowledged inputs after a server correction) is out of scope for v1 — the simpler "blend toward authoritative snapshot" approach is used instead. This is adequate at LAN/low-latency but will feel soft under real internet jitter; flagged as a Phase-7-or-later follow-up rather than blocking Phase 4.
