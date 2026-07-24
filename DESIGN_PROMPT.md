# Design brief: make Stickfps look and feel great

> **STATUS UPDATE — 2026-07-24 (post-launch round 10).** This brief is the original design
> handoff; several of its constraints have since shipped as *changes*, so read it as history
> plus this note:
> - **The game is now FULL COLOUR.** The mandatory grayscale post-filter was retired at the
>   user's direction (they wanted a vibrant Krunker/Venge read, not monotone). Everything below
>   that says "grayscale / author for luminance / no colour in the match view" is **superseded** —
>   author in colour now (hue matters). The `#canvas-wrap` filter is `contrast(1.08)
>   saturate(1.14) brightness(1.04)`; players are team-coloured (teammate blue / enemy red-orange).
> - **New gameplay since this brief:** server AI bots (host fill-with-bots), a frag grenade ability
>   ([G], server-authoritative), killstreak perks (3/5 kills → fire-rate/reload/move buffs, mirrored
>   client+server), a second cosmetic map with a host map-cycle, a Tab K/D scoreboard, and a
>   HUD kill-juice layer. A bloom post pass now runs (`effects/PostFX.tsx`) — the "no post stack"
>   line below no longer holds.
> - Everything else — no external assets, server-authoritative/client-cosmetic, additive-only wire
>   changes, the perf budget, and the `data-testid` contract — **still binds.**
> See PROGRESS.md round 10 and docs/DESIGN-BRIEF.md for the current ground truth.

You are a senior game-feel / technical art director being brought onto an existing,
**fully working** browser FPS. The game is functionally complete and heavily tested — your
job is **not** to add gameplay systems or touch networking. Your job is to make it look,
sound, and *feel* like a polished commercial game: art direction, UI/UX, animation, and
"juice" (screen shake, hit feedback, transitions, micro-interactions).

Read this whole brief before proposing anything. At the end I tell you exactly what I want back.

---

## 1. What the game is

**Stickfps** — a 5v5, round-based, competitive tactical FPS played in the browser. Think
Counter-Strike's economy/round structure, but the players are **stickmen** and the whole
world renders in a **film-noir grayscale** look. Two teams (A and B) spawn on opposite ends
of a small industrial arena, buy, then fight; a round ends when one team is wiped or the
timer runs out; first team to a majority of rounds wins the match.

Current core loop, all implemented and working:
- Lobby → create/join room by code → host starts match.
- Round phases: **buy** (8s setup, weapons locked) → **action** (60s fight) →
  **round-end** (3s intermission with a "TEAM X TAKES THE ROUND" banner) → next buy.
- Weapons: a **Revolver** (6 rounds, fast) and a **Kar98** bolt-action sniper (5 rounds,
  scoped, slow bolt cycle). Switch with 1/2, reload with R, right-click to scope the Kar98.
- Economy: money per round win, shown bottom-right.
- Match end: VICTORY / DEFEAT / DRAW screen, back to lobby.

It is genuinely playable end-to-end right now. This is a polish pass on top of a working game.

---

## 2. The tech, and the hard constraints that shape every design decision

This is the most important section. Suggestions that ignore these will be thrown out.

**Stack**
- **Client:** React + TypeScript, **React Three Fiber (R3F)** / three.js for the 3D scene,
  plain React + inline styles for the 2D HUD/menus. Vite. Vitest for tests.
- **Server:** Node + geckos.io (UDP-over-WebRTC). **Server-authoritative** — the server owns
  all ammo, cooldowns, hit detection, HP, money, and round state.

**Hard constraints — do not violate these:**

1. **No external art assets. At all.** There is no texture pipeline, no model files, no image
   files, no audio files, no web fonts. Everything is generated in code:
   - 3D: three.js primitive geometry (boxes, cylinders, spheres, tori) + `meshStandardMaterial`.
     Stickmen are assembled from primitives. The environment is assembled from primitives.
   - Audio: **synthesized with the Web Audio API** (oscillators + noise buffers) in
     `client/src/audio/sounds.ts`. Gunshots, reloads, hitmarker, damage — all synth, no files.
   - UI: system-ui font, inline styles, CSS keyframes. No icon fonts, no SVG asset files
     (inline SVG drawn in code is fine).
   - **If a design needs an asset, it must be procedurally generatable in code, or it's out.**
     You may propose shaders (GLSL via R3F) and data-URI textures generated at runtime, but
     assume no artist and no asset store.

2. **The client is cosmetic only.** The server decides everything that matters. You may add
   any amount of visual prediction, easing, particles, and feedback, but the *truth* always
   comes from server messages (`roomState`, `hit-result`, `shot-fired`). Never design
   something that requires the client to be authoritative over ammo/HP/hits/round state.
   Do not change the wire protocol or server logic.

3. **~~Grayscale is applied as a post filter.~~ SUPERSEDED — the game is full colour now.**
   The 3D canvas is wrapped in a CSS `filter: contrast(1.08) saturate(1.14) brightness(1.04)`
   (see `client/src/App.tsx`); the old `grayscale(1)` filter was removed 2026-07-24. Author in
   **colour** — hue carries meaning again (team red/blue, hazard amber, map palette). Art
   direction now lives in value **and** colour composition, and coloured emissive accents bloom
   (via `effects/PostFX.tsx`) instead of flattening to grey. The historical grayscale guidance
   throughout this doc no longer applies.

4. **Keep it running.** Typecheck, lint (oxlint), and the vitest suites (108 server / 52 client)
   must stay green. Don't break the `data-testid` hooks the tests and e2e specs rely on
   (`team-score`, `hp-bar`, `kill-feed`, `buy-phase-banner`, `round-end-banner`,
   `death-overlay`, `crosshair`, `reload-hint`, `final-score`, etc.) — you can restyle those
   elements freely, just keep the test ids.

5. **Performance budget is real.** Up to 10 players + effects at 60fps in a browser tab, and
   it was built in an environment with no GPU profiling tools. Prefer cheap tricks (baked
   gradients, additive sprites, instancing, pooled particles) over expensive ones
   (real-time GI, heavy post stacks, per-pixel shadows everywhere).

---

## 3. Where things live (so you can point at exact files)

```
client/src/
  App.tsx                         # top-level shell, grayscale filter, FOV/sensitivity, screen routing
  game/
    Scene.tsx                     # lights + fog + all scene contents (READ THIS for current lighting)
    environment/Environment.tsx   # the whole arena: ground, walls, crates, barrels, crane, fan, drone, beacons
    player/
      Stickman.tsx                # the procedural stickman (limbs on pivots, walk swing, death topple)
      RemotePlayers.tsx           # other players, pose driven from server position deltas
      PlayerRig.tsx               # local camera rig / movement feel
    weapons/
      WeaponViewmodel.tsx         # first-person gun models, draw/bob/recoil/muzzle-flash, Kar98 bolt
    effects/
      BulletTracers.tsx           # tracer lines
      ImpactParticles.tsx         # hit sparks
  audio/sounds.ts                 # ALL sound, synthesized Web Audio
  ui/
    HUD.tsx                       # in-match 2D overlay: score, HP, ammo, money, kill feed, banners, crosshair
    Lobby.tsx                     # pre-match lobby / room create-join / roster
    PauseMenu.tsx                 # pause + sensitivity slider
    MatchEndScreen.tsx            # victory/defeat/draw
```

---

## 4. Current visual/UX state — an honest read

Assume all of this *works*; the question is whether it's *good*. Be critical.

**Lighting / mood (`Scene.tsx`):** Noir setup — dark background (`#232527`), fog fading distant
silhouettes (25→95m), a hemisphere fill, an ambient, a hard "moon" key directional with a
properly-sized shadow camera (±30m), and a warm orange rim. It reads as a moody industrial
yard. It's competent but flat-ish; there's no real cinematic post (no bloom on the emissives,
no vignette baked into the scene, no color grade beyond the CSS filter). Emissive beacons and
the drone light are the only "pop."

**Environment (`Environment.tsx`):** "Diesel Ops" industrial yard — perimeter walls, shipping
containers, crate clusters, barrels, sandbags, pipe runs, catwalk towers, plus animated set
dressing (rotating fan, swinging crane, patrolling drone with a blinking light, pulsing warning
beacons). All primitive geometry. It's readable but blocky and a bit toy-like; materials are
uniform matte, silhouettes are simple, nothing has wear/edge definition. **Note:** the props are
visual only — they are NOT collision or cover (movement + bullets are server-side and only know
about players and the ±24m bounds). So cover *reads* but doesn't *work* yet; design around that
truth or flag it.

**Stickmen (`Stickman.tsx` / `RemotePlayers.tsx`):** Assembled from primitives, limbs on
shoulder/hip pivots, procedural walk swing scaled by measured speed, arms counter-swing, a
death topple (rotates to prone). Teammates get a floating rotating octahedron marker overhead.
Functional and surprisingly alive, but the base pose is stiff, there's no idle motion, no aim/
lean, no upper-body reaction to firing, hit reactions are absent, and all players are the same
flat gray — hard to read teammate/enemy/self at a glance beyond the marker.

**First-person weapons (`WeaponViewmodel.tsx`):** Gun models are primitives. There's a
draw-raise on switch, a walk bob, per-weapon recoil kick, a muzzle flash (emissive sphere +
point light), and a real Kar98 bolt-cycle animation. Solid foundation. Missing: sway on
mouse-move (weapon lag), landing/step impact, ADS transition polish, shell ejection, better
muzzle flash shaping, recoil that feels weighty.

**HUD (`HUD.tsx`):** Everything is present and legible — centered team score + round/phase +
countdown up top, a buy-phase "SETUP" banner, a round-end banner, an ELIMINATED death overlay,
top-right kill feed, bottom-center HP bar, bottom-left weapon/ammo list, bottom-right money,
a pulsing "[R] RELOAD" hint, crosshair, hitmarker, damage vignette, Kar98 scope reticle. But
it's all **plain system-ui text with drop shadows and inline styles** — it reads like a
debug overlay, not a designed HUD. No visual hierarchy system, no consistent panel/frame
language, no iconography, no transitions when values change, no typographic identity. This is
probably the single highest-leverage area to redesign.

**Menus (`Lobby.tsx`, `PauseMenu.tsx`, `MatchEndScreen.tsx`):** Functional React forms/screens.
Read them to judge; expect the same "works but undesigned" character as the HUD.

**Audio (`sounds.ts`):** Synth gunshots (Kar98 deeper/longer than revolver), reload clicks,
dry-fire, hitmarker blip, damage thud, distance-attenuated remote shots. A good start; missing
ambience/tension beds, round-phase stingers, UI sounds, footsteps, low-HP heartbeat, etc. —
all of which must stay synthesized.

---

## 5. What I want from you (the design work)

Treat these as the target areas. Prioritize by impact-per-effort and tell me your ordering.

1. **A HUD/UI redesign** that reads as an intentional design system: type scale, a consistent
   frame/panel language, spacing rhythm, state-change transitions (HP tick, ammo, money count-up,
   score flip), a clearer at-a-glance hierarchy (what do I need mid-fight vs. between rounds).
   Redesign the crosshair, hitmarker, damage feedback, kill feed, and phase banners as a family.
   Keep every `data-testid`.

2. **Lobby + menu redesign** so the first thing a player sees sells the game — cohesive with the
   in-match HUD identity.

3. **Scene/lighting/art-direction pass** — push the noir mood further: value composition, fog,
   emissive bloom-like tricks, a baked vignette, better material variation and silhouette
   definition on the environment and stickmen, without breaking the grayscale post or the perf
   budget. Make teammate/enemy/self instantly readable in grayscale (value, marker, outline,
   shape — your call).

4. **Animation + game feel** — idle/aim/hit-reaction on stickmen; weapon sway, landing impact,
   shell eject, weightier recoil; screen shake and hit-stop on kills; smooth ADS; transitions
   between round phases; muzzle-flash and tracer improvements. All the "juice."

5. **Audio design (synth only)** — an ambience/tension bed, round-phase stingers, UI clicks,
   footsteps, low-HP cue, kill/round-win feedback. Extend `sounds.ts`.

For each area: describe the intended look/feel, then give concrete, buildable changes tied to
the specific files above (component structure, values, three.js/R3F techniques, CSS). Where a
mockup helps, describe it precisely or provide code.

---

## 6. What I want back (deliverable format)

1. **Art-direction statement** — 1 short paragraph. What is the intended *feeling*? Nail the
   noir identity in words so every later choice can be checked against it.
2. **Prioritized plan** — a ranked list of changes (biggest impact first), each with: the file(s)
   it touches, the effort (S/M/L), and why it matters. Be honest about what's high-leverage
   (I suspect the HUD and the lighting/material pass are) vs. nice-to-have.
3. **Then implement**, one area at a time, smallest-diff-that-improves-it first. After each area:
   keep typecheck/lint/tests green, and tell me what changed and how to see it.

Ask me anything you need before starting — especially: do I want to keep strict grayscale, or
allow a subtle single-hue accent? What's the reference vibe (Limbo/Inside's silhouette drama?
Sin City's high-contrast ink? Metro's grimy industrial?) — propose one if I don't answer.

Start by reading `client/src/App.tsx`, `client/src/game/Scene.tsx`,
`client/src/game/environment/Environment.tsx`, and `client/src/ui/HUD.tsx`, then give me the
art-direction statement + prioritized plan **before** writing any code.
