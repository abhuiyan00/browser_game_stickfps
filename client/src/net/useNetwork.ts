import { useCallback, useEffect, useRef, useState } from "react";
import type { NetClientChannel } from "./transport";
import {
  connectToServer,
  onFireAck,
  onGrenadeExploded,
  onGrenadeState,
  onHitResult,
  onNetError,
  onPositionSnapshotBatch,
  onRoomState,
  onShotFired,
  sendBuyRequest,
  sendCreateRoom,
  sendFireRequest,
  sendJoinRoom,
  sendPlayerInput,
  sendAddBots,
  sendCycleMap,
  sendReloadRequest,
  sendStartMatch,
  sendSwitchWeapon,
  sendThrowGrenade,
} from "./netClient";
import { RemotePlayerInterpolator } from "./remoteInterpolation";
import { playDamageTaken, playExplosion, playGunshot, playHeadshotMarker, playHitmarker } from "../audio/sounds";
import type {
  BuyRequest,
  FireAck,
  FireRequest,
  GrenadeExplosion,
  GrenadeSnapshot,
  GrenadeThrowRequest,
  HitResult,
  PlayerInput,
  ReloadRequest,
  RoomState,
  ShotFired,
  SwitchWeaponRequest,
  Vec3,
} from "./messages";

export type NetStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export interface UseNetworkResult {
  status: NetStatus;
  error: string | null;
  roomState: RoomState | null;
  selfId: string | null;
  interpolator: RemotePlayerInterpolator;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  startMatch: () => void;
  /** Host-only: fill empty slots with AI bots (server enforces host + lobby phase). */
  addBots: () => void;
  /** Host-only: cycle the cosmetic map (server enforces host + lobby phase). */
  cycleMap: () => void;
  /** Throw a frag grenade — the server validates the action phase + cooldown and owns the arc/damage. */
  throwGrenade: (req: GrenadeThrowRequest) => void;
  sendInput: (input: PlayerInput) => void;
  sendFire: (req: FireRequest) => void;
  sendReload: (req: ReloadRequest) => void;
  sendSwitch: (req: SwitchWeaponRequest) => void;
  sendBuy: (req: BuyRequest) => void;
  getSelfPosition: () => Vec3 | null;
  lastHit: HitResult | null;
  lastAck: FireAck | null;
  /** Drains and returns every ShotFired received since the last call — for VFX, not React state (avoids a re-render per shot). */
  drainShotEvents: () => ShotFired[];
  /** Drains and returns every HitResult received since the last call — for VFX (impact particles). */
  drainHitEvents: () => HitResult[];
  /** Monotonic confirmed-shot count per player — RemotePlayers edge-detects it to animate third-person firing. */
  getFireCount: (playerId: string) => number;
  /** Latest server broadcast of live grenade projectiles — the Grenades component renders these each frame. */
  getGrenadeProjectiles: () => GrenadeSnapshot[];
  /** Drains and returns every grenade detonation received since the last call — for the explosion VFX. */
  drainGrenadeExplosions: () => GrenadeExplosion[];
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;
const SERVER_PORT = import.meta.env.VITE_SERVER_PORT ? Number(import.meta.env.VITE_SERVER_PORT) : undefined;

export function useNetwork(): UseNetworkResult {
  const channelRef = useRef<NetClientChannel | null>(null);
  // Reconnect bookkeeping: the last room we were in (to auto-rejoin after a drop)
  // and whether we've ever connected (so the first connect doesn't try to rejoin).
  const lastRoomCodeRef = useRef<string | null>(null);
  const hasConnectedRef = useRef(false);
  const interpolatorRef = useRef(new RemotePlayerInterpolator());
  const selfPositionRef = useRef<Vec3 | null>(null);
  const shotEventsRef = useRef<ShotFired[]>([]);
  const hitEventsRef = useRef<HitResult[]>([]);
  const fireCountsRef = useRef(new Map<string, number>());
  const grenadesRef = useRef<GrenadeSnapshot[]>([]);
  const explosionEventsRef = useRef<GrenadeExplosion[]>([]);
  const [status, setStatus] = useState<NetStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [lastHit, setLastHit] = useState<HitResult | null>(null);
  const [lastAck, setLastAck] = useState<FireAck | null>(null);

  useEffect(() => {
    let cancelled = false;
    let localChannel: NetClientChannel | null = null;
    setStatus("connecting");

    connectToServer({
      url: SERVER_URL,
      port: SERVER_PORT,
      onStatus: (s) => {
        if (cancelled) return;
        if (s === "connected") {
          // A reconnect (not the first connect) rejoins the room we were in: the
          // server issues a fresh id + player on the new socket, so we re-enter by
          // code. (A solo host whose room was torn down gets a net error instead.)
          if (hasConnectedRef.current && lastRoomCodeRef.current && channelRef.current) {
            sendJoinRoom(channelRef.current, lastRoomCodeRef.current);
          }
          hasConnectedRef.current = true;
          setStatus("connected");
        } else if (s === "reconnecting") {
          setStatus("reconnecting");
        } else if (s === "connecting") {
          setStatus("connecting");
        }
        // "disconnected" fires only from our own close() on unmount — nothing to show.
      },
    })
      .then((channel) => {
        if (cancelled) {
          channel.close();
          return;
        }
        localChannel = channel;
        channelRef.current = channel;

        onRoomState(channel, (state) => {
          lastRoomCodeRef.current = state.code;
          setRoomState(state);
          // Drop interpolation buffers for players no longer in the room, so a
          // leaver's stickman doesn't stand frozen at their last position.
          const liveIds = new Set(state.players.map((p) => p.id));
          for (const id of interpolatorRef.current.activeIds()) {
            if (!liveIds.has(id)) interpolatorRef.current.remove(id);
          }
        });
        onNetError(channel, (err) => setError(err.message));
        onPositionSnapshotBatch(channel, (batch) => {
          const now = Date.now();
          for (const snap of batch) {
            interpolatorRef.current.push(snap.playerId, snap.position, snap.yaw, now);
            if (snap.playerId === channelRef.current?.id) {
              selfPositionRef.current = snap.position;
            }
          }
        });
        onHitResult(channel, (hit) => {
          hitEventsRef.current.push(hit);
          setLastHit(hit);
          if (hit.shooterId === channel.id) (hit.zone === "head" ? playHeadshotMarker : playHitmarker)();
          if (hit.targetId === channel.id) playDamageTaken();
        });
        onFireAck(channel, setLastAck);
        onGrenadeState(channel, (grenades) => {
          grenadesRef.current = grenades;
        });
        onGrenadeExploded(channel, (blast) => {
          explosionEventsRef.current.push(blast);
          // Distance-attenuated boom, same falloff model as remote gunshots.
          const self = selfPositionRef.current;
          const dist = self
            ? Math.hypot(blast.position[0] - self[0], blast.position[1] - self[1], blast.position[2] - self[2])
            : 20;
          playExplosion(Math.max(0, 1 - dist / 90));
        });
        onShotFired(channel, (shot) => {
          shotEventsRef.current.push(shot);
          fireCountsRef.current.set(shot.shooterId, (fireCountsRef.current.get(shot.shooterId) ?? 0) + 1);
          // Local shots play their sound instantly in useWeapon — this handles
          // everyone else's, attenuated by distance to the muzzle.
          if (shot.shooterId !== channel.id) {
            const self = selfPositionRef.current;
            const dist = self
              ? Math.hypot(shot.origin[0] - self[0], shot.origin[1] - self[1], shot.origin[2] - self[2])
              : 20;
            playGunshot(shot.weaponId, Math.max(0, 1 - dist / 70));
          }
        });

        setStatus("connected");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
      localChannel?.close();
      channelRef.current = null;
    };
  }, []);

  const createRoom = useCallback(() => {
    if (channelRef.current) sendCreateRoom(channelRef.current);
  }, []);

  const joinRoom = useCallback((code: string) => {
    if (channelRef.current) sendJoinRoom(channelRef.current, code);
  }, []);

  const startMatch = useCallback(() => {
    if (channelRef.current) sendStartMatch(channelRef.current);
  }, []);

  const addBots = useCallback(() => {
    if (channelRef.current) sendAddBots(channelRef.current);
  }, []);

  const cycleMap = useCallback(() => {
    if (channelRef.current) sendCycleMap(channelRef.current);
  }, []);

  const throwGrenade = useCallback((req: GrenadeThrowRequest) => {
    if (channelRef.current) sendThrowGrenade(channelRef.current, req);
  }, []);

  const sendInput = useCallback((input: PlayerInput) => {
    if (channelRef.current) sendPlayerInput(channelRef.current, input);
  }, []);

  const sendFire = useCallback((req: FireRequest) => {
    if (channelRef.current) sendFireRequest(channelRef.current, req);
  }, []);

  const sendReload = useCallback((req: ReloadRequest) => {
    if (channelRef.current) sendReloadRequest(channelRef.current, req);
  }, []);

  const sendSwitch = useCallback((req: SwitchWeaponRequest) => {
    if (channelRef.current) sendSwitchWeapon(channelRef.current, req);
  }, []);

  const sendBuy = useCallback((req: BuyRequest) => {
    if (channelRef.current) sendBuyRequest(channelRef.current, req);
  }, []);

  const getSelfPosition = useCallback(() => selfPositionRef.current, []);

  const drainShotEvents = useCallback((): ShotFired[] => {
    const events = shotEventsRef.current;
    shotEventsRef.current = [];
    return events;
  }, []);

  const drainHitEvents = useCallback((): HitResult[] => {
    const events = hitEventsRef.current;
    hitEventsRef.current = [];
    return events;
  }, []);

  const getFireCount = useCallback((playerId: string): number => fireCountsRef.current.get(playerId) ?? 0, []);

  const getGrenadeProjectiles = useCallback((): GrenadeSnapshot[] => grenadesRef.current, []);

  const drainGrenadeExplosions = useCallback((): GrenadeExplosion[] => {
    const events = explosionEventsRef.current;
    explosionEventsRef.current = [];
    return events;
  }, []);

  return {
    status,
    error,
    roomState,
    selfId: channelRef.current?.id ?? null,
    interpolator: interpolatorRef.current,
    createRoom,
    joinRoom,
    startMatch,
    addBots,
    cycleMap,
    throwGrenade,
    sendInput,
    sendFire,
    sendReload,
    sendSwitch,
    sendBuy,
    getSelfPosition,
    lastHit,
    lastAck,
    drainShotEvents,
    drainHitEvents,
    getFireCount,
    getGrenadeProjectiles,
    drainGrenadeExplosions,
  };
}
