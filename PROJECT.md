# PROJECT.md — Stickfps

## What this is

A 5v5 round-based tactical shooter that runs in the browser. Full-colour, team-coloured low-poly stickman avatars, two weapons + a frag grenade, killstreak perks, server-authoritative hit registration, optional AI bots to fill a match, two cosmetic maps, ephemeral room-code lobbies. No accounts, no PII, no persistence beyond a match.

## Pillars

| Pillar | Decision | Why |
|---|---|---|
| Rendering | Three.js via React Three Fiber (R3F) | Declarative scene graph over Three, keeps UI (lobby/HUD) and 3D in one React tree |
| Avatars | Low-poly stickman (capsule torso + limb primitives) | Cheap to render x10, cheap to network (few bones/joints) |
| Weapons | Revolver (free starter, 26 dmg, 6 rounds, 0.5s cooldown, 1.5s reload, hitscan) + Kar98 ($2400 buy, 100 dmg — one-shot to the body, 5 rounds, 1.5s cooldown, 2.2s reload, right-click zoom 75→30 FOV) | Two archetypes: fast/spray vs slow/precise, minimal scope for a v1 arsenal |
| Abilities | Frag grenade ([G]) — server-authoritative arc + radial damage (1.6s fuse, 6.5m blast, 16s cooldown) | One universal utility everyone has, no loadout complexity |
| Progression | Killstreak perks at 3 and 5 kills (fire-rate/reload/move-speed buffs, reset on death) | Rewards in-round momentum without persistent unlocks; mirrored client+server so prediction stays honest |
| Bots | Server-side AI fills empty slots (host opt-in, lobby only) | A solo host can start and watch a full 5v5 |
| Maps | Two cosmetic themes (FOUNDRY-7 / COLDLINE-9), host-cyclable, server-broadcast | Palette/lighting/fog over one shared ±24m sim — variety without diverging the authoritative world |
| Art direction | Full colour (grayscale identity retired 2026-07-24) | A vibrant arena-shooter read; teammate blue / enemy red-orange for instant friend-foe |
| Networking | WebSocket-over-TCP (`ws`), client-server only | Reliable, ordered channel for position/fire; no P2P mesh (10 players = 45 connections — doesn't scale). No UDP, so the server runs on free no-card hosts (was geckos.io UDP-over-WebRTC — swapped 2026-07-24, see PROGRESS round 11) |
| Authority | Server-authoritative movement + hit validation | Client never decides an outcome — prevents aim/damage spoofing via DevTools or packet tampering |
| Auth | Supabase anonymous sign-in | Identity for the duration of a session only, zero PII collected |
| Matchmaking | 6-character room codes, host-created | No matchmaking service needed; direct join by code |
| Hosting | Frontend: Vercel (static). Backend: any persistent Node host (Render/Koyeb free tier, or Fly.io) | Vercel serverless functions time out at 10s and cannot hold a 60Hz authoritative loop — the game server needs a persistent process, so it's split out. WebSocket-over-TCP means no UDP requirement, so free no-card hosts work |
| Game loop | Fixed 60Hz timestep, decoupled from render framerate | Deterministic physics/hit-validation regardless of client FPS |
| Perf | Object pooling for bullets/particles, no per-frame allocation in hot paths | Avoid GC pauses during 10-player firefights |

## Match structure

- Teams of 5v5.
- Up to 12 rounds. 8s buy phase → 60s action phase → 3s round-end intermission (pacing retuned from the original 30s/90s in post-launch round 9).
- Side swap entering round 7; first team to 7 round wins clinches the match early.
- Economy: $800 starting money, +$3000 on a round win. Loadout resets to the free pistol each round; the Kar98 is bought from the armory (B key) during the buy phase.
- Everyone carries a frag grenade ([G]) that recharges each round; a killstreak of 3/5 kills grants tier I/II perks (faster fire, reload, and movement) until you die.

## Non-goals (v1)

- No persistent accounts, stats, or matchmaking rating.
- No voice chat.
- No more than two weapons (the frag grenade is a universal ability, not a third weapon; no per-loadout ability picks).
- No mobile/touch input support.

## Repo layout

```
/client          — Vite + React + TS + R3F frontend (deploys to Vercel)
/server          — WebSocket game server (deploys to Render/Koyeb/Fly.io)
/docs            — SRS, architecture diagrams, per-task specs, run/test guides
/.tooling/agents  — architect / coder / tester subagent definitions
/.tooling/commands — /game-loop orchestration command
TASKS.md         — phase-by-phase build checklist
PROGRESS.md      — running build log + state summary
```

## Full requirements

See [docs/SRS.md](docs/SRS.md) for the formal Software Requirements Specification, including architecture, sequence, and state diagrams.

## How this gets built

Each task in [TASKS.md](TASKS.md) is intentionally coarse. It is broken down into a precise spec (files, interfaces, acceptance criteria) in `docs/specs/task-<id>.md` before implementation, then implemented, then independently verified — see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the process.
