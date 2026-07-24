# Security & Authority Audit — Phase 7

**Scope:** TASKS.md 7.2 — "Confirm all hit/movement-deciding logic is server-side only; verify a client cannot spoof damage or aim through DevTools/network tampering." Performed by static review + grep evidence (no live penetration test — see Limitations).

## Method

For each claim below: the grep command run, its actual output, and what that output proves. This is reproducible — rerun the same commands against a later commit to re-verify the invariant still holds.

## 1. Hit results are constructed in exactly one place

```
$ grep -rn "HitResult = {" server/src client/src
server/src/rooms/Room.ts:178:      const result: HitResult = {
```

Only `Room.resolveFireRequest` ever constructs a `HitResult`. The client only ever imports the `HitResult` *type* to read fields off a value the server sent it — grep confirms no client file builds one.

## 2. Movement resolution: client prediction and server authority never cross

```
$ grep -rn "stepMovement(" server/src client/src
server/src/rooms/Room.ts:208 (production)   server/src/sim/movement.test.ts (tests)

$ grep -rn "stepPlayer(" client/src
client/src/game/player/PlayerRig.tsx:41 (production)   client/src/game/player/playerController.test.ts (tests)
```

`stepMovement` (server's authoritative copy) is only ever invoked from `Room.tick()`. `stepPlayer` (client's copy) is only invoked from `PlayerRig` for local prediction. Neither file imports the other's module — confirmed separately:

```
$ grep -rln "from \"\.\./\.\./\.\./server\|require(\"\.\./server" client/src
(no output — no cross-import exists)
```

The client also never sends a position to the server — `PlayerInput` (client/src/net/messages.ts) carries only `forward/backward/left/right/jump/yaw/clientTick`, no position field. The server cannot be fed a position; it can only be fed intent, and it computes the resulting position itself.

## 3. Ammo/cooldown authority is server-owned, not client-trusted

```
$ grep -rn "canFire(\|applyFire(" server/src | grep -v test
server/src/combat/weaponRules.ts:32   (definition)
server/src/combat/weaponRules.ts:37   (definition)
server/src/rooms/Room.ts:156          if (!canFire(weaponState)) return { type: "rejected" };
server/src/rooms/Room.ts:158          shooter.weapons[req.weaponId] = applyFire(weaponState);
```

`Room.resolveFireRequest` checks and mutates the server's own `ServerWeaponState` per player (`server/src/combat/weaponRules.ts`) — it never reads the client's local weapon UI state (Phase 3's `useWeapon`/`weaponStateMachine.ts` on the client is cosmetic only and is a structurally separate module the server never imports).

## 4. Finding (fixed during this audit): unvalidated shot origin

**Before this task**, `Room.resolveFireRequest` passed the client-supplied `FireRequest.origin` directly into `raycastPlayers` with no check against the shooter's actual server-tracked position. A modified client could report any origin — e.g. muzzle-to-forehead against a player across the map — and the server would faithfully raycast from that fabricated point. This is precisely the "spoof aim through network tampering" scenario this audit exists to catch.

**Fix**: `server/src/combat/hitValidation.ts` adds `isOriginPlausible(reportedOrigin, actualPosition)`, rejecting the fire request (before ammo/cooldown is even consumed) if the reported origin is more than `MAX_ORIGIN_DRIFT` (2m) from `shooter.movement.position` — the server's own authoritative value, never the client's. Covered by:

```
$ npm test --prefix server -- hitValidation
✓ isOriginPlausible > accepts an origin close to the shooter's actual position
✓ isOriginPlausible > rejects an origin far from the shooter's actual position (spoofed muzzle)

$ npm test --prefix server -- Room.test
✓ resolveFireRequest > rejects a fire request whose origin is implausibly far from the shooter's actual position
✓ resolveFireRequest > accepts a fire request whose origin matches the shooter's actual position
```

## 5. Host-only match start is enforced server-side

```
$ grep -n "startMatch" server/src/rooms/Room.ts
138:  startMatch(requesterId: string): boolean {
```

`Room.startMatch` compares `requesterId` (the sender's Geckos channel id, not anything the client can set) against `this.hostId` before doing anything. The client hiding the Start button (Lobby.tsx) is UX only; a forged `start-match` emit from a non-host is rejected server-side regardless. Covered by `Room.test.ts`'s "lets only the host start the match" case.

## 6. Round/economy state is server-computed only

Elimination checks, phase timers, side-swap, and money payouts (`server/src/rooms/Room.ts`: `tickRound`, `checkElimination`, `endRound`) run inside the server's fixed-tick loop. The client only ever receives the resulting `RoomState` broadcast — there is no client code path that computes a round outcome or money value.

## 7. Untrusted input is validated at the wire boundary

`server/src/net/validation.ts` (`isValidPlayerInput`, `isValidFireRequest`, `isValidRoomCodePayload`) type/shape-checks every incoming message before any handler in `geckosServer.ts` touches it, since Geckos' `Data` type (`string | number | Object`) gives no compile-time guarantee about what a client actually sent.

## 8. No per-frame allocation in the pooled VFX hot path (C4)

```
$ grep -n "useFrame\|new " client/src/game/effects/BulletTracers.tsx client/src/game/effects/ImpactParticles.tsx
```

Every `new` in these files is either inside a one-time `useMemo` initializer or inside the pool's `factory` function (only called when the pool needs to grow past its pre-warmed size — see Limitations). Nothing under `useFrame(() => { ... })`'s body allocates; it only mutates existing buffer attributes and toggles `.visible`.

## Limitations of this audit

- No live penetration test (no forged-packet fuzzing tool run against a live server) — this is a static/grep-based review plus targeted unit tests, not a black-box pentest.
- The tracer/particle pools (`POOL_SIZE = 16`) are sized with headroom above the expected worst case (~10 players × 0.5s cooldown, 80–150ms effect lifetime ⇒ ~2 concurrent), but if that pool ever needs to grow at runtime, the newly-created item is not retroactively mounted into the R3F scene graph (it was only rendered once, from the pool's initial contents) and would silently never render. Documented, not fixed, since it requires a bigger architectural change (dynamic remounting) for a case that shouldn't occur in practice at 5v5 scale.
- Basic per-connection rate limiting on `fire-request`/`player-input` (to blunt a flood of rejected messages as a mild DoS vector) is not implemented — cooldown/ammo are already server-enforced so flooding cannot grant extra shots, only waste server CPU cycles on rejections. Flagged as a follow-up, not required by TASKS.md 7.2's literal scope (spoofing, not availability).
