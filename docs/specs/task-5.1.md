# Spec — Task 5.1: Auth & Lobby

## Scope

Anonymous Supabase sign-in on load, and a real Lobby UI (Create/Join Room, 5v5 roster, host-only Start) that replaces Phase 4's `NetDebugPanel` dev harness. Starting a match flips the room's `phase` from `"waiting"` to `"active"`, which is the hook point Phase 6's round manager takes over — this task does not implement round/economy logic itself.

## Files

- `client/src/net/supabaseClient.ts` — Supabase client instance (from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) + `signInAnonymously()`. Returns a clear "not configured" state rather than throwing when env vars are absent, so the app degrades gracefully without a Supabase project.
- `client/src/net/useAuth.ts` — signs in anonymously on mount; exposes `status` (`idle | signing-in | signed-in | error | not-configured`), `userId`, `error`.
- `client/src/ui/Lobby.tsx` — replaces `NetDebugPanel`: shows auth/net status, Create Room / Join Room (code entry) before a room exists, and once in a room shows the Team A / Team B roster with a host badge and a Start button visible only to the host.
- `client/src/net/useNetwork.ts` — add `startMatch()`, calling a new `sendStartMatch` wire call.
- `client/src/net/geckosClient.ts` — add `sendStartMatch(channel)`.
- `server/src/rooms/Room.ts` — add `startMatch(requesterId): boolean`, host-only, only valid from `"waiting"` phase, transitions to `"active"`.
- `server/src/net/geckosServer.ts` — wire `WIRE_EVENTS.startMatch`, broadcasting the updated `RoomState` on success.
- Delete `client/src/ui/NetDebugPanel.tsx` — fully superseded by `Lobby.tsx`.
- `App.tsx` — renders `Lobby` while `roomState` is absent or `phase !== "active"`; renders the game `Canvas` once `phase === "active"`.

## Interfaces

```ts
type AuthStatus = "idle" | "signing-in" | "signed-in" | "error" | "not-configured";
function signInAnonymously(): Promise<Session | null>;
// Room.ts
startMatch(requesterId: string): boolean; // false if not host or not in "waiting" phase
```

Wire event added: `start-match` (client → server, no payload).

## Constraints carried over

- **NFR-4 (zero PII)**: anonymous sign-in only — no email/password collection, no profile fields.
- **FR-5.4**: the Start button must be conditionally rendered (`roomState.hostId === selfId`), not just disabled — a non-host should not see a button that implies they can act on it.
- Host-only enforcement lives server-side (`Room.startMatch` checks `requesterId`), matching C1's spirit: the client's hiding of the button is UX only, not the actual authority boundary.

## Acceptance criteria

1. `cd client && npm run build && npm test` succeed.
2. On load, without Supabase env vars configured, the app shows an explicit "not configured" auth state rather than crashing or hanging on "signing in...".
3. `Lobby.tsx` shows Create/Join before a room exists, and a live Team A/Team B roster with a host indicator after joining.
4. A non-host player never sees a Start button; the host does.
5. Clicking Start as a non-host (e.g. via a forged `start-match` emit) has no effect server-side — `Room.startMatch` rejects it.
6. `NetDebugPanel.tsx` no longer exists in the tree; nothing imports it.

## Open questions

- This task cannot be verified end-to-end against a real Supabase project — no project URL/anon key was provided. The code path is implemented per Supabase's documented anonymous-auth API and degrades to an explicit "not configured" state without one; a human should verify against a real project before relying on it in production.
