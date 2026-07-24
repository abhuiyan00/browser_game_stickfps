import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import { randomUUID } from "crypto";
import { RoomManager } from "../rooms/RoomManager";
import { WIRE_EVENTS } from "./messages";
import type { NetChannel, NetRoomEmitter, NetServer } from "./transport";
import {
  isValidBuyRequest,
  isValidFireRequest,
  isValidGrenadeThrowRequest,
  isValidPlayerInput,
  isValidReloadRequest,
  isValidRoomCodePayload,
  isValidSwitchWeaponRequest,
} from "./validation";

export interface AttachWsOptions {
  /** Allowed browser Origin, or "*" for any. WebSockets aren't subject to CORS, so we check the Origin header ourselves. */
  corsOrigin: string;
  /** Heartbeat ping interval (ms). A socket silent (no pong) for a full interval is terminated. Defaults to 30s. */
  heartbeatMs?: number;
}

export interface AttachedWs {
  wss: WebSocketServer;
  roomManager: RoomManager;
}

/** Every wire message is a compact `{ e: event, d: data }` JSON frame (short keys to trim the 60Hz stream). */
interface Frame {
  e: string;
  d?: unknown;
}

const MAX_PAYLOAD_BYTES = 64 * 1024; // generous for our small JSON frames; caps abusive payloads
const HEARTBEAT_MS = 30_000; // ping every 30s; a socket silent for a full interval is presumed dead

function send(ws: WebSocket, event: string, data?: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ e: event, d: data } satisfies Frame));
}

/**
 * Tracks room membership at the transport layer so `channel.room.emit` and
 * `io.room(code).emit` can fan out to every socket in a room. Mirrors the tiny
 * slice of geckos' room feature the game used (each connection is in at most one
 * room here).
 */
class RoomHub {
  private rooms = new Map<string, Set<WsChannel>>();

  join(channel: WsChannel, code: string): void {
    if (channel.roomCode) this.leave(channel);
    channel.roomCode = code;
    let set = this.rooms.get(code);
    if (!set) {
      set = new Set();
      this.rooms.set(code, set);
    }
    set.add(channel);
  }

  leave(channel: WsChannel): void {
    if (!channel.roomCode) return;
    const set = this.rooms.get(channel.roomCode);
    if (set) {
      set.delete(channel);
      if (set.size === 0) this.rooms.delete(channel.roomCode);
    }
    channel.roomCode = null;
  }

  emit(code: string | null, event: string, data?: unknown): void {
    if (!code) return;
    const set = this.rooms.get(code);
    if (!set) return;
    for (const channel of set) channel.emit(event, data);
  }
}

class WsChannel implements NetChannel {
  readonly id: string;
  roomCode: string | null = null;
  private handlers = new Map<string, (data: unknown) => void>();
  private disconnectHandlers: Array<() => void> = [];

  constructor(
    private ws: WebSocket,
    private hub: RoomHub,
  ) {
    this.id = randomUUID();
  }

  on(event: string, handler: (data: unknown) => void): void {
    this.handlers.set(event, handler);
  }

  /** Dispatch an inbound frame to its registered handler (no-op if none). */
  dispatch(event: string, data: unknown): void {
    this.handlers.get(event)?.(data);
  }

  emit(event: string, data?: unknown): void {
    send(this.ws, event, data);
  }

  get room(): NetRoomEmitter {
    return { emit: (event, data) => this.hub.emit(this.roomCode, event, data) };
  }

  join(roomCode: string): void {
    this.hub.join(this, roomCode);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  fireDisconnect(): void {
    for (const handler of this.disconnectHandlers) handler();
  }
}

/** Wires every inbound event for one connection — the transport-neutral half of the old geckos handler. */
function registerHandlers(channel: WsChannel, roomManager: RoomManager): void {
  channel.on(WIRE_EVENTS.createRoom, () => {
    const room = roomManager.createRoom(channel);
    if (!room) {
      channel.emit(WIRE_EVENTS.netError, { message: "Could not create room" });
      return;
    }
    channel.room.emit(WIRE_EVENTS.roomState, room.toRoomState());
  });

  channel.on(WIRE_EVENTS.joinRoom, (data) => {
    if (!isValidRoomCodePayload(data)) {
      channel.emit(WIRE_EVENTS.netError, { message: "Invalid room code" });
      return;
    }
    const room = roomManager.joinRoom(channel, data.code);
    if (!room) {
      channel.emit(WIRE_EVENTS.netError, { message: "Room not found or full" });
      return;
    }
    channel.room.emit(WIRE_EVENTS.roomState, room.toRoomState());
  });

  channel.on(WIRE_EVENTS.playerInput, (data) => {
    if (!isValidPlayerInput(data)) return;
    roomManager.getRoomForChannel(channel)?.setInput(channel.id, data);
  });

  channel.on(WIRE_EVENTS.fireRequest, (data) => {
    if (!isValidFireRequest(data)) return;
    const room = roomManager.getRoomForChannel(channel);
    if (!room) return;

    const outcome = room.resolveFireRequest(channel.id, data);
    if (outcome.type === "hit") {
      channel.room.emit(WIRE_EVENTS.hitResult, outcome.result);
    } else if (outcome.type === "ack") {
      channel.emit(WIRE_EVENTS.fireAck, outcome.result);
    }
  });

  channel.on(WIRE_EVENTS.reloadRequest, (data) => {
    if (!isValidReloadRequest(data)) return;
    roomManager.getRoomForChannel(channel)?.reloadWeapon(channel.id, data.weaponId);
  });

  channel.on(WIRE_EVENTS.switchWeapon, (data) => {
    if (!isValidSwitchWeaponRequest(data)) return;
    roomManager.getRoomForChannel(channel)?.switchWeapon(channel.id, data.weaponId);
  });

  channel.on(WIRE_EVENTS.buyRequest, (data) => {
    if (!isValidBuyRequest(data)) return;
    roomManager.getRoomForChannel(channel)?.buyWeapon(channel.id, data.weaponId);
  });

  channel.on(WIRE_EVENTS.throwGrenade, (data) => {
    if (!isValidGrenadeThrowRequest(data)) return;
    roomManager.getRoomForChannel(channel)?.throwGrenade(channel.id, data.origin, data.direction);
  });

  channel.on(WIRE_EVENTS.startMatch, () => {
    const room = roomManager.getRoomForChannel(channel);
    if (!room || !room.startMatch(channel.id)) return;
    channel.room.emit(WIRE_EVENTS.roomState, room.toRoomState());
  });

  // Host-only: fill empty slots with AI bots. Room.fillWithBots enforces host + lobby and broadcasts on success.
  channel.on(WIRE_EVENTS.addBots, () => {
    roomManager.getRoomForChannel(channel)?.fillWithBots(channel.id);
  });

  // Host-only: cycle the cosmetic map in the lobby. Room.cycleMap enforces host + lobby and broadcasts on success.
  channel.on(WIRE_EVENTS.cycleMap, () => {
    roomManager.getRoomForChannel(channel)?.cycleMap(channel.id);
  });
}

function originAllowed(corsOrigin: string, origin: string | undefined): boolean {
  if (corsOrigin === "*") return true;
  return origin === corsOrigin;
}

/** The tiny slice of a live socket the liveness sweep touches (real ws sockets satisfy this; tests pass fakes). */
export interface HeartbeatSocket {
  isAlive: boolean;
  ping(): void;
  terminate(): void;
}

/**
 * One tick of the liveness sweep. Any socket that hasn't ponged since the last
 * tick is presumed dead (half-open TCP, crashed tab, dropped Wi-Fi) and
 * terminated — which fires its `close` handler and frees the player. Live
 * sockets are marked pending and pinged; the browser answers automatically, so
 * a healthy client flips back to alive before the next tick. The ping/pong
 * traffic also keeps connections warm through idle proxies.
 */
export function sweepHeartbeats(sockets: Iterable<HeartbeatSocket>): void {
  for (const ws of sockets) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}

/**
 * Attaches a WebSocket game server to the given HTTP server on the `/ws` path
 * (so it coexists with the Express `/healthz` route). Replaces the old geckos
 * UDP-over-WebRTC transport with plain WebSocket-over-TCP — no UDP port needed,
 * so the server runs on free hosts (Render/Koyeb/etc.) that don't expose UDP.
 */
export function attachWsServer(httpServer: http.Server, options: AttachWsOptions): AttachedWs {
  const hub = new RoomHub();
  const io: NetServer = { room: (code) => ({ emit: (event, data) => hub.emit(code, event, data) }) };
  const roomManager = new RoomManager(io);

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ origin }, cb) => cb(originAllowed(options.corsOrigin, origin)),
  });

  wss.on("connection", (ws) => {
    // Liveness flag for the heartbeat sweep: set now, reset each tick, flipped
    // back true by the client's automatic pong (see sweepHeartbeats).
    const live = ws as WebSocket & { isAlive: boolean };
    live.isAlive = true;
    ws.on("pong", () => {
      live.isAlive = true;
    });

    const channel = new WsChannel(ws, hub);
    registerHandlers(channel, roomManager);
    channel.onDisconnect(() => roomManager.handleDisconnect(channel));

    ws.on("message", (raw) => {
      let frame: Frame;
      try {
        frame = JSON.parse(raw.toString()) as Frame;
      } catch {
        return; // ignore malformed frames
      }
      if (frame && typeof frame.e === "string") channel.dispatch(frame.e, frame.d);
    });

    ws.on("close", () => {
      channel.fireDisconnect();
      hub.leave(channel);
    });
    ws.on("error", () => ws.close());

    // Hand the client its id so it knows which snapshots/hits are "self".
    channel.emit(WIRE_EVENTS.connectionReady, { id: channel.id });
  });

  // Periodic liveness sweep — drops silent sockets so their players don't linger
  // and keeps live ones warm. Cleared when the server closes so tests/shutdown
  // don't leak a timer.
  const heartbeat = setInterval(() => {
    sweepHeartbeats(wss.clients as unknown as Iterable<HeartbeatSocket>);
  }, options.heartbeatMs ?? HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  return { wss, roomManager };
}
