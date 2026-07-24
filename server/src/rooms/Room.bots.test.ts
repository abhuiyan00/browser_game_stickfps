import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetServer } from "../net/transport";
import { Room } from "./Room";

const fakeIo = { room: () => ({ emit: () => {} }) } as unknown as NetServer;

let room: Room | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  room?.stop();
  room = null;
  vi.useRealTimers();
});

describe("Room bot fill", () => {
  it("lets the host fill both teams up to the cap", () => {
    room = new Room("BOTSAA", fakeIo);
    room.addPlayer("host");
    const added = room.fillWithBots("host");
    expect(added).toBe(9);
    expect(room.players.size).toBe(10);
    // host stays the human, not a bot
    expect(room.hostId).toBe("host");
  });

  it("rejects a fill requested by anyone but the host", () => {
    room = new Room("BOTSAB", fakeIo);
    room.addPlayer("host");
    expect(room.fillWithBots("intruder")).toBe(0);
    expect(room.players.size).toBe(1);
  });

  it("won't add bots once the match is active", () => {
    room = new Room("BOTSAC", fakeIo);
    room.addPlayer("host");
    room.startMatch("host");
    expect(room.fillWithBots("host")).toBe(0);
  });

  it("balances bots across the two teams", () => {
    room = new Room("BOTSAD", fakeIo);
    room.addPlayer("host"); // team A
    room.fillWithBots("host");
    let a = 0;
    let b = 0;
    for (const p of room.players.values()) {
      if (p.team === "A") a++;
      else b++;
    }
    expect(a).toBe(5);
    expect(b).toBe(5);
  });

  it("drops every bot (and stops) when the last human leaves", () => {
    room = new Room("BOTSAE", fakeIo);
    room.addPlayer("host");
    room.fillWithBots("host");
    expect(room.players.size).toBe(10);
    room.removePlayer("host");
    expect(room.players.size).toBe(0);
  });
});
