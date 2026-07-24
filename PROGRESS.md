# PROGRESS

## STATE SUMMARY
All 8 build phases + documentation are complete, followed by eleven post-launch follow-up rounds
(each detailed in the Log): (1) auto color names, flexible team sizes, Docker/Supabase/Playwright
infra; (2) art/UX pass (weapon switching, pause menu, industrial arena, noir grayscale theme);
(3) bugfix round (the gun viewmodel had never been rendered; the pause overlay swallowed clicks);
(4) Kar98 bolt-action animation + ADS scope reticle; (5) full-codebase audit that fixed a
game-breaking wire gap (no reload message existed) plus several authority loopholes, and shipped
the combat-feedback layer (HP bar, hitmarker, kill feed, death overlay, round/match-end screens,
synthesized SFX, remote walk/death animation, arena bounds); (6) gameplay/feel expansion —
Krunker-style movement (Quake-projection accel, air-strafe, crouch-slide/slide-hop), a buy-phase
armory with CS-style per-round loadout reset, head/body/legs hit zones, a fully server-side
accuracy model (movement/air spread + recoil climb), dynamic crosshair, trauma screen shake,
expanded synthesized audio (footsteps, phase stingers, ambience bed, low-HP heartbeat), and the
noir lobby redesign; (7) AAA-feel animation pass via a reusable damped-spring integrator
(viewmodel recoil/draw overshoot, stickman landing squash, death topple, idle life); (8) a second
global audit (weapon-switch fake-recoil, remote yaw 360° seam spin, leaver roster broadcast,
remote-slot recycling ghosts); (9) fast-pace redesign per user request — arsenal cut to exactly
two weapons (Revolver + Kar98), buy phase 8s / action 60s, third-person gun props +
firing/recoil/muzzle-flash animation on stickmen, viewmodel reload/switch animation, environment
pass 2 (container stacks, rubble, lamp posts, steam vents, cable spans, lane markings, skyline)
with a lighting-value rebalance — all verified live in a headless two-browser playtest; and (10)
a "make it professional, not monotonous" upgrade — the grayscale identity **retired for full
colour**, server-side AI bots (host "fill with bots" for a solo full match), a HUD kill-juice
layer (kill banner, floating damage numbers, killstreak call-outs, low-HP edge pulse), a Tab K/D
scoreboard, team-coloured players, weapon look-sway, a story/world layer (two crews, named maps),
then a tune-and-extend batch: two-sided **killstreak perks** (fire-rate/reload/move-speed buffs
mirrored in client prediction), a **second map** with a host map-cycle, a server-authoritative
**frag grenade** ability, and simplified bot movement; and (11) a **transport swap** from geckos.io
UDP-over-WebRTC to plain **WebSocket-over-TCP** (`ws`) so the server can be hosted on free no-card
platforms (Render/Koyeb) — no gameplay/wire-message change, only the network layer.

Current numbers (every one enforced server-side; client copies are cosmetic): Revolver — free
starter, 26 dmg, 6 rds, 0.5s cooldown, 1.5s reload. Kar98 — $2400, 100 dmg (one-shot body),
5 rds, 1.5s cooldown, 2.2s reload, ADS 75°→30° FOV. Hit-zone multipliers ×2.5 head / ×1.0 body /
×0.85 legs on 100 HP. Frag grenade ([G], server-authoritative arc + radial damage): 1.6s fuse,
6.5m blast, 92 dmg centre → 16 at the edge (linear falloff), 16s cooldown reset each round,
friendly-fire off. Killstreak perks: tier I at 3 kills / tier II at 5 (reset on death or round) —
fire cooldown ×0.88/×0.78, reload ×0.85/×0.72, move ×1.05/×1.10, mirrored client+server so
prediction never fights reconciliation. Rounds: 12 max, buy 8s → action 60s → round-end 3s, sides
swap entering round 7, first to 7 wins clinches; $800 starting money, +$3000 per round win,
loadout resets to the pistol each round. Maps are cosmetic themes (FOUNDRY-7 warm / COLDLINE-9
cold) chosen server-side and broadcast so every client renders the same arena. Tests: 108 server /
52 client unit + 2 Playwright specs; typecheck and lint clean on both packages.

## Log
- done — task 0.1: PROJECT.md + docs/SRS.md written (architecture/sequence/state diagrams, traceability table). Repo bootstrapped: git init, /client, /server, /docs/specs, /docs/diagrams, .tooling/agents (architect/coder/tester), .tooling/commands/game-loop.

- done — task 2.1: fixed-60Hz PlayerRig + pure `stepPlayer` controller (unit-tested), Stickman avatar, ground plane, PointerLockControls wiring in App.tsx. Removed unused Vite template assets/CSS. `npm test` (5/5) and `npm run build` pass in /client.

- done — task 3.1: weapon state machine (revolver/kar98), useWeapon hook + WeaponRig (camera-driven aim, zoom FOV), HUD. Client only ever emits FireRequest — no hit computation client-side. 12/12 tests, build passes.

- done — task 4.1: Geckos.io server (room manager, 6-char codes, fixed-60Hz movement resolution, ray-sphere hit validation with server-owned ammo/cooldown), client geckos wiring (prediction+reconciliation, remote interpolation, dev-only NetDebugPanel for create/join). 13/13 server tests, 21/21 client tests, both builds green. Manually smoke-tested: server /healthz and client dev server both start and respond cleanly together.

- done — task 5.1: Supabase anonymous auth (useAuth, graceful "not-configured" degradation), Lobby.tsx (create/join, Team A/B roster, host-only Start), server Room.startMatch (host-only, waiting->active). NetDebugPanel deleted. 19/19 server tests, 21/21 client tests, both builds green.

- done — task 6.1: server-authoritative round loop (roundLogic.ts pure transitions + Room.tickRound/endRound), economy ($800 start, +$3000/round win, no loss bonus per unconfirmed ruleset), side swap at round 7, position/HP reset each round, RoomState broadcast on every transition (fixed a gap where transitions happened silently server-side with no client notification). Client HUD shows round/phase/countdown/money. 30/30 server tests (includes a caught-and-fixed bug: a team with zero players was being treated as "eliminated"), 21/21 client tests, both builds green.

- done — task 7.1/7.2: fixed a real vulnerability (server accepted client-reported shot origin unconditionally — now validated via `isOriginPlausible` against server-tracked position, before ammo/cooldown is consumed). Added `ObjectPool<T>`, pooled `BulletTracers`/`ImpactParticles` (server broadcasts `shot-fired` to the whole room so every client sees every shot, not just hits), LOD on `Stickman` via drei's `Detailed`. Wrote docs/security-audit-phase7.md with reproducible grep evidence for every authority claim. 35/35 server tests, 27/27 client tests, both builds green.

- done — task 8.1: fixed Geckos' unpinned UDP port range (added GECKOS_UDP_PORT, defaults 10000, wired through fly.toml's udp service and portRange option). Wrote server/Dockerfile, server/.dockerignore, server/fly.toml, docs/DEPLOYMENT.md. No live deploy or Docker build executed — no cloud credentials available and Docker Desktop wasn't running locally; Dockerfile reviewed manually instead.

- done — documentation pass: root README.md (quick start, doc index, repo layout), docs/RUNNING.md, docs/TESTING.md (coverage map + manual QA checklist), docs/CONTRIBUTING.md (architect/coder/tester workflow diagram + codebase conventions), client/README.md + server/README.md replaced with project-specific content, removed empty docs/diagrams/ (diagrams live inline as Mermaid in SRS.md).

- done — follow-up round (post-launch, user-requested): auto color-name assignment (`server/src/rooms/colorNames.ts`, room-scoped uniqueness, `Room.test.ts` coverage), confirmed+tested that host-start already supports uneven/small teams (1v1 etc — no code change needed there, just a test and doc update). Evaluated Render as a Fly.io/Vercel replacement; rejected after confirming (web search) Render has no public inbound UDP — kept Fly.io (backend) + Vercel (frontend, user's existing account). Wrote docs/DOCKER.md and actually ran the real `docker build`/`docker run`/`/healthz` cycle (previously only reviewed, never executed — Docker Desktop is running now). Set up local Supabase via CLI (`supabase init` + `supabase start`, `enable_anonymous_sign_ins = true` in `supabase/config.toml`, docs/SUPABASE.md) so auth can be dev-tested without a cloud project. Added Playwright (`client/e2e/lobby.spec.ts`, `playwright.config.ts`) driving two real browser contexts through create/join/start over a live geckos.io connection — client vitest config excludes `e2e/**` to avoid runner collision. Both specs actually run and pass (2/2) against the real dev servers + the local Supabase stack; caught and fixed one test bug along the way (comparing per-viewer "(you)" labels instead of stripping them before comparing rosters — the app itself was fine). 37 server tests / 27 client unit tests / 2 Playwright specs, all green.

- done — follow-up round 2 (art/UX pass, user-supplied reference art): refactored `useWeapon`/
  `WeaponRig` to carry both weapons simultaneously with independent `WeaponState` each, switchable
  via 1/2 hotkeys (`WEAPON_HOTKEYS` in `weaponDefs.ts`) — zero server changes needed since
  `Room.ts` already tracked a `weapons: Record<WeaponId, ServerWeaponState>` per player. Added
  `client/src/settings/useSensitivity.ts` (localStorage-persisted, clamped 0.3–3x) wired to
  `PointerLockControls`' `pointerSpeed`. Added `client/src/ui/PauseMenu.tsx` (Resume/sensitivity
  slider/Leave Match) shown whenever pointer lock isn't held, plus an explicit on-screen Pause
  button in the HUD — both call the `PointerLockControlsImpl` ref's `lock()`/`unlock()`. Built
  `client/src/game/environment/Environment.tsx`, a from-scratch industrial arena (no external
  asset/texture pipeline exists in this repo, so the user's two reference images were used as art
  direction, not imported assets) with cover clusters, catwalk-tower silhouettes, pipe runs, and
  four continuously-animating props. Re-tuned `Scene.tsx` lighting (hemisphere fill + directional
  key/rim + fog) and added a CSS `grayscale()` filter on the canvas wrapper in `App.tsx` for the
  monochrome look; iterated once after a real screenshot showed the first lighting pass was too
  dark to read cover by. `HUD.tsx` now lists both weapons with the active one highlighted. Verified
  for real: `npm run typecheck`/`lint`/`build`/`test` clean on both packages (37 server / 27 client
  unit tests unaffected), both Playwright specs still pass, and a scripted headless-Chromium
  screenshot of a live match confirmed the environment/lighting/pause-menu actually render as
  intended (not just "it compiles").

- done — follow-up round 3 (bugfix, user reported "couldn't see or shoot the guns"): two real
  bugs, both introduced in round 2. (1) `WeaponRig` had never rendered a gun mesh at all — it only
  ever tracked ammo/cooldown/aim logic (`return null`), so there was nothing to see regardless of
  weapon state; added `client/src/game/weapons/WeaponViewmodel.tsx`, a low-poly first-person
  Revolver/Kar98 model parented directly to the camera object with a recoil kick on fire and a
  tilt-down while reloading. Hit a genuine three.js gotcha along the way: parenting a mesh to
  `camera` does nothing visually unless the camera itself is a descendant of `scene` (the renderer
  only traverses `scene`'s graph) — fixed by `scene.add(camera)` once in the same effect. Caught
  via screenshot (first pass compiled fine but rendered nothing) rather than assumed to work. (2)
  `PauseMenu`'s full-screen backdrop had `pointerEvents` captured but no click handler, so "click
  the game to continue" (the literal help text shown) did nothing — clicks used to fall through to
  the canvas and trigger `PointerLockControls`' click-to-lock before this round's pause menu existed
  as an overlay. Fixed by resuming on a backdrop click while the inner panel stops propagation (so
  the sensitivity slider/buttons still work normally). Also added a small center-screen crosshair
  (hidden while Kar98 is zoomed) since there was previously no visual aim feedback at all. Verified
  by scripted headless-Chromium screenshots showing both gun models rendering distinctly, ammo
  decrementing on fire, and backdrop-click correctly resuming — plus a full re-run of typecheck/
  lint/build/test (client 27, server 37 unaffected) and both Playwright specs.

- done — follow-up round 4 (polish, user-requested): proper Kar98 bolt-action animation — new pure
  `client/src/game/weapons/boltAction.ts` (`computeBoltPose`, unit-tested in `boltAction.test.ts`)
  drives a 4-beat cycle (lift/pull/push/lock) over whichever phase is active: the post-shot
  cooldown (a Kar98 must be manually cycled before it can fire again — that's what the cooldown
  narratively represents) or the longer explicit reload. `WeaponViewmodel.tsx`'s `Kar98Model` now
  has a dedicated bolt group (separate from the static receiver/barrel meshes) whose rotation/
  position are driven entirely imperatively via `useFrame`, deliberately avoiding any JSX-declared
  transform on that same group — mixing the two on a mesh that re-renders at 60Hz (the weapon
  state object is replaced every tick) risks the declarative prop fighting the imperative one.
  Revolver got a smaller flourish (cylinder spins while reloading). Recoil is now per-weapon
  (`RECOIL` map in `WeaponViewmodel.tsx`) — Kar98 kicks harder and recovers slower than the
  revolver. Added a proper ADS scope reticle (`HUD.tsx`'s `ScopeReticle`: gapped crosshairs + a
  radial-gradient vignette) shown while the Kar98 is zoomed — previously zooming showed nothing at
  all (the hip-fire dot was explicitly hidden and never replaced with anything). Verified via
  scripted headless-Chromium screenshots at several points through a fire → cooldown cycle,
  confirming the bolt visibly lifts, pulls back, returns, and locks on the expected timing, plus an
  ADS screenshot showing the reticle/vignette rendering correctly. Also chased down a Chromium
  headless-automation red herring while debugging an earlier "resume doesn't work" theory —
  `document.pointerLockElement` grants are flaky under CDP-synthesized clicks specifically, not a
  real bug; confirmed the actual resume path (button click) still works reliably and left the code
  unchanged there. Full re-verify clean: typecheck/lint/build clean, 32/32 client unit tests
  (up from 27 — added `boltAction.test.ts`), 37/37 server (untouched), 2/2 Playwright specs.

- done — follow-up round 5 (full audit, user asked to "read the whole project … find errors in my
  logic, fix bugs and errors and loopholes, go all out"): read every source file on both sides and
  fixed everything found, in roughly descending severity:
  1. **Game-breaking**: no reload message existed on the wire at all — the client's reload was
     purely cosmetic, so the server's ammo counters only ever counted down and every weapon was
     permanently empty server-side after its first magazine (all later shots silently rejected: no
     tracer, no hits, while the HUD showed full ammo). Added `reload-request` (+ validation +
     `applyReload` in `weaponRules.ts` + `Room.reloadWeapon`), sent from `useWeapon` whenever a
     local reload actually starts.
  2. **Authority loopholes** (all server-enforced now, with tests): dead players could still fire
     while being skipped as raycast targets (invulnerable ghost killers) and still moved on their
     buffered input — now `hp <= 0` rejects fire and forces neutral input; firing was accepted in
     the lobby and during the buy phase (Kar98 = 100dmg cross-map spawn kills) — now only
     `phase === "active" && roundPhase === "action"` resolves shots; the server never tracked which
     weapon was in hand, so a modified client could alternate revolver/Kar98 fire requests and beat
     both cooldowns — added `switch-weapon` + per-player `equipped`/`switchRemaining` (0.35s equip
     settle, `EQUIP_SEC`, mirrored client-side with a draw animation); `RoomManager.joinRoom` never
     removed a channel from its previous room, so join/create-hopping left immortal zombie players
     that held rooms (and their 60Hz loops) alive forever — grief/DoS vector, now `leaveCurrentRoom`
     runs first; friendly fire was on implicitly (raycast ignored teams) — teammates are now
     excluded (pass-through); movement had no bounds at all (walk to infinity) — `ARENA_HALF_EXTENT
     = 24` clamps in both movement copies, with matching visual perimeter walls in `Environment.tsx`.
  3. **Missing game-state layer**: nothing tracked round wins, so a match winner was literally
     undeterminable — added `teamWins` (swapped with the players at side swap), a clinch rule
     (`WINS_TO_CLINCH` = majority of MAX_ROUNDS ends the match early), `lastRoundWinner`, a
     **round-end intermission phase** (`ROUND_END_MS` = 3s — before this, elimination started the
     next round on the very next tick, so the death screen/kill moment lasted ~16ms; caught live
     when the verification script's death-overlay check flaked), RoomState broadcast on every hit
     (clients had no way to learn HP between round transitions), `lethal` flag on `HitResult`, and
     `phaseEndsAt: null` at match-end (was a stale timestamp).
  4. **Client input hygiene**: the window-level mousedown handler never checked pointer lock, so
     clicking pause-menu buttons fired live shots; movement keys kept driving the player while the
     pause menu was open. Both gated on `document.pointerLockElement` now (movement sends explicit
     neutral input so you also stop server-side). Client fire is additionally gated on
     phase/aliveness (`canEngage` in App) so predicted ammo can't desync from server rejections;
     empty-mag trigger pulls dry-click and auto-reload; zoomed mouse sensitivity now scales by the
     FOV ratio (30/75) so ADS doesn't feel 2.5x faster.
  5. **Combat feedback + animation layer** (was: getting shot showed nothing, dying changed
     nothing): HP bar, damage-flash vignette, hitmarker, kill feed (real color names, driven by the
     new `lethal` flag), ELIMINATED overlay (spectate until next round), team score line, round-end
     banner, match-end VICTORY/DEFEAT/DRAW screen (auto-unlocks the pointer, back-to-lobby button),
     "SETUP — weapons unlock in Ns" buy-phase banner, pulsing "[R] RELOAD" hint. Remote stickmen
     got a procedural walk cycle (limbs on shoulder/hip pivots driven by measured speed), a death
     topple, teammate overhead markers, and no longer freeze as ghosts when someone disconnects
     (interpolator staleness cutoff + roster-diff pruning). Viewmodel got draw-raise on switch,
     walk bob, breathing sway, and a muzzle flash. All SFX are synthesized Web Audio (no assets):
     per-weapon gunshots (distance-attenuated for remote shots), dry fire, reload clicks,
     hitmarker blip, damage thud.
  6. **Lighting fix**: the arena was rendering near-black — the key light's shadow camera was the
     three.js default ±5m box (everything outside it sat in clamped shadow) and intensities were
     tuned for legacy lighting units. Widened the shadow frustum to the whole arena, retuned
     intensities for physical units + ACES, added a background color, and lightened the darkest
     prop paints; verified by screenshot iteration.
  Verified end-to-end with a scripted two-browser live match (`verify.mjs`, scratchpad): buy-phase
  banner on both clients → action → revolver hit (shooter ammo 5/6, victim HP 74 via the new
  per-hit broadcast) → R reload back to 6/6 (server-synced — the round-trip the old code couldn't
  do) → switch to Kar98 (equip settle enforced) → lethal shot → victim shows ELIMINATED + "TEAM A
  TAKES THE ROUND", shooter shows kill feed ("Teal ✕ Onyx") → next round starts with score
  A 1—0 B, victim back at HP 100, winner at $3800 (economy payout confirmed). Two headless-harness
  quirks documented as *not* product bugs: Chromium injects a stray look delta when pointer lock
  engages (scripts must re-level the camera via the dev-only `__stickfpsCamera` hook), and headless
  software rendering runs ~5fps so the 5-step/frame fixed-timestep cap makes client sim time run at
  ~40% real time (real GPUs at 60fps are unaffected). Final counts: **56 server / 34 client unit
  tests** (new: `weaponRules.test.ts`, `RoomManager.test.ts`; extended: Room fire-gating/reload/
  clinch/round-end, movement bounds both sides, interpolator staleness, roundLogic clinch +
  intermission), 2/2 Playwright specs, typecheck/lint/build clean on both packages.

- done — follow-up round 6 (gameplay/feel expansion; logged retroactively during the round-9
  documentation pass — reconstructed from the shipped code and docs/DESIGN-BRIEF.md): Krunker-style
  movement rewrite in both sim copies (Quake-projection acceleration, air-strafe control,
  crouch [C/Ctrl, eye 1.6→1.0, half walk speed] and crouch-slide [≥5 m/s entry, one-time 1.15×
  boost, low friction, steerable, auto-ends at 0.9s or <2.5 m/s; jumping out keeps the boost —
  slide-hop — hard-capped at 12 m/s]); a buy-phase armory (B key, `BuyMenu.tsx`, server-validated
  `buy-request`, `WEAPON_PRICE`) with CS-style loadout reset to the free pistol every round;
  head/body/legs hit-zone spheres with ×2.5/×1.0/×0.85 damage multipliers (`hitValidation.ts`);
  a fully server-side accuracy model (`aimError.ts`: movement/air/crouch spread scaling + per-shot
  recoil climb with 0.35s reset, applied to the ray BEFORE casting — a modified client cannot
  no-recoil spray; stationary grounded first shot is exactly the aimed ray); a dynamic
  crosshair that mirrors that model via a rAF-read module bus; trauma-based screen shake; pooled
  brass shell ejection; expanded synthesized audio (footsteps, headshot confirm, phase stingers,
  industrial ambience bed, low-HP heartbeat); the noir lobby redesign (film grain, scanlines,
  brand block, click-to-copy code); stickman LOD/flinch/lean. State at the end of this round is
  captured in docs/DESIGN-BRIEF.md (84 server / 45 client tests then).

- done — follow-up round 7 (2026-07-15, AAA-feel plan AREA 2 — animation quality): reusable
  damped-spring integrator `client/src/game/effects/spring.ts` (createSpring/stepSpring/
  impulseSpring/resetSpring, unit-tested) now drives the viewmodel's recoil kick and draw
  overshoot and the stickmen's landing squash-and-stretch, death topple, and idle life —
  per-instance springs held in refs, zero per-frame allocation. Remaining plan areas
  (lighting-as-value, game feel/impact, effects, UI polish, arena atmosphere, audio depth) are
  listed in docs/DESIGN-BRIEF.md §7.

- done — follow-up round 8 (2026-07-16, second global audit, user asked to "make a global audit of
  everything and fix found errors"): four real bugs found and fixed. (1) Switching from a
  higher-ammo to a lower-ammo weapon faked a shot client-side — the `prevAmmo` fire-edge detection
  in `WeaponViewmodel.tsx` and `ShellCasings` survived the weapon switch, causing phantom
  recoil/flash/shell/shake; both now resync `prevAmmo` when the active weapon changes. (2) Remote
  players visually spun a full 360° when their yaw crossed the ±π wrap seam — the camera
  quaternion re-derivation wraps yaw to (−π, π] and `remoteInterpolation.ts` lerped the raw
  angles; added a shortest-arc `lerpAngle` (+ unit test). (3) `Room.removePlayer` never broadcast,
  so lobby rosters kept leavers forever and a migrated host never saw the START button; it now
  broadcasts room state whenever players remain. (4) `RemotePlayers.tsx` slot recycling carried
  the previous occupant's position/HP/vertical-velocity history into the next player (phantom
  velocity/flinch/landing on join); slots now reset their motion/HP history when the occupant id
  changes. Deliberately reported-not-fixed (judgment calls, surfaced to the user): kill feed can
  drop one entry if two lethal hits land in the same React state batch; ~1.4MB bundle; both teams
  spawn stacked on a single point; a corpse→alive slot recycle briefly plays a stand-up.

- done — follow-up round 9 (2026-07-16, fast-pace redesign, user-requested: "keep only 2 guns …
  make it a fast paced game … add animations … make environment richer … run headless server and
  take screenshots, play the game"):
  1. Arsenal cut to exactly two weapons — smg/ar/shotgun removed everywhere (client
     `weaponDefs.ts`/viewmodels/sounds/buy menu; server messages/validation/rules/prices/damage/
     accuracy + all tests). Multi-pellet scatter machinery kept, covered by a synthetic accuracy
     profile in `aimError.test.ts`. Hotkeys are 1 = Revolver, 2 = Kar98 again.
  2. Pacing — `BUY_PHASE_MS` 30s → 8s, `ACTION_PHASE_MS` 90s → 60s (round-end stays 3s). Tests
     reference the constants, so no test edits were needed.
  3. Third-person combat animation (`Stickman.tsx`) — `StickmanPose` gained `equipped` +
     `fireTick`; every stickman holds a visible primitive gun prop matching its server-side
     equipped weapon (revolver one-handed aim pose, kar98 two-handed with a support arm on the
     fore-stock), with a spring arm-recoil kick + 70ms muzzle flash per confirmed shot — driven by
     a per-shooter fire counter (`useNetwork.getFireCount`), edge-triggered with a null baseline
     so a mid-match join doesn't replay a shot. Gun/flash visibility is toggled imperatively in
     useFrame (the pose object is mutated per-frame; JSX conditionals would go stale). The server
     now broadcasts room state on `switch-weapon` so remote props swap promptly.
  4. Viewmodel reload/switch animation (`WeaponViewmodel.tsx`) — reload dips/cants the gun on a
     sin(p·π) curve shaped to the exact server reload duration (deep for the revolver + cylinder
     spin, subtle for the kar98 under its bolt cycle); switching adds a wrist-roll over the
     spring draw.
  5. Environment pass 2 + lighting rebalance (`Environment.tsx`, `Scene.tsx`) — container stacks,
     rubble piles, lamp posts with real point-light pools, animated steam vents (pooled puffs),
     sagging cable spans with hanging work lamps, painted lane markings, and a skyline of
     smokestacks + a gantry frame beyond the walls. First screenshots showed the new props
     crushing to black under the grayscale filter → raised hemisphere/ambient intensities, added
     a third fill directional, lightened fog and wall/catwalk material values.
  6. Verified live — headless two-browser Playwright playtest: create/join/start, 8s SETUP banner
     + armory, server-validated kills, payouts $800 → $3800 → $6800, kill feed entries, round
     advance, team score A 2—0 B, remote stickman aim pose + gun prop on screen. Two
     headless-harness gotchas documented (not product bugs): Playwright's `mouse.click` implicitly
     moves the pointer first, which rotates a pointer-locked camera (park the mouse at center once
     after locking), and headless software-GL runs sim time well below wall time (space clicks out
     past cooldowns, poll for the round-end banner). Also fixed a stale Playwright locator
     ("Join Room" → "JOIN") in `e2e/lobby.spec.ts`. Final counts: 84 server / 52 client unit
     tests, 2 Playwright specs, tsc + oxlint clean on both packages.

- done — follow-up round 10 (2026-07-24, "make a headless server and check it against the best free
  browser FPS — ours looks monotonous; better UI/3D/physics, a bit of story and a game world",
  then "tune (bot difficulty, bloom, team colours), push further (killstreak perks, abilities, more
  maps), two-sided sync, simpler bot movement, and update all the docs"). Researched the most-liked
  features of the top free browser shooters (Krunker/Venge/Kirka) and folded the common ones in.
  Two parts:

  **Part A — professional/colour/bots/juice/story:**
  1. **Full colour** — the strict-grayscale identity is retired (user chose "Full color" — they want
     a vibrant Krunker/Venge look, not monotonous noir). `App.tsx`'s `#canvas-wrap` filter is now
     `contrast(1.08) saturate(1.14) brightness(1.04)` (was `grayscale(1) …`); `Scene.tsx` lighting/
     fog retuned for hue; **players are team-coloured** (teammate blue / enemy red-orange in
     `client/src/game/teamColors.ts`, matched by the HUD score + scoreboard); PostFX bloom now glows
     coloured emissives. This supersedes DESIGN_PROMPT.md §3 / DESIGN-BRIEF §2's grayscale rule.
  2. **Server AI bots** (`server/src/rooms/BotBrain.ts` + `Room.fillWithBots`, host-only/lobby-only,
     wire event `add-bots`, lobby "+ FILL WITH BOTS" button) — real authoritative `PlayerRecord`s
     driven each tick through the same fire/move/reload paths as a human, so a solo host can start
     and watch a full 5v5. Bots never become host and are dropped when the last human leaves.
  3. **HUD kill-juice** (`HUD.tsx`) — kill-confirm marker + "✖ ELIMINATED" banner, floating damage
     numbers (gold "HS" on headshots), killstreak call-outs (DOUBLE KILL → GODLIKE, client-cosmetic
     streak that resets on death), low-HP red edge pulse. New testids: `kill-banner`,
     `killstreak-badge`, `damage-numbers`, `low-hp-vignette`, `scoreboard`, `perk-badge`,
     `grenade-indicator`, `cycle-map`.
  4. **K/D + Tab scoreboard** — `PlayerRecord`/`RoomPlayerSummary` gained `kills`/`deaths` (additive,
     client-optional), incremented on lethal hits, reset on match start; a hold-Tab scoreboard shows
     both rosters sorted by kills with the crew names.
  5. **Game feel** — `WeaponViewmodel.tsx` look-sway (weapon lag off camera-rotation delta) + landing
     dip + a kill camera-trauma punch.
  6. **Story/world** (`client/src/game/lore.ts` + `STORY.md`) — two crews (IRONCLADS / ASH SYNDICATE),
     a setting blurb + mission briefing, surfaced in the lobby, the HUD map tag, the buy banner, and
     the scoreboard.

  **Part B — tune-and-extend (this batch):**
  7. **Killstreak perks, two-sided** (`server/src/combat/perks.ts` ↔ `client/src/game/perks.ts`,
     identical tables) — tier I at a 3-kill streak, tier II at 5: fire cooldown ×0.88/×0.78, reload
     ×0.85/×0.72, move-speed ×1.05/×1.10. The four pure sim functions the client predicts
     (`stepMovement`/`applyFire`/`applyReload` + weapon-machine mirrors) gained default-safe trailing
     multiplier params so the client mirrors the exact buff and prediction never fights
     reconciliation; `perkTier` rides in `RoomPlayerSummary`, threaded App→Scene→rigs. A HUD
     `perk-badge` shows the active tier. (This closes the "perks deferred — would need two-sided
     sync" note from Part A.)
  8. **Second map + host cycle** (`client/src/game/maps.ts`, `Room.mapId` + `cycleMap`, wire event
     `cycle-map`) — maps are purely **cosmetic** (palette/lighting/fog + a hero-prop swap over the
     same ±24m sim), so the server picks/broadcasts a `mapId` string and every client renders the
     matching theme. FOUNDRY-7 (warm munitions yard) + COLDLINE-9 (frozen depot); the host cycles it
     from the lobby ("⟳ MAP" button). `Environment.tsx`/`Scene.tsx`/HUD/Lobby all read the active
     theme instead of the old static lore constants.
  9. **Frag grenade ability** (`server/src/combat/grenade.ts`, pure + unit-tested; `Room.throwGrenade`/
     `tickGrenades`/`detonateGrenade`; wire events `throw-grenade`/`grenade-state`/`grenade-exploded`)
     — server-authoritative arc (gravity + floor/wall bounces), 1.6s fuse, radial damage 92→16 over a
     6.5m blast (friendly-fire off, like bullets), 16s per-player cooldown reset each round. Detonation
     reuses the existing `hit-result` broadcast so the kill feed/damage feedback/kills all work
     unchanged. Client: `[G]` throw (camera-derived origin/aim), pooled blinking projectile + expanding
     additive explosion flash/light/trauma (`effects/Grenades.tsx`), a synthesized throw whoosh +
     detonation boom (`sounds.ts`), and a HUD cooldown chip. The client keeps a cooldown *mirror* only
     to gate spam + drive the chip — the server independently enforces it.
  10. **Simpler bots + tuning** — `BotBrain.ts` movement reduced to face-target + approach/retreat
     around a preferred range (removed strafe/jump jitter) behind a single `DIFFICULTY` knob; bloom
     retuned (intensity 0.85, threshold 0.95); team colours centralised/tuned in `teamColors.ts`.

  Verified green throughout: **108 server / 52 client** unit tests (new: `grenade.test.ts` +6,
  `perks.test.ts`, Room grenade/streak coverage +5), typecheck + oxlint clean on both packages,
  client `vite build` clean, e2e `data-testid` contract preserved (only additions). No commit made
  (user hasn't asked).

- done — follow-up round 11 (2026-07-24, user asked to host online without a credit card): the
  original transport was geckos.io (**UDP-over-WebRTC**), which forces a UDP-capable host — and every
  managed host that does UDP (Fly.io, Oracle, the big clouds) requires a card. Swapped the whole
  transport to **plain WebSocket-over-TCP** (`ws`), which any persistent Node host can serve,
  including free no-card tiers (Render, Koyeb). No gameplay/sim/wire-message changes — only the
  transport layer:
  1. **Server** — new `server/src/net/transport.ts` (transport-agnostic `NetChannel`/`NetServer`
     interfaces mirroring the tiny slice of the geckos API the code used) + `server/src/net/wsServer.ts`
     (`ws` `WebSocketServer` on the `/ws` path, a `RoomHub` for room broadcast, per-connection
     `WsChannel`, and the same inbound-event handlers the old geckos wiring had). Deleted
     `geckosServer.ts`. `Room.ts`/`RoomManager.ts` now type against `NetServer`/`NetChannel` instead
     of geckos types (bodies unchanged). Each connection is assigned a `crypto.randomUUID()` id and
     told it via a new `connection-ready` frame. `index.ts` calls `attachWsServer` (dropped the UDP
     port). Origin is checked against `CORS_ORIGIN` in the WS handshake (`verifyClient`), 64KB max
     payload.
  2. **Client** — new `client/src/net/transport.ts` (`NetClientChannel`) + `client/src/net/netClient.ts`
     (browser `WebSocket`; `connectToServer` resolves once the `connection-ready` id arrives, so
     `channel.id` is set before use, matching the old behaviour; derives `ws(s)://<host>/ws` from
     `VITE_SERVER_URL`/`PORT`). Deleted `geckosClient.ts`; `useNetwork.ts` repointed. All the
     `send*`/`on*` helpers kept their signatures (dropped the meaningless `{reliable}` opts — TCP is
     always reliable/ordered).
  3. **Frames** — every message is a compact `{ e: event, d: data }` JSON frame both ways.
  4. **Deps** — removed `@geckos.io/server` / `@geckos.io/client`, added `ws` + `@types/ws`; both
     lockfiles reconciled. Config/docs updated for the new transport: `server/fly.toml` (dropped the
     UDP service), both `.env.example`s (dropped `GECKOS_UDP_PORT`), `docs/DEPLOYMENT.md` (rewritten
     around Render/Koyeb no-card hosting, Fly.io kept as an alt), `docs/RUNNING.md`, `docs/DOCKER.md`,
     README/PROJECT stack lines.
  Verified: server typecheck + build clean, **108 server / 52 client** tests still green, client
  `vite build` clean, and a **live WebSocket smoke test** (built server on a real port → a `ws`
  client connected, received its id, sent `create-room`, and got the `room-state` broadcast back
  with the host id matching and a randomly-picked map). One environment snag fixed along the way:
  after the dependency change vitest 4's default parallel file runner started intermittently failing
  to load its own worker on this Windows/CJS setup ("Vitest failed to find the runner") — added
  `server/vitest.config.ts` with `fileParallelism: false` (the server suite is <1s, so serial is
  free) and it's reliably green again. No commit made (user hasn't asked).

## Follow-ups
_(non-blocking issues the coder noticed outside a task's scope go here)_
- Bots don't throw grenades or use killstreak perks meaningfully — their movement was deliberately
  simplified this round (user asked for "simple" bot movement), so the grenade/perk systems are
  human-facing for now. Adding bot grenade usage is a self-contained follow-up (route through the
  same `Room.throwGrenade`).
- Maps are cosmetic only (theme/lighting/hero-prop over one shared ±24m sim) — they change the look,
  not the layout or collision. A truly different arena needs server-side geometry/spawns, same
  caveat as the "props aren't real cover" note below.
- ~~Docker image build was not actually executed~~ RESOLVED: built and ran the real image (`docker build`/`docker run` + `/healthz` check) once Docker Desktop was available — see docs/DOCKER.md. Still worth re-running `docker build` after any server dependency change, same as any Dockerfile.
- ~~Auth flow has not been verified against a real Supabase project~~ PARTIALLY RESOLVED: verified against a local Supabase stack (CLI + Docker, docs/SUPABASE.md) — anonymous sign-in works end-to-end there. A hosted (cloud) Supabase project has still not been tested; enable Anonymous provider there too before relying on it in production (it defaults off on new cloud projects, unlike this repo's local config).
- Round win condition is elimination-only (no bomb/objective system); an action-phase timeout with survivors on both teams is a no-payout draw. Flagged in docs/specs/task-6.1.md as likely needing a real ruleset before shipping (TASKS.md 6.1 already asked to confirm the economy numbers too).
- Environment props (crates, containers, catwalk towers, etc. — `client/src/game/environment/
  Environment.tsx`) are visual only: no collision (players can walk through them) and they don't
  block bullet raycasts (both movement and hit-scan are server-authoritative and only model
  players, see `server/src/rooms/Room.ts` / `server/src/sim/movement.ts`). Making them real cover
  needs matching static-geometry collision added server-side so client prediction and server
  reconciliation don't diverge — a deliberate scope cut this round (see SRS FR-9.4), not an
  oversight.
- ~~No round-end/side-swap/match-end UI banner yet~~ RESOLVED in follow-up round 5: round-end
  intermission phase + banner, team-score line, kill feed, and a match-end VICTORY/DEFEAT/DRAW
  screen with a clinch rule all exist now.
- No live penetration test / 10-player frame-rate profiling was performed (no browser automation or multi-client load tool in this environment) — see docs/security-audit-phase7.md Limitations. Recommend both before shipping.
- Tracer/particle pools (size 16) aren't retroactively scene-mounted if they ever need to grow past their pre-warmed size at runtime — documented in docs/security-audit-phase7.md, shouldn't occur at 5v5 scale but worth knowing.
- No per-connection rate limiting on fire-request/player-input (mild DoS surface, not a spoofing surface — cooldown/ammo are already server-enforced). Out of scope for 7.2's literal ask; flagged for later hardening.
- Production JS bundle is ~1.4MB (three.js is inherently large); consider code-splitting/dynamic import if Phase 8 deploy shows load-time issues. Not a functional problem, noted for later.
- Kill feed can drop an entry if two lethal hits land in the same React state batch (the feed is
  appended via a state setter that reads the previous array once per broadcast). Cosmetic,
  low-probability at 5v5 scale — noted in follow-up round 8, deliberately not fixed yet.
- Both teams spawn stacked on a single point per team (no spawn-point spread). Players briefly
  overlap at round start. Noted in follow-up round 8, deliberately not fixed yet.
- A corpse→alive slot recycle in `RemotePlayers.tsx` briefly plays a stand-up flicker (the death
  topple spring relaxes back to idle when the slot's occupant changes). Cosmetic, noted in
  follow-up round 8, deliberately not fixed yet.
- client/src/net/messages.ts duplicates types that server/src/net/messages.ts also defines (and server/src/sim/movement.ts duplicates client/src/game/player/playerController.ts's stepPlayer, and server/src/combat/weaponRules.ts duplicates client/src/game/weapons/weaponDefs.ts). Consider extracting a shared workspace package once the shapes stabilize (SRS §6 already flags this).
- Full input-replay reconciliation (re-simulating unacknowledged inputs after a server correction) is not implemented — v1 uses a simpler blend-toward-snapshot approach (docs/specs/task-4.1.md Open Questions). Fine at low latency, will feel soft under real internet jitter.
- NetDebugPanel.tsx is an intentionally minimal dev harness for Phase 4 verification — Phase 5 replaces it with the real Lobby UI.
- ~~Have not been able to manually verify two-browser-tab room create/join end-to-end~~ RESOLVED for the lobby flow specifically: `client/e2e/lobby.spec.ts` (Playwright) now drives two real Chromium contexts through create/join/roster/host-start against the real dev servers. Full scripted two-browser combat loops (create/join/start → buy → kills → payouts → round advance) were additionally run twice from ad-hoc scratchpad scripts (follow-up rounds 8–9) and passed, but those scripts are not checked in — movement/weapon-fire/round-timing coverage in the committed e2e suite is still lobby-only (see docs/TESTING.md's manual QA checklist). With the buy phase retuned to 8s and action to 60s, checking a combat spec in is now feasible without test-only time overrides.
