# TASKS

## STATE SUMMARY
All 8 phases are complete, plus ten post-launch follow-up rounds (infra, art/UX, bugfixes,
bolt-action polish, two full audits, gameplay/feel expansion, spring-animation pass, a
fast-pace redesign that cut the arsenal to Revolver + Kar98 and retuned pacing to 8s buy / 60s
action, and a full-colour + bots + killstreak-perks + second-map + frag-grenade upgrade).
See PROGRESS.md for the full log and current numbers.

## Phase 0 — Spec
- [x] 0.1 Write PROJECT.md (or run `speckit generate prd/tech-spec/tasks`) capturing: 5v5 tactical stickman FPS, Revolver + Kar98, Geckos.io UDP-over-WebRTC networking, Supabase anon auth + 6-char room codes, Vercel frontend / Fly.io backend, zero PII. Human review before Phase 1 starts.

## Phase 1 — Scaffold
- [x] 1.1 Init Vite + React + TS. Install three, @react-three/fiber, @react-three/drei, geckos.io-client, @supabase/supabase-js, uuid. Create /src/game, /src/net, /src/ui folder structure.

## Phase 2 — Core 3D & Input
- [x] 2.1 Three.js scene with low-poly stickman (capsule + limbs), PointerLockControls, WASD movement with velocity clamping, jump, ground plane, fixed-timestep (60Hz) game loop decoupled from render rate.

## Phase 3 — Weapons & Ballistics
- [x] 3.1 Weapon state machine (equipped/ammo/cooldown). Revolver: 6 rounds, 0.5s cooldown, hitscan. Kar98: 5 rounds, 1.5s cooldown, right-click zoom 75->30 FOV. Client sends a fire request; server raycasts and is the sole authority on hit results.

## Phase 4 — Networking (server-authoritative)
- [x] 4.1 Geckos.io server on Fly.io (not Vercel — serverless functions time out at 10s and can't hold a 60Hz loop). Room-code based client connection. Sync position/rotation/fire events. Client-side prediction + server reconciliation for movement; interpolate remote players. No WebRTC mesh between clients (10 players = 45 P2P connections — avoid entirely).

## Phase 5 — Auth & Lobby
- [x] 5.1 Supabase anonymous sign-in. Create Room (generates 6-char code, spins up/joins a match on the Fly.io server) / Join Room (code entry). 5v5 roster display. Host-only start button.

## Phase 6 — Game Loop Logic
- [x] 6.1 Round logic: up to 12/15 rounds, 30s buy phase -> 90s action phase, side swap at halfway, position reset each round, economy tracking ($800 start, +$3000 on round win per initial numbers — confirm against your ruleset before locking in). _(Task text is historical — pacing was retuned to 8s buy / 60s action in post-launch round 9.)_

## Phase 7 — Perf & Hardening
- [x] 7.1 Object pooling for bullets/particles. Confirm no per-frame allocations in hot paths (profile with the browser's performance tab). Add LOD on stickmen if frame drops appear with 10 players.
- [x] 7.2 Confirm all hit/movement-deciding logic is server-side only; verify a client cannot spoof damage or aim through DevTools/network tampering.

## Phase 8 — Deploy
- [x] 8.1 Frontend to Vercel (`vercel --prod`, set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Backend to Fly.io (`flyctl launch`, PORT=9090, UDP enabled). CORS allow the Vercel domain on the backend.

## Post-launch follow-ups (user-requested rounds, detailed in PROGRESS.md)
- [x] R1 Auto color names, flexible team sizes, Docker/Supabase-local/Playwright infra.
- [x] R2 Art/UX pass — weapon switching, pause menu, industrial arena, noir grayscale theme.
- [x] R3 Bugfix — gun viewmodel never rendered; pause overlay swallowed clicks; crosshair added.
- [x] R4 Kar98 bolt-action animation + ADS scope reticle.
- [x] R5 Full audit — reload wire message, authority loopholes, round-win tracking, combat-feedback layer.
- [x] R6 Gameplay/feel expansion — Krunker movement + crouch-slide, buy-phase armory, hit zones, server-side accuracy model, noir lobby.
- [x] R7 AAA-feel animation pass — damped-spring integrator (`effects/spring.ts`).
- [x] R8 Second global audit — weapon-switch fake recoil, yaw seam spin, leaver broadcast, slot-recycle ghosts.
- [x] R9 Fast-pace redesign — two-weapon arsenal, 8s/60s pacing, third-person gun props + fire animation, reload/switch viewmodel animation, environment pass 2 + lighting rebalance, live headless playtest.
- [x] R10 Professional/colour/bots/juice/story + tune-and-extend — full colour (grayscale retired), server AI bots (host fill-with-bots), HUD kill-juice (kill banner, damage numbers, killstreak call-outs, low-HP pulse), Tab K/D scoreboard, team-coloured players, weapon look-sway, story/world lore; then two-sided killstreak perks (fire-rate/reload/move), a second cosmetic map + host cycle, a server-authoritative frag grenade ([G], arc + radial damage), and simplified bot movement. 108 server / 52 client tests.

---
Notes:
- Tasks are intentionally coarse. The `architect` subagent breaks each into a tighter spec (files/interfaces/acceptance criteria) before the `coder` touches anything.
- Add tasks freely — `/game-loop` just walks whatever is unchecked in this file, top to bottom, unless you pass it a specific id or phase name.
