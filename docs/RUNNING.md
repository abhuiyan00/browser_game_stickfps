# Running Stickfps locally

## Prerequisites

- Node.js 22+ and npm.
- (Optional, for auth) A Supabase project with anonymous sign-in enabled — the app runs without
  one, but auth will report `not-configured` and you won't be able to get past the lobby's
  create/join step, since a room's own gameplay doesn't depend on Supabase but the Lobby's sign-in
  gate does. Two ways to get one:
  - **Local, no account needed** (recommended for development) — [SUPABASE.md](SUPABASE.md) walks
    through running the whole Supabase stack (Postgres/Auth/Studio) in Docker via the Supabase CLI.
  - **Cloud project** — see [DEPLOYMENT.md](DEPLOYMENT.md) §3.
- (Optional) Docker Desktop, if you'd rather run the server in a container than via `npm run dev` —
  see [DOCKER.md](DOCKER.md).

## 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

(This is a two-package repo, not an npm workspace — install each side separately.)

## 2. Configure environment variables

```bash
cd server && cp .env.example .env
cd ../client && cp .env.example .env
```

`server/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `9090` | HTTP port — serves `/healthz` and the WebSocket game transport on `/ws` |
| `CORS_ORIGIN` | `http://localhost:5173` | Must match the client's dev server origin (the server checks the WebSocket handshake's Origin header) |

`client/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost` | Game server host |
| `VITE_SERVER_PORT` | `9090` | Game server port |
| `VITE_SUPABASE_URL` | _(empty)_ | From your Supabase project — leave empty to run with auth in `not-configured` state |
| `VITE_SUPABASE_ANON_KEY` | _(empty)_ | Same |

## 3. Run both dev servers

In two terminals:

```bash
cd server && npm run dev    # tsx watch — restarts on file change
cd client && npm run dev    # vite — HMR
```

Open **two separate browser windows** (or one normal + one incognito, so they get distinct
sessions) at `http://localhost:5173`:

1. In the first window: wait for auth to settle, click **Create Room**, note the 6-character code.
2. In the second window: enter that code and click **Join Room**.
3. Each player is auto-assigned a unique color name (Crimson, Azure, Emerald, …) — no manual
   naming step. The roster shows whoever's joined so far; there's no minimum to start, so 1v1,
   2v3, or anything up to 5v5 all work — the host just clicks **Start Match** whenever ready.
4. Click the canvas to lock the pointer. WASD to move, mouse to look, Space to jump, **C** or
   **Left-Ctrl** to crouch (crouching at speed slides — jump out of the slide to keep the boost),
   left-click to fire, right-click to zoom (Kar98 only), R to reload, **1**/**2** to switch
   Revolver/Kar98 (each keeps its own ammo — switching and switching back doesn't reset it).
   **B** during the buy phase opens the armory (the Kar98 costs $2400; your loadout resets to the
   free Revolver every round). Rounds run an **8s buy phase → 60s action phase**.
5. Press **Esc** or click the on-screen **Pause** button (top-right) to open the pause menu —
   Resume, a mouse-sensitivity slider (persisted across sessions), and Leave Match. This only pauses
   locally; the match keeps running server-side for everyone else, same as a normal tactical-FPS
   Esc menu.

## Troubleshooting

- **Auth stuck on "signing-in"**: check `client/.env`'s Supabase values are correct and that
  Anonymous Sign-Ins is enabled in your Supabase project's Auth providers.
- **"net: error" in the lobby**: the client can't reach the server — check `VITE_SERVER_URL`/`PORT`
  match what `server` actually printed on startup, and that nothing else is bound to that port.
- **Stuck at "Room not found or full"**: room codes are case-insensitive but must be exactly 6
  characters from the server's alphabet (no `0`, `O`, `1`, `I` — see `server/src/rooms/roomCode.ts`).
- **Movement feels laggy/rubber-bandy**: expected on a bad connection — v1's reconciliation blends
  toward the server's position rather than replaying inputs (see
  [docs/specs/task-4.1.md](specs/task-4.1.md) Open Questions).

For the full test suite and manual QA checklist, see [TESTING.md](TESTING.md). For deploying to
Vercel/Fly.io, see [DEPLOYMENT.md](DEPLOYMENT.md).
