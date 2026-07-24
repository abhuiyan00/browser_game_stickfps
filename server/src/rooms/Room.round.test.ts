import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetServer } from "../net/transport";
import { Room } from "./Room";
import {
  BUY_PHASE_MS,
  HALFWAY_ROUND,
  ROUND_END_MS,
  ROUND_WIN_MONEY,
  STARTING_MONEY,
  WINS_TO_CLINCH,
} from "../rounds/roundLogic";
import { WIRE_EVENTS } from "../net/messages";

let room: Room | null = null;
let roomStateEmits: unknown[] = [];

function makeFakeIo(): NetServer {
  return {
    room: () => ({
      emit: (eventName: string, data: unknown) => {
        if (eventName === WIRE_EVENTS.roomState) roomStateEmits.push(data);
      },
    }),
  } as unknown as NetServer;
}

function makeRoom(code = "ROUND1"): Room {
  room = new Room(code, makeFakeIo());
  return room;
}

beforeEach(() => {
  vi.useFakeTimers();
  roomStateEmits = [];
});

afterEach(() => {
  room?.stop();
  room = null;
  vi.useRealTimers();
});

describe("Room round loop", () => {
  it("starts round 1 in the buy phase with everyone at starting money", () => {
    const r = makeRoom();
    r.addPlayer("host");
    r.startMatch("host");

    expect(r.roundNumber).toBe(1);
    expect(r.roundPhase).toBe("buy");
    expect(r.players.get("host")?.money).toBe(STARTING_MONEY);
  });

  it("moves from buy to action once the buy-phase timer elapses", () => {
    const r = makeRoom();
    r.addPlayer("host");
    r.startMatch("host");

    vi.advanceTimersByTime(BUY_PHASE_MS + 50);
    expect(r.roundPhase).toBe("action");
    // clients must be told about the transition, not just have it happen server-side silently
    expect(roomStateEmits.some((s) => (s as { roundPhase: string }).roundPhase === "action")).toBe(true);
  });

  it("holds a round-end intermission on elimination (paying immediately), then starts the next round", () => {
    const r = makeRoom();
    r.addPlayer("host"); // team A
    r.addPlayer("guest"); // team B
    r.startMatch("host");

    vi.advanceTimersByTime(BUY_PHASE_MS + 50); // now in action phase
    r.players.get("guest")!.hp = 0; // team B eliminated
    vi.advanceTimersByTime(20); // let the next tick observe it

    // the round is decided but not skipped past — players get a beat to see who won
    expect(r.roundPhase).toBe("round-end");
    expect(r.roundNumber).toBe(1);
    expect(r.lastRoundWinner).toBe("A");
    expect(r.players.get("host")!.money).toBe(STARTING_MONEY + ROUND_WIN_MONEY);

    vi.advanceTimersByTime(ROUND_END_MS + 100);
    expect(r.roundNumber).toBe(2);
    expect(r.roundPhase).toBe("buy");
  });

  it("resets position and HP entering the next round", () => {
    const r = makeRoom();
    r.addPlayer("host");
    r.addPlayer("guest");
    r.startMatch("host");

    vi.advanceTimersByTime(BUY_PHASE_MS + 50);
    const guest = r.players.get("guest")!;
    guest.hp = 0;
    vi.advanceTimersByTime(20);
    expect(guest.hp).toBe(0); // stays dead through the intermission

    vi.advanceTimersByTime(ROUND_END_MS + 100);
    expect(guest.hp).toBe(100);
  });

  it("swaps every player's team entering the round after halfway", () => {
    const r = makeRoom();
    r.addPlayer("host"); // starts team A
    r.addPlayer("guest"); // starts team B
    r.startMatch("host");

    for (let round = 1; round <= HALFWAY_ROUND; round++) {
      vi.advanceTimersByTime(BUY_PHASE_MS + 50);
      r.players.get("guest")!.hp = 0;
      vi.advanceTimersByTime(20 + ROUND_END_MS + 100);
    }

    expect(r.roundNumber).toBe(HALFWAY_ROUND + 1);
    expect(r.players.get("host")!.team).toBe("B");
    expect(r.players.get("guest")!.team).toBe("A");
  });

  it("counts round wins per team and keeps them with the players across the side swap", () => {
    const r = makeRoom();
    r.addPlayer("host"); // team A
    r.addPlayer("guest"); // team B
    r.startMatch("host");

    vi.advanceTimersByTime(BUY_PHASE_MS + 50);
    r.players.get("guest")!.hp = 0;
    vi.advanceTimersByTime(20);
    expect(r.teamWins).toEqual({ A: 1, B: 0 });
    vi.advanceTimersByTime(ROUND_END_MS + 100);

    for (let round = 2; round <= HALFWAY_ROUND; round++) {
      vi.advanceTimersByTime(BUY_PHASE_MS + 50);
      r.players.get("guest")!.hp = 0;
      vi.advanceTimersByTime(20 + ROUND_END_MS + 100);
    }
    // sides swapped entering round 7: the winning group is now labelled B, and their tally moved with them
    expect(r.players.get("host")!.team).toBe("B");
    expect(r.teamWins).toEqual({ A: 0, B: HALFWAY_ROUND });
  });

  it("ends the match early once a team clinches a majority of rounds", () => {
    const r = makeRoom();
    r.addPlayer("host");
    r.addPlayer("guest");
    r.startMatch("host");

    for (let round = 1; round <= WINS_TO_CLINCH; round++) {
      vi.advanceTimersByTime(BUY_PHASE_MS + 50);
      r.players.get("guest")!.hp = 0;
      vi.advanceTimersByTime(20 + ROUND_END_MS + 100);
    }

    expect(r.roundPhase).toBe("match-end");
    const wins = r.teamWins;
    expect(Math.max(wins.A, wins.B)).toBe(WINS_TO_CLINCH);

    // clients get a final, unambiguous state: no stale countdown, tallies included
    const state = r.toRoomState();
    expect(state.phaseEndsAt).toBeNull();
    expect(state.teamWins).toEqual(wins);
  });
});
