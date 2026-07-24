# Deployment Guide

Frontend and backend deploy separately: the backend is a long-lived 60Hz process (Vercel's
serverless functions time out at 10s and can't hold that loop — C5, see [SRS §2.4](SRS.md#24-constraints)),
the frontend is a static site. **Deploy the backend first**, since the frontend needs its URL.

The transport is **plain WebSocket-over-TCP** (`server/src/net/wsServer.ts`) — no UDP. That means
any host that can run a persistent Node process and hold a WebSocket works, including **free tiers
that don't require a credit card** (Render, Koyeb). This is the recommended path below. Fly.io still
works too and is kept as an alternative at the end.

> No deploy command has been run against a live account from this environment — you run them
> yourself with your own accounts. The server *has* been smoke-tested locally over a real WebSocket
> (connect → create room → room-state broadcast).

## 1. Backend — Render (free, no card)

Prerequisites: a [Render](https://render.com) account (sign in with GitHub). No card required for the
free instance type.

1. Push this repo to GitHub (see the root README / the guide below if you haven't).
2. Render dashboard → **New → Web Service** → connect your GitHub repo.
3. Configure:
   | Field | Value |
   |---|---|
   | **Root Directory** | `server` (this is a monorepo — the server isn't at the repo root) |
   | **Runtime** | Node |
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `npm start` |
   | **Instance Type** | Free |
   | **Health Check Path** | `/healthz` |
4. Create the service. Render assigns a `PORT` env var automatically and the server binds to it
   (it reads `process.env.PORT`). Wait for the first build to go live.
5. Note the URL: `https://<your-service>.onrender.com` — you'll feed it to the frontend in step 2.

**CORS** — the server needs to know the frontend's domain (you'll have it after step 2). Then in the
Render service → **Environment** → add:

| Key | Value |
|---|---|
| `CORS_ORIGIN` | `https://your-app.vercel.app` (exact, no trailing slash) |

Saving an env var redeploys the service.

> ⚠️ **Free-tier sleep.** Render free web services spin down after ~15 min idle; the next request
> cold-starts them (~30–60s). The first player to connect after a quiet spell waits for that spin-up,
> then it's fine. Acceptable for a hobby game; upgrade the instance if you want it always-warm.

## 2. Frontend — Vercel (free, no card)

Prerequisites: a [Vercel](https://vercel.com) account (sign in with GitHub).

1. Vercel → **Add New → Project** → import your GitHub repo.
2. **Root Directory: `client`** (monorepo — the client isn't at the repo root).
3. Framework preset: Vite (auto-detected). Build `npm run build`, output `dist` (auto).
4. Environment variables (Project Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `VITE_SERVER_URL` | `https://<your-service>.onrender.com` (from step 1) |
   | `VITE_SERVER_PORT` | *leave unset* (443 is implied; the client derives `wss://…/ws`) |
   | `VITE_SUPABASE_URL` | from your Supabase project (step 3) |
   | `VITE_SUPABASE_ANON_KEY` | from your Supabase project (step 3) |

5. Deploy. Copy the production domain (`https://<something>.vercel.app`) — that's the value for the
   server's `CORS_ORIGIN` in step 1.

> Vite inlines `VITE_*` at **build** time. If you change `VITE_SERVER_URL` later, redeploy.

## 3. Supabase (anonymous auth) — free, no card

1. Create a project at [supabase.com](https://supabase.com).
2. Authentication → Providers → enable **Anonymous Sign-Ins** (off by default on new projects).
3. Project Settings → API gives you the URL and anon key for the client env vars above.

No tables, no email templates, no other config — the app collects no PII (NFR-4) and only uses
anonymous sessions. For local development you don't need any of this — see [docs/SUPABASE.md](SUPABASE.md).

## 4. Verifying the deploy

- `curl https://<your-service>.onrender.com/healthz` → `{"status":"ok"}` (may take ~30s if asleep).
- Open the Vercel URL in two separate browser profiles/tabs, sign in (anonymous, automatic), create
  a room in one, join with the code in the other, confirm both see each other in the roster, start,
  and play (throw a grenade with `[G]`).
- If sign-in works but players never connect: open devtools → Network → WS, confirm the WebSocket to
  `wss://<your-service>.onrender.com/ws` opens (status 101). If it 403s, `CORS_ORIGIN` doesn't match
  the Vercel domain exactly. If it never connects at all, the server is likely still cold-starting.

## Alternative backends

- **Koyeb** (also free, typically no card): New Service → GitHub repo → work directory `server`,
  build `npm install && npm run build`, run `npm start`, health check `/healthz`, set `CORS_ORIGIN`.
  Same shape as Render.
- **Fly.io** (needs a card): `server/fly.toml` + `server/Dockerfile` are ready. `cd server`,
  `flyctl launch --no-deploy` (pick a unique `app` name), `flyctl deploy`, then
  `flyctl secrets set CORS_ORIGIN=https://your-app.vercel.app`. The old UDP service was removed from
  `fly.toml` — the WebSocket transport only needs the TCP/HTTP service.

## Notes / known gaps

- `MAX_ORIGIN_DRIFT`, round timings, and economy numbers are tuned for LAN-like conditions in dev —
  revisit once you're testing across real internet latency (see [security-audit-phase7.md](security-audit-phase7.md)).
- The Docker image (`server/Dockerfile`) builds and runs locally (see [docs/DOCKER.md](DOCKER.md));
  re-run `docker build` after any server dependency change. Render/Koyeb build from source, not the
  Dockerfile, so the Dockerfile only matters for the Fly.io path (or self-hosting).
- Prefer WebSocket-over-TCP's simplicity here; the trade-off vs the old UDP transport is that a bad
  connection can head-of-line-block briefly. Unnoticeable at hobby scale.
