/**
 * Transport-agnostic net interfaces. The rest of the server (Room, RoomManager,
 * the connection handlers) only ever touches these shapes, never a concrete
 * WebSocket/geckos type — so the underlying transport can change without any
 * gameplay code changing. The live implementation is `wsServer.ts` (plain
 * WebSocket over TCP; picked so the server can run on free hosts that don't
 * expose raw UDP, unlike the original geckos.io UDP-over-WebRTC transport).
 *
 * The shape deliberately mirrors the small subset of the geckos API the code
 * used: a per-connection `NetChannel` with `.id`, event `on`/`emit`, a room it
 * can `join` and broadcast to via `.room.emit`, and a disconnect hook.
 */
export interface NetRoomEmitter {
  emit(event: string, data?: unknown): void;
}

export interface NetChannel {
  /** Server-assigned unique id for this connection (the player id everywhere else). */
  readonly id: string;
  /** Register the handler for an inbound event (last registration wins, like geckos). */
  on(event: string, handler: (data: unknown) => void): void;
  /** Send an event to just this connection. */
  emit(event: string, data?: unknown): void;
  /** Broadcast to every connection in the room this channel has joined. */
  readonly room: NetRoomEmitter;
  /** Join (or move to) a room by code — subsequent `room.emit`s target it. */
  join(roomCode: string): void;
  /** Register a handler to run when this connection closes. */
  onDisconnect(handler: () => void): void;
}

export interface NetServer {
  /** Broadcast emitter for an arbitrary room code (used by Room to reach all its members). */
  room(code: string): NetRoomEmitter;
}
