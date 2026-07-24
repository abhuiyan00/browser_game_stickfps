# Stickfps — server

Node.js WebSocket game server (`ws`). Server-authoritative movement, hit validation, rounds, and economy — see [docs/SRS.md](../docs/SRS.md) for why. Part of the [stickfps](../README.md) monorepo.

## Quick reference

```bash
npm install
cp .env.example .env
npm run dev          # tsx watch, http://localhost:9090
npm test              # vitest
npm run build          # tsc -p tsconfig.json -> dist/
npm run typecheck
npm start               # node dist/index.js (after building)
```

Source layout: `src/net` (WebSocket server + transport interface, wire message types, input validation), `src/rooms` (room manager, per-room authoritative state, AI `BotBrain`), `src/sim` (fixed-timestep movement), `src/combat` (hit validation, weapon rules, frag-grenade sim, killstreak perks), `src/rounds` (round/economy logic).

Deploying this to Fly.io: see [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
