# Testing Guide

## Automated tests

Each side has its own test suite (vitest) and its own build/typecheck. Run both independently:

```bash
cd server
npm test          # vitest run — 108 tests as of follow-up round 10
npm run typecheck  # tsc --noEmit
npm run build       # tsc -p tsconfig.json -> dist/

cd ../client
npm test          # vitest run — 52 tests as of follow-up round 10
npm run typecheck  # tsc -b --noEmit
npm run build       # tsc -b && vite build -> dist/
npm run lint         # oxlint
```

All four commands (`test`, `typecheck`/`build`, per side) should exit 0 with no output beyond the
normal pass summary before you consider a change done — this mirrors what the `tester` subagent
(`.tooling/agents/tester.md`) checks for every task.

### What's covered where

| Area | File(s) | What's tested |
|---|---|---|
| Player movement (shared logic, two independent copies) | `client/src/game/player/playerController.test.ts`, `server/src/sim/movement.test.ts` | Speed clamping, gravity, jump-only-when-grounded, ground clamp, arena-bounds clamp (both copies must agree at the walls), determinism |
| Weapon state machine | `client/src/game/weapons/weaponStateMachine.test.ts` | Ammo/cooldown/reload/zoom transitions |
| Server weapon rules | `server/src/combat/weaponRules.test.ts` | Fire/cooldown, reload refills only after the full duration (no up-front refill), reload no-op when full/already-reloading, reload-from-cooldown safety invariant (reloadSec ≥ cooldownSec) |
| Kar98 bolt-action pose | `client/src/game/weapons/boltAction.test.ts` | Lift/pull/push/lock timing across the 0..1 progress range, clamping outside it |
| Hit validation | `server/src/combat/hitValidation.test.ts` | Ray-sphere math, nearest-candidate selection, range cutoff, origin-plausibility (anti-spoofing) |
| Room / networking | `server/src/rooms/Room.test.ts`, `server/src/rooms/roomCode.test.ts` | Team balancing, host assignment/reassignment, host-only start (including uneven/small teams), fire-request gating (cooldown, spoofed origin, dead shooter, lobby/buy-phase, non-equipped weapon, equip settle delay), friendly-fire pass-through, server-side reload, buy-request validation (buy-phase-only, price check, no double-buy), hit zones (head/body/legs multipliers), kar98 body-shot lethality, per-round loadout reset |
| Server-side accuracy model | `server/src/combat/aimError.test.ts` | Spread scaling (movement/air/crouch), recoil climb/cap and 0.35s reset, `perturbDirection` cone math, multi-pellet scatter (via a synthetic accuracy profile — no shipped weapon uses pellets), first-shot-laser invariant (stationary grounded first shot is exactly the aimed ray) |
| Damped-spring animation integrator | `client/src/game/effects/spring.test.ts` | Convergence to target, impulse response, overshoot/damping behavior, reset |
| Room manager | `server/src/rooms/RoomManager.test.ts` | Join/create-hopping removes the player from the previous room (no zombie players keeping rooms alive), emptied rooms are deleted |
| Round/economy loop | `server/src/rooms/Room.round.test.ts`, `server/src/rounds/roundLogic.test.ts` | Buy→action→round-end→next-round transitions, elimination pays immediately then holds the 3s intermission, side swap at halfway (round-win tally swaps with the players), clinch ends the match early, match-end state has null countdown + final tally |
| Frag grenade sim | `server/src/combat/grenade.test.ts` | Throw launch direction/lob, gravity + fuse burn, floor/wall bounce staying inside the arena, radial damage falloff (full centre → edge → zero, monotonic) |
| Grenade in the room | `server/src/rooms/Room.test.ts` (throwGrenade) | Throw accepted only in the action phase (rejected in lobby/buy/dead), cooldown blocks a second throw, origin-plausibility check, detonation damages a nearby enemy but not a teammate (friendly-fire off), lethal blast credits a kill + a death |
| Killstreak perks | `server/src/combat/perks.test.ts` | Tier thresholds (0/3/5 kills) and the per-tier fire-cooldown/reload/move-speed multipliers the client mirrors |
| Client-side prediction/reconciliation | `client/src/net/reconciliation.test.ts`, `client/src/net/remoteInterpolation.test.ts` | Snap-vs-smooth correction, two-sample interpolation timing, stale-buffer cutoff (leavers don't render as frozen ghosts) |
| Object pooling | `client/src/game/pooling/ObjectPool.test.ts` | No reallocation across acquire/release cycles, pre-warming, `all()` enumeration |

## Browser E2E tests (Playwright)

Unlike the vitest suites above, these drive a real Chromium browser against the real dev servers —
two actual browser contexts creating/joining a room over a real WebSocket connection, not a
mock. This covers the gap the original manual-only checklist used to warn about.

```bash
cd client
npx playwright install chromium   # one-time browser download
npm run test:e2e
```

`playwright.config.ts` starts both `server` and `client` dev servers itself
(`webServer` array) if they aren't already running, then runs `client/e2e/*.spec.ts`. Requires:

- `client/.env` with real (or local, see [SUPABASE.md](SUPABASE.md)) Supabase credentials — the
  lobby's Create/Join buttons stay disabled until `auth.status === "signed-in"`.
- Docker/geckos.io need nothing extra; the client dev server proxies to whatever
  `VITE_SERVER_URL`/`VITE_SERVER_PORT` point at.

| Spec | What it proves |
|---|---|
| `e2e/lobby.spec.ts` — "host creates a room, guest joins" | Real two-context room create/join, server broadcasts a converged roster, color names are auto-assigned and distinct, only the host sees Start, starting the match renders the canvas + round HUD on both windows |
| `e2e/lobby.spec.ts` — "rejects joining with an unknown room code" | Server's `net-error` on an invalid/unknown code reaches the client and renders |

This directly replaces the old "no browser automation tooling was available" caveat for the lobby
flow — see PROGRESS.md. Movement/weapon/round-timer coverage in the *checked-in* suite is still
lobby-only, but full scripted two-browser combat loops (create/join/start → buy → server-validated
kills → payouts → kill feed → round advance) have been run twice as ad-hoc verification scripts
(follow-up rounds 8–9, from the session scratchpad — not checked in). With the buy phase now 8s
and action 60s, a checked-in combat spec no longer needs test-only phase-length overrides — worth
promoting. Three headless quirks to know if you script this yourself:

1. Chromium injects a stray look delta when pointer lock engages — level the camera afterwards via
   the dev-only `window.__stickfpsCamera` hook.
2. Playwright's `page.mouse.click(x, y)` implicitly *moves* the pointer first, which rotates a
   pointer-locked camera. Park the mouse at screen center once after locking, then use
   `mouse.down()`/`mouse.up()` without coordinates.
3. Headless software-GL runs client sim time well below wall time (the fixed-timestep loop caps at
   5 steps/frame), so timed waits desync from game time — space fire clicks out well past
   cooldowns, and poll for the `round-end-banner` testid rather than sleeping a round length.

## Manual QA checklist

Automated tests (vitest + Playwright) cover pure logic and the lobby flow; they do not yet drive a
real two-window movement/weapon/round session end-to-end. Before considering a change to rendering
or in-match input "done," walk this checklist against two real browser windows (see
[RUNNING.md](RUNNING.md) for setup):

**Lobby / auth** — create/join/roster/host-start is covered by `e2e/lobby.spec.ts` now; the only
thing left for manual QA here is the no-Supabase-configured degrade path, which the E2E suite
intentionally doesn't exercise (it requires Supabase configured to get past `not-configured`):
- [ ] App loads without a Supabase project configured → auth shows `not-configured`, no crash.
- [ ] Any team size works, not just full 5v5 — start a match at 1v1 or 2v3 and confirm it begins
      normally (host-only start has no minimum-player check by design).

**Movement**
- [ ] Pointer locks on canvas click; WASD + mouse-look feels responsive.
- [ ] Diagonal movement isn't faster than cardinal movement (speed clamp).
- [ ] Space jumps once per ground contact; can't double-jump by spamming Space mid-air.
- [ ] C or Left-Ctrl crouches (camera drops, walk slows); crouching while running at speed
      (≥5 m/s) slides with a visible speed boost, and jumping out of the slide keeps the boost
      (slide-hop).
- [ ] A second window's avatar moves smoothly (interpolated), not in visible discrete steps.

**Weapons**
- [ ] Both guns are visible on-screen (bottom-right) and switch model when you switch weapons.
- [ ] Left-click fires the Revolver (6 rounds, ~0.5s between shots); ammo counter decrements;
      the gun kicks back briefly on each shot.
- [ ] Firing the Kar98 visibly cycles the bolt (lifts, pulls back, pushes forward, locks down)
      over the ~1.5s before it can fire again — it can't fire again until the bolt is closed.
- [ ] Right-click toggles Kar98 zoom (FOV narrows, gun model hides, a gapped scope reticle with a
      dark vignette appears); Revolver ignores right-click.
- [ ] R reloads; ammo refills after a short delay, can't fire mid-reload (Kar98 replays the bolt
      cycle over the longer reload duration; Revolver's cylinder spins). The viewmodel visibly
      dips and cants during the reload (deep for the Revolver, subtle for the Kar98).
- [ ] B opens the armory during the buy phase only (pressing B mid-action does nothing); the
      Kar98 costs $2400 and the card shows a NO FUNDS state when you can't afford it.
- [ ] A bought Kar98 is gone next round — the loadout resets to the free Revolver every round.
- [ ] Remote stickmen visibly hold the correct gun for their equipped weapon (one-handed revolver
      aim vs two-handed kar98) and show an arm-recoil kick + muzzle flash when they shoot.
- [ ] A tracer is visible for shots from both windows, not just the local player's.
- [ ] A hit shows an impact flash at the hit point and the target's HUD money/HP-driven state is
      consistent with the round continuing (no client-visible "I decided this was a hit" — the
      server's `hit-result`/`fire-ack` is what drives it; see
      [docs/security-audit-phase7.md](security-audit-phase7.md)).
- [ ] Pressing 2 switches to the Kar98 (HUD highlights it); pressing 1 switches back to the
      Revolver. Firing one, switching away, then switching back shows the same ammo it had before
      switching (each weapon's ammo is independent — see SRS FR-3.5).
- [ ] Switching weapons plays a raise animation and you can't fire during it (~0.35s, enforced
      server-side too — see SRS FR-3.7).
- [ ] Reload actually round-trips: empty a magazine, reload, and confirm you can still land hits
      afterwards (before follow-up round 5, the server never refilled and every later shot was
      silently rejected).
- [ ] Firing with an empty magazine dry-clicks and starts the reload automatically; a pulsing
      "[R] RELOAD" hint shows while empty.
- [ ] Gunshots/reload/hitmarker/damage sounds play (synthesized — no audio files); remote players'
      shots are quieter with distance.
- [ ] While the pause menu is open, clicking its buttons never fires the weapon, and held movement
      keys stop moving your player (both gated on pointer lock).
- [ ] During the buy phase the trigger does nothing (server rejects too — no buy-phase kills).

**Combat feedback**
- [ ] Getting hit: HP bar drops (visible to the victim immediately) and a dark vignette flashes.
- [ ] Landing a hit: a hitmarker flashes at the crosshair with a blip.
- [ ] A kill shows in the top-right kill feed as "ShooterName ✕ TargetName" on every client.
- [ ] Dying shows ELIMINATED + spectate text for the rest of the round; the dead player cannot
      move or fire (server-enforced), and their stickman falls over on other screens.
- [ ] Round end: a 3s "TEAM X TAKES THE ROUND" intermission with countdown, then the next buy
      phase; the top team-score line increments.
- [ ] Match end (clinch or round cap): VICTORY/DEFEAT/DRAW screen with the final score and a
      working Back to Lobby button; the pointer unlocks automatically.
- [ ] Walk up to the perimeter wall: you stop at it (and the second window shows you stopping at
      the same spot — client and server clamp identically).
- [ ] Remote players' limbs swing while they move and go still when they stop; teammates have a
      floating diamond overhead, enemies don't.
- [ ] Close one window mid-match: that player's stickman disappears on the other screen within
      ~1s instead of freezing in place.

**Controls & settings**
- [ ] Esc (or the on-screen Pause button, top-right) opens the pause menu; Resume re-locks the
      pointer. The round's countdown keeps advancing while paused — pausing is local-only.
- [ ] Dragging the sensitivity slider changes mouse-look speed immediately; reloading the page
      keeps the chosen value (persisted to `localStorage`).
- [ ] Leave Match reloads back to the lobby.

**Environment**
- [ ] The arena shows industrial cover (crates/barrels/containers) and at least one continuously
      moving object (rotating fan, swinging crane, patrolling drone light, or a pulsing warning
      beacon) without any player input.
- [ ] The scene renders in full colour (grayscale filter retired 2026-07-24) — teammates read
      blue, enemies red-orange, with visibly distinct near/far shading (fog haze), not a flat image.
- [ ] Switching maps in the lobby ("⟳ MAP") changes the arena palette/lighting (FOUNDRY-7 warm ↔
      COLDLINE-9 cold) for every client in the room.
- [ ] Pressing [G] in the action phase throws a grenade that arcs, lands, and detonates with a
      flash + boom; the HUD grenade chip goes on cooldown and refills; a nearby enemy takes damage.

**Rounds**
- [ ] Starting a match begins round 1 in the buy phase; HUD shows round number/phase/countdown.
- [ ] After ~8s (`BUY_PHASE_MS` in `server/src/rounds/roundLogic.ts`) the phase switches to
      action.
- [ ] Reducing one side to 0 HP ends the round immediately, before the 60s timer, and pays the
      winning team's money (visible in the bottom-right HUD figure).
- [ ] Teams swap sides entering round 7 (`HALFWAY_ROUND + 1`).

**Performance (informal — no profiling tooling was available in the environment this was built in)**
- [ ] With as many browser tabs/players as you can practically run, frame rate stays playable; if
      not, check `docs/specs/task-7.1.md`'s Open Questions before assuming pooling/LOD are enough.

## Why manual QA matters here

Several areas in this codebase were only verified by unit tests and code review, not a live
multi-browser session, because this project was built in an environment without browser automation
tooling — this is called out explicitly in `PROGRESS.md`'s Follow-ups every time it applies. Treat
the checklist above as the first thing to run through, by hand, before trusting a change that
touches networking, rendering, or round flow.
