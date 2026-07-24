# Stickfps — client

Vite + React + TypeScript + React Three Fiber frontend. Part of the [stickfps](../README.md) monorepo — see the root README for the full run/test guide and [docs/RUNNING.md](../docs/RUNNING.md) / [docs/TESTING.md](../docs/TESTING.md).

## Quick reference

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to enable auth
npm run dev             # http://localhost:5173
npm test                 # vitest
npm run build            # tsc -b && vite build
npm run typecheck
npm run lint
```

Source layout: `src/game` (3D scene, movement, weapons, grenade/effects, map themes, pooling), `src/net` (WebSocket client, prediction/reconciliation, Supabase auth), `src/audio` (Web Audio synthesis), `src/ui` (Lobby, HUD).
