# Spec — Task 1.1: Scaffold

## Scope

Initialize both deployable projects and their dependency sets. No gameplay logic yet — this task only produces a buildable, empty shell for both client and server.

## Files

- `client/` — Vite + React + TS app (`npm create vite@latest client -- --template react-ts`).
- `client/package.json` — deps: three, @react-three/fiber, @react-three/drei, @geckos.io/client, @supabase/supabase-js, uuid; devDeps: @types/three, @types/uuid, vitest, @testing-library/react, jsdom.
- `client/src/game/`, `client/src/net/`, `client/src/ui/` — folder structure for Phase 2+.
- `server/package.json` — deps: @geckos.io/server, express, cors, dotenv; devDeps: typescript, tsx, @types/node, @types/express, @types/cors, vitest.
- `server/tsconfig.json` — Node/CommonJS-friendly TS config.
- `server/src/index.ts` — entrypoint placeholder (Phase 4 fills in the real Geckos.io wiring).

## Interfaces

None yet — Phase 2 (client) and Phase 4 (server) define the first real interfaces.

## Constraints carried over

- C5: client and server are separate deployables (Vercel / Fly.io) from day one — no shared build step assumed.

## Acceptance criteria

1. `cd client && npm run build` succeeds (tsc -b && vite build).
2. `cd server && npm run build` succeeds (tsc).
3. `client/src/{game,net,ui}` exist.
4. No gameplay code present (this task is scaffold-only).

## Open questions

None.
