import { afterEach, describe, expect, it } from "vitest";
import type { NetChannel, NetServer } from "../net/transport";
import { RoomManager } from "./RoomManager";

const fakeIo = { room: () => ({ emit: () => {} }) } as unknown as NetServer;

function makeChannel(id: string): NetChannel {
  return { id, join: () => {} } as unknown as NetChannel;
}

let manager: RoomManager | null = null;

afterEach(() => {
  // stop any room loops still running so vitest can exit cleanly
  if (manager) {
    for (const channelId of ["c1", "c2", "c3"]) {
      manager.handleDisconnect(makeChannel(channelId));
    }
  }
  manager = null;
});

describe("RoomManager", () => {
  it("creating a second room removes the player from the first (no zombie player keeping it alive)", () => {
    manager = new RoomManager(fakeIo);
    const channel = makeChannel("c1");

    const first = manager.createRoom(channel)!;
    expect(first.players.size).toBe(1);

    const second = manager.createRoom(channel)!;
    expect(second.code).not.toBe(first.code);
    expect(second.players.size).toBe(1);
    // the first room lost its only player, so it must be gone, not looping forever
    expect(first.players.size).toBe(0);
    expect(manager.joinRoom(makeChannel("c2"), first.code)).toBeNull();
  });

  it("joining another room moves the player instead of duplicating them", () => {
    manager = new RoomManager(fakeIo);
    const host = makeChannel("c1");
    const hopper = makeChannel("c2");

    const roomA = manager.createRoom(host)!;
    const roomB = manager.createRoom(makeChannel("c3"))!;
    manager.joinRoom(hopper, roomA.code);
    expect(roomA.players.size).toBe(2);

    manager.joinRoom(hopper, roomB.code);
    expect(roomA.players.size).toBe(1); // hopper is gone from A
    expect(roomB.players.size).toBe(2); // and present in B exactly once
    expect(manager.getRoomForChannel(hopper)?.code).toBe(roomB.code);
  });

  it("disconnect removes the player and deletes an emptied room", () => {
    manager = new RoomManager(fakeIo);
    const channel = makeChannel("c1");
    const room = manager.createRoom(channel)!;

    manager.handleDisconnect(channel);
    expect(room.players.size).toBe(0);
    expect(manager.joinRoom(makeChannel("c2"), room.code)).toBeNull();
  });
});
