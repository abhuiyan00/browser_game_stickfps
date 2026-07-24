# Local Supabase (via CLI + Docker)

Stickfps only ever uses Supabase for one thing: anonymous auth (see
[SRS §NFR-4](SRS.md), zero PII). You don't need a cloud account to develop against it — the
Supabase CLI runs the same stack (Postgres, GoTrue auth, Studio, Kong) locally in Docker
containers, and it works with `enable_anonymous_sign_ins` exactly like a hosted project does.

## Prerequisites

Docker Desktop running (see [DOCKER.md](DOCKER.md) §1 to verify).

## 1. Already done in this repo

`supabase/config.toml` already exists with two things set:
- `enable_anonymous_sign_ins = true` under `[auth]` (defaults to `false`).
- `enabled = false` under `[analytics]`. On Windows, the analytics container (Logflare) fails its
  health check unless the Docker daemon is separately exposed over TCP — a Docker Desktop setting
  this repo doesn't require you to change. Analytics isn't used by anything in this app, so it's
  just switched off rather than asking you to reconfigure Docker Desktop. If `supabase start` ever
  reports `container is not ready: unhealthy` for `supabase_analytics_...` or `_vector_...`, this
  is why — confirm both are still disabled in `config.toml`.

If you ever regenerate `config.toml` from scratch (`npx supabase init`), re-apply both settings.

## 2. Start the local stack

From the repo root:

```bash
npx supabase start
```

First run pulls several images (Postgres, GoTrue, PostgREST, Studio, Kong, Realtime, Storage,
imgproxy) — this can take a few minutes depending on your connection. Subsequent `supabase start`
runs reuse the pulled images and start in seconds.

When it finishes it prints something like:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGc....
service_role key: eyJhbGc....
```

A line like `Stopped services: [supabase_imgproxy_... supabase_pooler_...]` right after is normal —
this app doesn't use image transforms or the connection pooler, so the CLI stops those two rather
than leaving unused containers running. Only `db`, `auth`, `rest`, `kong`/`gateway`, and `studio`
need to be up for anonymous auth to work.

## 3. Wire it into the client

Copy the **API URL** and **anon key** into `client/.env`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<the anon key supabase start printed>
```

Restart `npm run dev` in `client/` if it was already running (Vite only reads `.env` at startup).

## 4. Verify

Open the app — the lobby's debug line should read `auth: signed-in` within a second or two of
load, with no manual sign-in step (this is anonymous auth; there's no login form). If it's stuck
on `signing-in` or shows `error`, check:

```bash
npx supabase status   # confirms the stack is up and re-prints the URLs/keys above
```

## 5. Inspect it (optional)

**Studio** (`http://127.0.0.1:54323`) is a full Postgres/Auth admin UI — under Authentication →
Users you'll see one row appear per anonymous session created by a client that signed in.

## 6. Stop it

```bash
npx supabase stop          # keeps the DB volume, fast to restart later
npx supabase stop --no-backup   # also wipes local data
```

## Moving to a real cloud project later

Nothing else about the app changes — swap `client/.env`'s two values for a hosted project's
(Project Settings → API), and make sure **Authentication → Providers → Anonymous** is enabled
there too (it's off by default on new projects, unlike this repo's local config). See
[DEPLOYMENT.md](DEPLOYMENT.md) §3.
