import {
  WIRE_EVENTS,
  type BuyRequest,
  type FireAck,
  type FireRequest,
  type GrenadeExplosion,
  type GrenadeSnapshot,
  type GrenadeThrowRequest,
  type HitResult,
  type NetError,
  type PlayerInput,
  type PositionSnapshot,
  type ReloadRequest,
  type RoomState,
  type ShotFired,
  type SwitchWeaponRequest,
} from "./messages";
import type { NetClientChannel } from "./transport";

/** Connection lifecycle, surfaced so the UI can show a "reconnecting…" indicator. */
export type NetConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface ConnectOptions {
  /** Base server URL (http/https) — the ws(s) URL is derived from it. Omit to use the current page origin. */
  url?: string;
  /** Optional explicit port (dev: server on 9090 while the page is on 5173). */
  port?: number;
  /** Notified on every connection lifecycle change — drives the reconnecting indicator. */
  onStatus?: (status: NetConnectionStatus) => void;
}

/** Compact wire frame: short keys keep the 60Hz stream small. */
interface Frame {
  e: string;
  d?: unknown;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;

/** Exponential backoff (capped, jittered) before the Nth consecutive reconnect attempt (1-based). */
export function reconnectDelay(attempt: number): number {
  const exp = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
  return exp + Math.random() * 250;
}

/** Derives the WebSocket endpoint (`.../ws`) from the configured base URL / port, matching the server's path. */
function toWsUrl(url?: string, port?: number): string {
  const base = url ? new URL(url) : new URL(window.location.origin);
  const scheme = base.protocol === "https:" ? "wss:" : "ws:";
  const p = port ?? (base.port ? Number(base.port) : undefined);
  const host = p ? `${base.hostname}:${p}` : base.hostname;
  return `${scheme}//${host}/ws`;
}

/**
 * A NetClientChannel that survives socket drops. Callers hold one stable channel
 * reference while the underlying WebSocket is transparently re-dialed with
 * exponential backoff after an unexpected close. Registered handlers persist
 * across reconnects (re-applied to each new socket), and `id` is refreshed from
 * the server's `connection-ready` frame on every (re)connect — so the app can
 * rejoin its room, since the server issues a fresh id + player per socket.
 *
 * The first connect is one-shot: if it never reaches ready it rejects (a bad URL
 * shouldn't masquerade as an endless reconnect). Auto-reconnect kicks in only
 * once a session has been established, and stops once the caller calls close().
 */
class ReconnectingChannel implements NetClientChannel {
  id: string | undefined;
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, (data: unknown) => void>();
  private closedByUser = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly endpoint: string;
  private readonly onStatus?: (status: NetConnectionStatus) => void;

  constructor(endpoint: string, onStatus?: (status: NetConnectionStatus) => void) {
    this.endpoint = endpoint;
    this.onStatus = onStatus;
  }

  /** Opens the first socket; resolves once the server reports the connection ready. */
  start(): Promise<NetClientChannel> {
    return new Promise((resolve, reject) => this.open({ resolve, reject }));
  }

  on(event: string, handler: (data: unknown) => void): void {
    this.handlers.set(event, handler);
  }

  emit(event: string, data?: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ e: event, d: data } satisfies Frame));
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) this.ws.close(); // onclose reports "disconnected"
    else this.onStatus?.("disconnected");
  }

  private open(initial?: { resolve: (c: NetClientChannel) => void; reject: (e: Error) => void }): void {
    this.onStatus?.(initial ? "connecting" : "reconnecting");
    const ws = new WebSocket(this.endpoint);
    this.ws = ws;
    let ready = false;

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let frame: Frame;
      try {
        frame = JSON.parse(ev.data) as Frame;
      } catch {
        return;
      }
      if (!frame || typeof frame.e !== "string") return;
      if (frame.e === WIRE_EVENTS.connectionReady) {
        ready = true;
        this.attempts = 0;
        this.id = (frame.d as { id?: string } | undefined)?.id;
        this.onStatus?.("connected");
        initial?.resolve(this);
        return;
      }
      this.handlers.get(frame.e)?.(frame.d);
    };

    // A WebSocket error is always followed by a close event, so let onclose own
    // the retry-vs-reject decision (no separate onerror handler needed).
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) {
        this.onStatus?.("disconnected");
        return;
      }
      if (initial && !ready) {
        // Never established → surface the failure instead of retrying forever.
        initial.reject(new Error("WebSocket closed before it was ready"));
        return;
      }
      // An established session dropped (or a reconnect attempt failed) → back off and retry.
      this.attempts += 1;
      this.onStatus?.("reconnecting");
      this.reconnectTimer = setTimeout(() => this.open(), reconnectDelay(this.attempts));
    };
  }
}

/**
 * Opens a reconnecting WebSocket to the game server and resolves once it's ready
 * — i.e. once the server has sent this connection's id (so `channel.id` is
 * populated before any caller uses it). All app messages are `{ e, d }` JSON
 * frames; `connection-ready` is handled internally. The returned channel
 * transparently reconnects if the socket later drops (see ReconnectingChannel).
 */
export function connectToServer(options: ConnectOptions = {}): Promise<NetClientChannel> {
  return new ReconnectingChannel(toWsUrl(options.url, options.port), options.onStatus).start();
}

export function sendCreateRoom(channel: NetClientChannel): void {
  channel.emit(WIRE_EVENTS.createRoom);
}

export function sendJoinRoom(channel: NetClientChannel, code: string): void {
  channel.emit(WIRE_EVENTS.joinRoom, { code });
}

export function sendStartMatch(channel: NetClientChannel): void {
  channel.emit(WIRE_EVENTS.startMatch);
}

export function sendAddBots(channel: NetClientChannel): void {
  channel.emit(WIRE_EVENTS.addBots);
}

export function sendCycleMap(channel: NetClientChannel): void {
  channel.emit(WIRE_EVENTS.cycleMap);
}

export function sendPlayerInput(channel: NetClientChannel, input: PlayerInput): void {
  channel.emit(WIRE_EVENTS.playerInput, input);
}

export function sendFireRequest(channel: NetClientChannel, req: FireRequest): void {
  channel.emit(WIRE_EVENTS.fireRequest, req);
}

export function sendReloadRequest(channel: NetClientChannel, req: ReloadRequest): void {
  channel.emit(WIRE_EVENTS.reloadRequest, req);
}

export function sendSwitchWeapon(channel: NetClientChannel, req: SwitchWeaponRequest): void {
  channel.emit(WIRE_EVENTS.switchWeapon, req);
}

export function sendBuyRequest(channel: NetClientChannel, req: BuyRequest): void {
  channel.emit(WIRE_EVENTS.buyRequest, req);
}

export function sendThrowGrenade(channel: NetClientChannel, req: GrenadeThrowRequest): void {
  channel.emit(WIRE_EVENTS.throwGrenade, req);
}

export function onRoomState(channel: NetClientChannel, cb: (state: RoomState) => void): void {
  channel.on(WIRE_EVENTS.roomState, (data) => cb(data as unknown as RoomState));
}

export function onPositionSnapshotBatch(channel: NetClientChannel, cb: (batch: PositionSnapshot[]) => void): void {
  channel.on(WIRE_EVENTS.positionSnapshotBatch, (data) => cb(data as unknown as PositionSnapshot[]));
}

export function onHitResult(channel: NetClientChannel, cb: (hit: HitResult) => void): void {
  channel.on(WIRE_EVENTS.hitResult, (data) => cb(data as unknown as HitResult));
}

export function onFireAck(channel: NetClientChannel, cb: (ack: FireAck) => void): void {
  channel.on(WIRE_EVENTS.fireAck, (data) => cb(data as unknown as FireAck));
}

export function onShotFired(channel: NetClientChannel, cb: (shot: ShotFired) => void): void {
  channel.on(WIRE_EVENTS.shotFired, (data) => cb(data as unknown as ShotFired));
}

export function onGrenadeState(channel: NetClientChannel, cb: (grenades: GrenadeSnapshot[]) => void): void {
  channel.on(WIRE_EVENTS.grenadeState, (data) => cb(data as unknown as GrenadeSnapshot[]));
}

export function onGrenadeExploded(channel: NetClientChannel, cb: (blast: GrenadeExplosion) => void): void {
  channel.on(WIRE_EVENTS.grenadeExploded, (data) => cb(data as unknown as GrenadeExplosion));
}

export function onNetError(channel: NetClientChannel, cb: (err: NetError) => void): void {
  channel.on(WIRE_EVENTS.netError, (data) => cb(data as unknown as NetError));
}
