# Spec — Task 8.1: Deploy

## Scope

Deployment configuration and documentation for both halves. This task produces config files and a runbook — it does not itself run `vercel --prod` or `flyctl launch`/`flyctl deploy`, since those create real, billable cloud resources under the user's own accounts and are not something to execute without the user present to authorize and hold credentials for.

## Files

- `server/fly.toml` — Fly.io app config: a `tcp`/`http` service for the signaling/health-check port (9090) and a separate `udp` service for the Geckos WebRTC data channel (fixed at 10000, matching the `GECKOS_UDP_PORT` pinned in Phase 8's networking fix).
- `server/Dockerfile` — multi-stage build (compile TS in a build stage, run only `dist/` + prod deps in the runtime stage).
- `server/.dockerignore` — excludes `node_modules`, `dist`, test files from the build context.
- `docs/DEPLOYMENT.md` — step-by-step runbook: Fly.io app creation, secrets/env vars, `flyctl deploy`; Vercel project creation (root directory `client`, env vars), then wiring `CORS_ORIGIN` on the server to the resulting Vercel domain.

## Interfaces

No code interfaces — this task is entirely configuration/documentation. It depends on Phase 4/7's `GECKOS_UDP_PORT` fix (a fixed, pinnable UDP port is what makes a static `fly.toml` UDP service possible at all).

## Constraints carried over

- **C5**: `fly.toml` runs the compiled server as a long-lived process (`node dist/index.js`), never as a Vercel serverless function.
- CORS must allow exactly the deployed Vercel origin — `docs/DEPLOYMENT.md` calls this out as a manual post-deploy step (the Vercel domain isn't known until after the first Vercel deploy).

## Acceptance criteria

1. `docker build` against `server/Dockerfile` succeeds locally (build-only check — this repo does not push or run the image against a real registry/host).
2. `fly.toml` includes both a TCP/HTTP service on 9090 and a UDP service on 10000.
3. `docs/DEPLOYMENT.md` lists every environment variable each side needs, in the order they must be set (server URL needed by client; CORS origin needed by server, known only after client deploys first).
4. No deployment command was actually executed against a live Fly.io or Vercel account by this task.

## Open questions

- Actual live deployment (verifying the app runs correctly on Fly.io's network, WebRTC/UDP actually traverses whatever NAT/firewall the players are behind, etc.) requires a human with Fly.io/Vercel/Supabase accounts to run the runbook and iterate — not something verifiable from this environment.
