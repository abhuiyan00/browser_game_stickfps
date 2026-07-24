# Stickfps — Design Handoff Brief

**Purpose:** hand this to a design-focused AI session so it can study the current build and propose how to raise it toward AAA / Unreal-Engine-tier *feel and polish*. This document is the ground truth of what exists today, plus the hard walls the design must live inside. Read the constraints section first — several obvious "just do X" ideas are off the table by architecture, and a designer needs to know that before proposing.

> **UPDATE — 2026-07-24 (post-launch round 10). Two structural things in this doc have changed:**
> 1. **The match is FULL COLOUR now.** The mandatory grayscale post-filter was retired at the
>    user's direction. Author materials/lighting in **colour** — hue carries meaning again (team
>    red/blue, hazard amber, per-map palette). The `#canvas-wrap` filter is now
>    `contrast(1.08) saturate(1.14) brightness(1.04)`. Every "grayscale / author for luminance,
>    not hue / colour doesn't survive into the match" statement below is **superseded.**
> 2. **A bloom post pass now exists** (`client/src/game/effects/PostFX.tsx`) — the "no
>    post-processing stack" line below is no longer true; coloured emissives bloom.
>
> New gameplay since this brief (all server-authoritative): **AI bots** (host fill-with-bots),
> a **frag grenade** ability ([G]), **killstreak perks** (3/5 kills → fire-rate/reload/move,
> mirrored client+server), a **second cosmetic map** (COLDLINE-9) with a host map-cycle, a **Tab
> K/D scoreboard**, and a **HUD kill-juice** layer. Test counts are now **108 server / 52 client.**
> Everything else in Section 2 (no external assets, server-authority, additive-only wire changes,
> perf budget, `data-testid` contract) still binds. See PROGRESS.md round 10.

---

## 1. What the game is

A browser-based, **5v5 round-based tactical FPS** — think Valorant/CS structure with Krunker/Deadshot movement, rendered as **low-poly stickman avatars** in a monochrome "diesel-ops" industrial arena. Anonymous sign-in, ephemeral 6-character room codes, no accounts, no PII.

- **Stack:** Three.js via React Three Fiber (Vite + React + TypeScript) on the client; a WebSocket (`ws`) game server; Supabase anonymous auth. Client → Vercel, server → any persistent Node host (Render/Koyeb/Fly.io). *(Transport was geckos.io UDP-over-WebRTC until round 11.)*
- **Structure:** 12 rounds, buy phase → action phase → round-end intermission, side swap at halftime, first to 7 clinches.
- **Status:** fully playable and green (server 108 tests, client 52 tests). Movement, weapons, a frag-grenade ability, killstreak perks, buy economy, server-authoritative hit registration, AI bots, two cosmetic maps, a full-colour art pass, game-feel/kill-juice layers, procedural art, synthesized audio, and a reactive HUD are all shipped.

---

## 2. Hard constraints — the box the design MUST live in

These are non-negotiable and structural. A proposal that violates one of these can't ship without rearchitecting the whole project.

| Constraint | What it means for design |
|---|---|
| **Everything is generated in code** | No image files, no 3D model files, no audio files, no font files. Geometry = Three.js primitives (box/sphere/cylinder/capsule/torus). Audio = Web Audio synthesis. UI = inline styles / injected CSS. Textures = procedural (e.g. the lobby's film grain is an inline SVG turbulence data-URI). **Any "import this texture/model/soundfont" idea is dead on arrival.** Ambition has to be expressed through geometry composition, lighting, animation, and math. |
| ~~**Mandatory grayscale post-filter**~~ **SUPERSEDED — full colour (2026-07-24)** | The grayscale filter was removed; the 3D view now renders under `contrast(1.08) saturate(1.14) brightness(1.04)`. **Colour survives into the match view — author for hue *and* value.** Team read is colour now (teammate blue / enemy red-orange, `client/src/game/teamColors.ts`), each map has its own palette (`maps.ts`), and hazard/emissive accents bloom. The old "two objects differing only in hue are identical in play" rule no longer applies. |
| **Server is authoritative; client is cosmetic** | The client predicts and animates but never *decides* anything: not ammo, HP, hits, positions, cooldowns, money, or round state. All of that is computed server-side and streamed down. Design can make feedback richer, but cannot introduce a mechanic the client would have to adjudicate. |
| **Wire protocol is append-only** | New data from the server must be added as *optional* fields (old clients must tolerate them). A designer can *ask* for a new field (e.g. "send me which body-zone was hit") but it's an explicit protocol change, not a freebie. |
| **Performance budget** | 10 players + effects at 60 fps. Effects must be pooled/instanced (shell casings, tracers, and impact particles already are). No unbounded per-frame allocation. |
| ~~**No post-processing stack**~~ **UPDATED — bloom shipped** | A real bloom post pass now runs (`client/src/game/effects/PostFX.tsx`, `@react-three/postprocessing`), tuned low (intensity 0.85, luminance threshold 0.95) so only bright emissives glow. DOF/SSAO/heavy grades are still avoided for the perf budget, but "bloom must be faked with glow spheres" is no longer true — author emissive accents and let them bloom. |
| **Don't break test hooks** | The UI is covered by `data-testid` attributes and a Playwright e2e suite. Renaming/removing testids or the "Round N" HUD text breaks CI. Restyle freely; keep the hooks. |

> The single most important sentence for a designer: **the match is grayscale and 100% procedural geometry — so "Unreal-tier" here means Unreal-tier *composition, animation, lighting-as-value, and game feel*, not Unreal-tier assets.** That's where the ambition should point.

---

## 3. Current interface — screen by screen

### 3.1 Lobby / sign-in (`client/src/ui/Lobby.tsx`)
The most polished surface today. Full-screen noir:
- Animated **film grain** (drifting SVG turbulence), **scanline** overlay (mix-blend overlay), inset **vignette**.
- Brand block: an SVG **stick-figure-inside-a-reticle** mark, `STICK`**`FPS`** wordmark with amber accent, letterspaced tagline "FIVE VERSUS FIVE · TACTICAL NOIR".
- Live **status line**: colored dots for `auth:` and `net:` state (green/amber/red).
- Room card: **click-to-copy room code** (2.1rem mono, letterspaced), two **team roster columns** (TEAM A / VS / TEAM B, 5 slots each, filled + "open slot" placeholders), and either a gold **START MATCH** button (host) or a "waiting for host" spinner.
- Pre-room card: **CREATE ROOM**, an "OR JOIN A ROOM" divider, and a 6-char code input + **JOIN**.
- All motion is CSS keyframes (rise-in, spinner, grain drift). Amber-on-near-black palette.

### 3.2 In-match shell (`client/src/App.tsx`)
- The 3D `<Canvas>` sits in `#canvas-wrap` under the grayscale filter.
- A **cinematic vignette + top/bottom gradient** overlay sits above the canvas (true black, outside the filter) and below the HUD; never eats clicks.
- HUD, buy menu, pause menu, and match-end screen layer on top.

### 3.3 HUD (`client/src/ui/HUD.tsx`)
Shared design tokens: a translucent noir panel (`rgba(10,12,14,0.42)`, hairline border, 8px radius) and a monospace face for all numerics, so HP / ammo / funds read as one instrument cluster.
- **Top-center:** team score `A (you) 3 — 2 B`, `Round N · phase`, and a live countdown.
- **Buy phase:** centered `SETUP` banner + "weapons unlock in Ns" + `[B] ARMORY` hint.
- **Round-end:** centered "YOUR TEAM TAKES THE ROUND" / "ROUND DRAW" banner + next-round countdown.
- **Death:** full-screen dimmed `ELIMINATED` overlay ("spectating until the next round").
- **Kill feed** (top-right): `Shooter ✕ Target`, headshots prefixed with a gold `◎`, entries fade after 4.5s.
- **HP bar** (bottom-center): `HEALTH` label + big mono value + fill bar; both recolor red at ≤30.
- **Weapon list** (bottom-left): owned weapons only, each row = hotkey · name · mono `ammo/max`; active weapon gets a gold left accent bar and shows its phase (RELOAD/ZOOM); empty mag flags red.
- **Funds** (bottom-right): `FUNDS $NNN` in mono green.
- **Reticle:** a **dynamic four-arm crosshair** whose gap blooms with movement speed and each shot (driven by a module bus read via rAF, so zero React re-render), tightening at rest — it visually mirrors the server's actual spread model. Kar98 ADS swaps to a **scope reticle** with a dark tunnel vignette.
- **Hit feedback:** a **hitmarker** (four ticks; gold and larger for a headshot), and a **red radial damage-flash** vignette when the local player is hit (which also kicks screen-shake scaled to the damage).
- **Pause button** top-right.

### 3.4 Buy menu (`client/src/ui/BuyMenu.tsx`)
Modal overlay `ARMORY`, current money, and a responsive grid of weapon cards (two since the fast-pace redesign): name, `[hotkey]`, role label (SIDEARM / LONG RANGE) · round count, and a status chip (`STARTER` / `OWNED` / `$price` / `NO FUNDS`) colored green/amber/red. Click a card or press its number to buy. Purely a UX surface — every purchase is validated server-side.

### 3.5 Pause menu & match-end
Pause menu (resume, leave, mouse-sensitivity slider) and a match-end screen exist (`PauseMenu.tsx`, `MatchEndScreen.tsx`) — functional, least-polished of the surfaces, good candidates for a design pass.

---

## 4. Current game logic

### 4.1 Movement (`client/src/game/player/playerController.ts`, mirrored server-side)
Quake/Krunker-style momentum, fixed 60 Hz on both sides, predicted client-side and reconciled to the server:
- Ground walk cap **7 m/s** (hard ceiling 12), ground accel 60, **air accel 8** (air *control*, enabling air-strafe up to 7 m/s), friction 34, gravity −22, jump 7.5.
- Eye height 1.6 standing / 1.0 crouched.
- **Crouch-slide:** needs ≥5 m/s to start, gets a one-time 1.15× boost, low friction so momentum carries, auto-ends after 0.9s or below 2.5 m/s. Jumping out of a slide keeps the boosted speed (**slide-hop**), gated so you can't glide forever on the ground.
- Arena is a ±24 m square; walls are hard clamps.

### 4.2 Weapons (`client/src/game/weapons/weaponDefs.ts`; damage server-side)
| Weapon | Role | Price | Mag | Fire cd | Reload | Damage | Notes |
|---|---|---|---|---|---|---|---|
| Revolver | pistol | free (always owned) | 6 | 0.50s | 1.5s | 26 | starter |
| Kar98 | sniper | 2400 | 5 | 1.50s | 2.2s | 100 | ADS 75°→30° FOV; one-shot body |

The arsenal was cut from five weapons to these two in the fast-pace redesign (follow-up round 9).
The multi-pellet scatter machinery (shotgun-style cone) is retained in the accuracy model and
covered by a synthetic test profile, but no shipped weapon uses it.

- **Hit zones:** head / body / legs spheres. Multipliers **head ×2.5, body ×1.0, legs ×0.85** (HP is 100, so a Kar98 body shot or a rifle headshot ≈ 65 is decisive).
- **Accuracy is server-side:** the server perturbs the shot ray by a spread cone (grows with movement speed, air, and a per-shot **recoil climb** that resets after a firing gap). The client's dynamic crosshair is a read-out of that model, not the source of it. A cheating client cannot spray perfectly — the server owns the error.
- Switching weapons has a 0.35s equip settle before the incoming gun can fire; the viewmodel plays a draw animation over exactly that window.
- **Frag grenade ability ([G], `server/src/combat/grenade.ts`).** Everyone carries one. The server owns the whole thing: a thrown projectile arcs under gravity, bounces off the floor and ±24m walls, and detonates on a 1.6s fuse for radial damage (92 at the centre → 16 at the 6.5m edge, linear falloff, friendly-fire off). 16s per-player cooldown, reset each round. The client only renders the broadcast projectile (pooled blinking casing) + an expanding additive explosion flash/light/trauma, plays a synth throw/boom, and shows a HUD cooldown chip — a local cooldown *mirror* gates spam but the server is authoritative.
- **Killstreak perks (`server/src/combat/perks.ts` ↔ `client/src/game/perks.ts`).** A 3-kill streak grants tier I, 5 kills tier II (reset on death or a new round): fire cooldown ×0.88/×0.78, reload ×0.85/×0.72, move-speed ×1.05/×1.10. Because the client predicts fire/reload timing and movement, the buff tables are **mirrored on both sides** and the pure sim functions take a multiplier so prediction and reconciliation agree. A HUD `perk-badge` shows the active tier.

### 4.3 Rounds & economy (`server/src/rounds/roundLogic.ts`, `server/src/rooms/Room.ts`)
- 12 rounds; **buy 8s → action 60s → round-end 3s** (retuned from 30s/90s in the fast-pace redesign). Side swap after halftime (round 7). First team to **7** round wins clinches the match early.
- A round ends by elimination or action-phase timeout.
- **Economy:** everyone starts a match with **800**; each player on the team that wins a round gets **+3000**. **No health regen.** **Loadout resets to the free pistol at the start of every round** — the buy phase is where each round's kit is chosen (CS-style). The grenade and killstreak perks also reset each round.
- **AI bots (`server/src/rooms/BotBrain.ts`).** The host can fill empty slots with bots from the lobby ("+ FILL WITH BOTS", server-enforced host + lobby only) so a solo player can start and watch a full 5v5. Bots are real authoritative `PlayerRecord`s driven each tick through the same fire/move/reload paths — movement is deliberately simple (face the nearest enemy, approach/hold a preferred range) behind a single `DIFFICULTY` knob. They never become host and are dropped when the last human leaves.
- **Maps are cosmetic (`client/src/game/maps.ts`).** The sim only knows the ±24m bounds, so a "map" is a palette + lighting + fog + a hero-prop swap over the same play space. The server picks a `mapId` and broadcasts it in `RoomState`; every client renders the matching theme (FOUNDRY-7 warm / COLDLINE-9 cold), and the host cycles it in the lobby ("⟳ MAP"). Changing maps changes the look, not the layout or collision.

### 4.4 Netcode
WebSocket-over-TCP (`ws`). Server simulates at 60 Hz and streams position snapshots; the client runs local prediction + reconciliation for the self and interpolates remote players from the snapshot buffer. Leavers' interpolation buffers are dropped so they don't freeze in place. *(Was geckos.io UDP-over-WebRTC until round 11 — swapped for TCP WebSocket so the server runs on free no-card hosts; a lost packet can briefly head-of-line-block, negligible at hobby scale.)*

---

## 5. Current art direction (`client/src/game/environment/Environment.tsx`, `Stickman.tsx`, `WeaponViewmodel.tsx`)

### 5.1 Arena — "Diesel Ops" industrial yard
All Three.js primitives: ground plane, ±24.4 m perimeter walls (with a lit base seam + lighter cap rail so the boundary reads in grayscale), two emissive **spawn-pad rings** at z = ±10 (the strongest value anchors on the dark floor), shipping containers, crate clusters, barrels, sandbag walls, pipe runs, catwalk towers, plus animated set-dressing: a **rotating fan**, a **swinging crane**, a **patrol drone** (blinking red light + additive glow), and pulsing **warning beacons**.

Environment pass 2 (follow-up round 9) added: stacked **container piles**, **rubble piles**, **lamp posts** with real point-light pools, animated **steam vents** (pooled puffs), sagging **cable spans** with hanging work lamps, painted **lane markings** on the floor, and a beyond-the-walls skyline of **smokestacks + a gantry frame**. The first version of this pass crushed to black under the grayscale filter, prompting a lighting-value rebalance in `Scene.tsx` (raised hemisphere/ambient intensities, a third fill directional, lighter fog and wall/catwalk material values) — a live example of "author for luminance, not hue."

> ⚠️ **Big gameplay caveat:** the environment is **visual only**. Nothing in it participates in movement collision or bullet occlusion — the server only knows about the ground plane, the ±24 walls, and player capsules. Props read as cover but don't block anything. Making them real cover requires matching server-side geometry (tracked as a follow-up). A designer proposing "use this crate as cover" should know it isn't cover yet.

### 5.2 Lighting (`client/src/game/Scene.tsx`)
Hemisphere fill + ambient (keeps enemies readable at range) + a hard directional **"moon" key** casting long shadows across the whole ±30 m arena (2048 shadow map) + an amber rim directional. Fog from 25–95 m fades background silhouettes. This is deliberately built to give the grayscale filter **distinct luminance bands** to work with.

### 5.3 Characters (`Stickman.tsx`)
Low-poly stick figures from spheres/capsules with: a **procedural walk cycle** (limbs swing from shoulder/hip pivots, scaled by speed), **distance LOD** (full body under 18 m, a single capsule beyond), a **death topple**, a **lean into strafes/slides**, a **flinch** jerk on taking a hit, and a floating **octahedron teammate marker** (the friend/foe read in a colorless scene). Since follow-up round 9, every stickman also holds a **primitive gun prop matching its server-side equipped weapon** (revolver one-handed aim pose, kar98 two-handed with a support arm on the fore-stock), with a **spring arm-recoil kick + 70ms muzzle flash per server-confirmed shot**.

### 5.4 First-person viewmodel (`WeaponViewmodel.tsx`)
Per-weapon primitive gun models parented to the camera, with: muzzle flash (emissive core + additive halo + point light), **recoil kick** (vertical + a small random horizontal yaw), walk **bob** + idle **breathe**, **draw-from-holster** on switch with a **wrist-roll** over the spring draw, weapon-specific mechanical animation (Kar98 **bolt cycle**, revolver **cylinder spin** on reload), a **reload dip + cant** on a sin curve shaped to the exact server reload duration (deep for the revolver, subtle for the kar98), and **pooled brass shell ejection**.

### 5.5 Game feel
A **trauma-based screen shake** (single-writer camera, decays over time) fired by shooting and by taking damage; the dynamic crosshair bloom bus; hitstop-free but layered impact/tracer effects.

---

## 6. Current audio (`client/src/audio/sounds.ts`)
100% Web Audio **synthesis** — no sample files. Noise-burst + oscillator helpers build: per-weapon **gunshots** (distinct timbres), dry-fire, reload, hitmarker, a two-tone **headshot** confirm, damage-taken, **footsteps** (stride-gated by movement), UI clicks, **phase stingers** (buy/action/win/loss/draw), a persistent industrial **ambience bed** (oscillator + sub + noise), and a **low-health heartbeat** that pulses while critically wounded.

---

## 7. Where "make it feel like Unreal" actually points

The game can't *be* Unreal (no assets, grayscale, browser budget). But the production *feel* of a AAA shooter comes mostly from things this stack **can** do. Aim the ambition here:

1. **Value composition & lighting.** Since play is grayscale, this is the single highest-leverage area. Stronger key/fill separation, rim lighting to pop silhouettes off the background, deliberate light/dark zoning of the arena, readable "where do I fight" value hierarchy. Treat it like black-and-white cinematography.
2. **Animation quality & secondary motion.** ✅ *Largely done (follow-up round 7):* a reusable damped-spring integrator (`client/src/game/effects/spring.ts`) now drives viewmodel recoil/draw overshoot and the stickmen's landing squash-and-stretch, death topple, and idle life. Remaining headroom: richer death physics and more pose variety.
3. **Game feel / impact.** Hitstop on kills, punchier directional damage indicators, kill-cam-lite moments, better recoil *recovery* curves, controller-grade camera kick, weapon-specific screen-shake character.
4. **Effects within budget.** Richer muzzle flashes, impact sparks/debris by surface, tracer character per weapon, heat-haze-style additive tricks, environmental particulate (drifting dust motes catching the key light) — all pooled.
5. **UI motion & hierarchy.** Diegetic-leaning HUD, smoother number transitions, hit/kill juice, a buy menu and match-end screen that feel like a product. The lobby is the current high-water mark; bring the rest up to it.
6. **Audio layering.** Distance/occlusion cues, low-end weight on impacts, a music/tension layer tied to round phase, spatialization.
7. **Silhouette & readability.** In grayscale multiplayer, instant friend/foe/threat reading is a *design* problem worth solving richly (currently just the floating diamond).

---

## 8. Open questions for the design pass

Decisions a designer should weigh in on rather than assume:

1. ~~**Grayscale purity.**~~ **RESOLVED (2026-07-24): full colour.** The user chose to retire the grayscale filter entirely for a vibrant arena-shooter read; colour now lives in the 3D view (team red/blue, per-map palette, hazard amber) as well as the HUD. Remaining design headroom is disciplined *use* of that colour (a consistent threat/objective language), not whether to have it.
2. **Diegetic vs. classic HUD.** How far toward in-world/diegetic should the HUD go, given it's a stickman abstraction rather than a realistic soldier?
3. **The cover problem.** Is "make props into real cover" in scope for design to *request* (it's an engineering follow-up), and if so which few props matter most?
4. **Identity.** Lean harder into the "tactical noir / diesel-ops" theme, or push toward a cleaner arena-shooter (Krunker) look? The current build straddles both.
5. **Menus.** The pause and match-end screens are the least-developed surfaces — priority for a facelift?

---

## 9. Where to look in the code

| Area | File(s) |
|---|---|
| In-match shell + grayscale filter | `client/src/App.tsx` |
| HUD, crosshair, hitmarker, damage flash | `client/src/ui/HUD.tsx` |
| Lobby / sign-in | `client/src/ui/Lobby.tsx` |
| Buy menu | `client/src/ui/BuyMenu.tsx` |
| Arena art + lighting | `client/src/game/environment/Environment.tsx`, `client/src/game/Scene.tsx` |
| Stickman avatar + animation | `client/src/game/player/Stickman.tsx`, `RemotePlayers.tsx` |
| First-person weapons + game feel | `client/src/game/weapons/WeaponViewmodel.tsx`, `client/src/game/effects/` |
| Audio synthesis | `client/src/audio/sounds.ts` |
| Movement sim | `client/src/game/player/playerController.ts` |
| Weapon data | `client/src/game/weapons/weaponDefs.ts` |
| Combat/economy/rounds (authoritative) | `server/src/rooms/Room.ts`, `server/src/combat/`, `server/src/rounds/roundLogic.ts` |
| Wire protocol | `client/src/net/messages.ts` ↔ `server/src/net/messages.ts` |

---

*Everything above reflects the shipped, test-green build. The design partner's job: propose how to raise fidelity and feel toward AAA within Section 2's walls — most of the runway is in lighting-as-value, animation, game feel, effects, and bringing the menus up to the lobby's bar.*
