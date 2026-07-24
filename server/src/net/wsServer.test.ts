import { describe, it, expect, vi } from "vitest";
import { sweepHeartbeats, type HeartbeatSocket } from "./wsServer";

function fakeSocket(isAlive: boolean) {
  return { isAlive, ping: vi.fn(), terminate: vi.fn() } satisfies HeartbeatSocket;
}

describe("sweepHeartbeats", () => {
  it("terminates sockets that missed the last pong and pings the live ones", () => {
    const dead = fakeSocket(false);
    const alive = fakeSocket(true);

    sweepHeartbeats([dead, alive]);

    expect(dead.terminate).toHaveBeenCalledTimes(1);
    expect(dead.ping).not.toHaveBeenCalled();
    expect(alive.terminate).not.toHaveBeenCalled();
    expect(alive.ping).toHaveBeenCalledTimes(1);
  });

  it("marks a live socket pending, so a missing pong is caught on the next tick", () => {
    const socket = fakeSocket(true);

    sweepHeartbeats([socket]);
    expect(socket.isAlive).toBe(false); // reset — a pong must flip it back before the next tick
    expect(socket.terminate).not.toHaveBeenCalled();

    // No pong arrived (isAlive still false) → next sweep terminates it.
    sweepHeartbeats([socket]);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("keeps a ponging socket alive across ticks", () => {
    const socket = fakeSocket(true);

    sweepHeartbeats([socket]); // marks pending, pings
    socket.isAlive = true; // simulate the client's pong arriving
    sweepHeartbeats([socket]);

    expect(socket.terminate).not.toHaveBeenCalled();
    expect(socket.ping).toHaveBeenCalledTimes(2);
  });
});
