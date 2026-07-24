# Running the server in Docker (local)

Only `/server` is containerized. `/client` is a static Vite/React app — for local dev keep
running it with `npm run dev` (see [RUNNING.md](RUNNING.md)); Docker is for validating the same
image that will ship to Fly.io (`server/Dockerfile`), not for day-to-day client work.

## 1. Prerequisites

Docker Desktop must be **running** (not just installed) before any `docker` command will work.

```bash
docker version   # should print both a Client and a Server section
```

If the second half errors with something like "cannot connect to the Docker daemon", open Docker
Desktop and wait for it to say "Engine running" first.

## 2. Build the image

From the repo root:

```bash
docker build -t stickfps-server ./server
```

This is the same multi-stage build (`server/Dockerfile`) Fly.io uses: installs deps, runs
`npm run build` (tsc → `dist/`), then a second slim stage with only production deps + the compiled
output. A clean build takes ~30-60s depending on npm cache state.

## 3. Run the container

```bash
docker run --rm -it \
  -p 9090:9090 \
  -e PORT=9090 \
  -e CORS_ORIGIN=http://localhost:5173 \
  --name stickfps-server \
  stickfps-server
```

- `-p 9090:9090` — HTTP: serves `/healthz` and the WebSocket transport on `/ws`. That's the only
  port needed now (the transport is WebSocket-over-TCP — no UDP, unlike the old geckos.io setup).
- `CORS_ORIGIN` must match wherever the client is being served from — `http://localhost:5173` for
  the Vite dev server.

You should see the same startup log line as `npm run dev` prints:

```
stickfps server listening on :9090 (WebSocket /ws, CORS origin: http://localhost:5173)
```

## 4. Verify it's alive

```bash
curl http://localhost:9090/healthz
# {"status":"ok"}
```

## 5. Point the client at it

Containerized or not, the server listens on the same ports either way, so `client/.env` doesn't
need to change:

```
VITE_SERVER_URL=http://localhost
VITE_SERVER_PORT=9090
```

Run the client normally (`cd client && npm run dev`) and open `http://localhost:5173` in two
windows to test a match — same as the non-Docker flow in [RUNNING.md](RUNNING.md), just with the
server half running inside a container instead of `tsx watch`.

## 6. Stop / clean up

```bash
docker stop stickfps-server   # only needed if you didn't use --rm and Ctrl+C
docker image rm stickfps-server
```

## Why this matters before deploying

Fly.io runs exactly this Dockerfile (`flyctl deploy` builds it remotely from the same file). If it
builds and passes the checks above locally, you've already caught most deploy-time surprises (a
missing dependency, a broken `npm run build`, a wrong `EXPOSE`) before spending a deploy cycle on
them. See [DEPLOYMENT.md](DEPLOYMENT.md) for the actual `flyctl` steps once this works locally.
