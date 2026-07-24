# Spec — Task 6.1: Game Loop Logic (rounds & economy)

## Scope

Server-authoritative round loop: buy phase → action phase → round end → (side swap at halfway) → next round, up to a match cap, plus per-round economy payout. Position/HP reset each round. This task does not add a buy-phase shop UI or a bomb/objective system — v1's win condition is team elimination only (see Open Questions).

## Files

- `server/src/rounds/roundLogic.ts` — pure phase-transition functions and constants (`MAX_ROUNDS`, `HALFWAY_ROUND`, `BUY_PHASE_MS`, `ACTION_PHASE_MS`, `STARTING_MONEY`, `ROUND_WIN_MONEY`): `startFirstRound`, `beginActionPhase`, `beginNextRound`, `isPhaseElapsed`, `isSideSwapRound`. No Room/network dependency — unit-testable with injected timestamps.
- `server/src/rounds/roundLogic.test.ts` — vitest coverage of every transition.
- `server/src/rooms/Room.ts` — extends `PlayerRecord` with `money: number`; adds `roundNumber`, `roundPhase`, `phaseEndsAt` fields; `startMatch` seeds the first round and resets positions/money; `tick()` drives `tickRound()` each server tick (elimination check during `action`, phase-timer check every phase, side-swap + position/HP reset entering a new round, economy payout to the winning team).
- `server/src/net/messages.ts` / `client/src/net/messages.ts` — `RoomState` gains `roundPhase: "buy" | "action" | "match-end"`; `RoomPlayerSummary` gains `money: number`.
- `client/src/ui/HUD.tsx` — adds round number, round phase, a countdown to `phaseEndsAt`, and the local player's money.

## Interfaces

```ts
type RoundPhase = "buy" | "action" | "match-end";
interface RoundState { roundNumber: number; phase: RoundPhase; phaseEndsAt: number; }
function startFirstRound(now: number): RoundState;
function beginActionPhase(state: RoundState, now: number): RoundState;
function beginNextRound(state: RoundState, now: number): RoundState; // returns phase "match-end" past MAX_ROUNDS
function isPhaseElapsed(state: RoundState, now: number): boolean;
function isSideSwapRound(roundNumber: number): boolean; // true for the round right after the halfway point
```

## Constraints carried over

- All round/economy state transitions happen server-side in `Room.ts` only; the client only ever renders what `RoomState` reports (C1's spirit extended to game-loop state, not just movement/hits).
- Fixed-tick-driven (`tickRound()` runs from the existing 60Hz `tick()`), not a separate timer, so round logic can't drift independently of the authoritative sim (C3).

## Numbers used (flagged as provisional in PROJECT.md/TASKS.md 6.1 — confirm before shipping)

- `MAX_ROUNDS = 12`, `HALFWAY_ROUND = 6` (side swap happens entering round 7).
- `BUY_PHASE_MS = 30_000`, `ACTION_PHASE_MS = 90_000`.
- `STARTING_MONEY = 800`, `ROUND_WIN_MONEY = 3000`, paid only to the winning team; the losing team gets no consolation payout in v1 (TASKS.md gives no loss-bonus figure to implement against).

## Acceptance criteria

1. `cd server && npm test && npm run build` succeed, including new `roundLogic.test.ts` coverage of buy→action, action→next-round, elimination mid-action, side swap at the correct round, and match-end past `MAX_ROUNDS`.
2. `cd client && npm test && npm run build` succeed with the extended `RoomState`/HUD.
3. Starting a match seeds round 1 in the `buy` phase with every player at `STARTING_MONEY`.
4. A full team elimination during `action` ends the round immediately (does not wait for the timer) and pays the surviving team.
5. Entering the round after `HALFWAY_ROUND` swaps every player's team.

## Open questions

- **Win condition simplification**: v1 has no bomb/objective/round-timer-favors-defender rule — only full team elimination ends a round early; an action-phase timeout with survivors on both teams is a no-payout draw. A real ruleset (per TASKS.md's own "confirm against your ruleset" note) will likely need an objective system — flagged as a follow-up, not blocking this task.
- Dead players are excluded from being valid raycast targets (Phase 4) but are not otherwise frozen/hidden mid-round (no spectator mode) — acceptable since position/HP resets every round, but noted for anyone testing mid-round death behavior.
