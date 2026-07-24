import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import { Scene } from "./game/Scene";
import { HUD } from "./ui/HUD";
import { Lobby } from "./ui/Lobby";
import { PauseMenu } from "./ui/PauseMenu";
import { BuyMenu } from "./ui/BuyMenu";
import { MatchEndScreen } from "./ui/MatchEndScreen";
import { useAuth } from "./net/useAuth";
import { useNetwork } from "./net/useNetwork";
import { useSensitivity } from "./settings/useSensitivity";
import { DEFAULT_FOV, WEAPONS, type WeaponId } from "./game/weapons/weaponDefs";
import { getMapTheme } from "./game/maps";
import { GRENADE_COOLDOWN_SEC } from "./game/grenadeConfig";
import type { WeaponRigStateChange } from "./game/weapons/WeaponRig";
import type { RoomState, Vec3 } from "./net/messages";
import { playGrenadeThrow, playPhaseStinger, playUiClick, setLowHealthPulse, startAmbience, stopAmbience } from "./audio/sounds";
import "./App.css";

function App() {
  const [locked, setLocked] = useState(false);
  const [buyMenuOpen, setBuyMenuOpen] = useState(false);
  const [weapon, setWeapon] = useState<WeaponRigStateChange | null>(null);
  // Client mirror of the server's grenade cooldown — epoch ms when the next throw
  // is allowed. The server independently enforces it (C1); this only gates local
  // spam + drives the HUD readiness ring. The ref is the gate (stable callback);
  // the state is for rendering.
  const [grenadeReadyAt, setGrenadeReadyAt] = useState(0);
  const grenadeReadyAtRef = useRef(0);
  const { sensitivity, setSensitivity } = useSensitivity();
  const controlsRef = useRef<PointerLockControlsImpl | null>(null);
  const auth = useAuth();
  const net = useNetwork();

  const inMatch = net.roomState?.phase === "active";
  const matchEnded = net.roomState?.roundPhase === "match-end";
  const roundPhase = net.roomState?.roundPhase;
  const selfPlayer = net.roomState?.players.find((p) => p.id === net.selfId) ?? null;
  const selfOwned = selfPlayer?.owned;
  const selfHp = selfPlayer?.hp ?? 0;
  const selfPerkTier = selfPlayer?.perkTier ?? 0;
  const selfTeam = selfPlayer?.team ?? null;
  const mapTheme = getMapTheme(net.roomState?.mapId);
  const lastRoundWinner = net.roomState?.lastRoundWinner ?? null;

  // The fire gate reads through a ref so the callback identity is stable —
  // it's consulted inside useWeapon's event handlers, not during render.
  const roomStateRef = useRef<RoomState | null>(null);
  roomStateRef.current = net.roomState;
  const selfIdRef = useRef<string | null>(null);
  selfIdRef.current = net.selfId;
  const canEngage = useCallback(() => {
    const state = roomStateRef.current;
    if (!state || state.phase !== "active" || state.roundPhase !== "action") return false;
    const self = state.players.find((p) => p.id === selfIdRef.current);
    return !!self && self.hp > 0;
  }, []);

  const handleResume = useCallback(() => controlsRef.current?.lock(), []);
  const handlePause = useCallback(() => controlsRef.current?.unlock(), []);
  const handleLeaveMatch = useCallback(() => window.location.reload(), []);

  // [G] grenade throw: gate on the local cooldown mirror (the server enforces it
  // too), fire the request, play the throw whoosh, and arm the cooldown. Stable
  // identity (reads the gate through a ref) so GrenadeThrower doesn't re-subscribe.
  const handleGrenadeThrow = useCallback(
    (origin: Vec3, direction: Vec3) => {
      if (Date.now() < grenadeReadyAtRef.current) return;
      net.throwGrenade({ origin, direction });
      playGrenadeThrow();
      const until = Date.now() + GRENADE_COOLDOWN_SEC * 1000;
      grenadeReadyAtRef.current = until;
      setGrenadeReadyAt(until);
    },
    [net],
  );

  // A new round grants a fresh grenade (the server resets its cooldown) — clear
  // the local mirror so the HUD shows "ready" again.
  useEffect(() => {
    grenadeReadyAtRef.current = 0;
    setGrenadeReadyAt(0);
  }, [net.roomState?.roundNumber]);

  // sendBuy takes a { weaponId } request; the BuyMenu emits a bare id — adapt here.
  const handleBuy = useCallback((weaponId: WeaponId) => net.sendBuy({ weaponId }), [net]);
  const handleCloseBuy = useCallback(() => {
    setBuyMenuOpen(false);
    controlsRef.current?.lock();
  }, []);

  // Release the pointer when the match ends so the end screen is clickable.
  useEffect(() => {
    if (matchEnded) controlsRef.current?.unlock();
  }, [matchEnded]);

  // Industrial ambience bed runs for the duration of a match.
  useEffect(() => {
    if (inMatch) startAmbience();
    return () => stopAmbience();
  }, [inMatch]);

  // A short stinger on each round-phase change — bright for a round won, falling for one lost.
  const prevPhaseRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!inMatch || !roundPhase) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = roundPhase;
    if (prev === roundPhase) return;
    if (roundPhase === "buy") playPhaseStinger("buy");
    else if (roundPhase === "action") playPhaseStinger("action");
    else if (roundPhase === "round-end" || roundPhase === "match-end") {
      playPhaseStinger(lastRoundWinner === null ? "draw" : lastRoundWinner === selfTeam ? "win" : "loss");
    }
  }, [roundPhase, inMatch, lastRoundWinner, selfTeam]);

  // Heartbeat while critically wounded (alive and at/below 30 HP).
  useEffect(() => {
    setLowHealthPulse(inMatch && selfHp > 0 && selfHp <= 30);
    return () => setLowHealthPulse(false);
  }, [inMatch, selfHp]);

  // One click for any button press, anywhere — also the user gesture that
  // unlocks the AudioContext on first interaction (autoplay policy).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest("button")) playUiClick();
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  // [B] toggles the armory during the buy phase. Opening it releases the pointer
  // so the cards are clickable — this reuses the pointer-lock input gate, so the
  // player can't fire or move behind the menu. Closing re-locks to resume play.
  useEffect(() => {
    if (!inMatch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" || roundPhase !== "buy") return;
      setBuyMenuOpen((open) => {
        const next = !open;
        if (next) controlsRef.current?.unlock();
        else controlsRef.current?.lock();
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inMatch, roundPhase]);

  // The buy window closed (round started or match ended) — force the armory shut
  // and re-lock, so a lingering menu can't swallow the action phase.
  useEffect(() => {
    if (roundPhase !== "buy" && buyMenuOpen) {
      setBuyMenuOpen(false);
      controlsRef.current?.lock();
    }
  }, [roundPhase, buyMenuOpen]);

  // Looking down the Kar98 scope narrows the FOV 75 -> 30; scaling mouse speed
  // by the same ratio keeps the "degrees turned per inch of mouse" feel steady.
  const zoomDef = weapon && weapon.active.zoomed ? WEAPONS[weapon.activeWeaponId].zoom : undefined;
  const effectiveSensitivity = zoomDef ? sensitivity * (zoomDef.zoomedFov / zoomDef.defaultFov) : sensitivity;

  if (!inMatch) {
    return <Lobby auth={auth} net={net} />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <div
        id="canvas-wrap"
        // Full-colour grade (grayscale identity retired per art-direction change):
        // a light contrast + saturation lift so the arena's authored colour — rust
        // barrels, hazard-amber beacons, team red/blue stickmen — reads punchy
        // without tipping into oversaturation. Tune here for the whole scene look.
        style={{ position: "absolute", inset: 0, filter: "contrast(1.08) saturate(1.14) brightness(1.04)" }}
      >
        <Canvas
          shadows
          // Clamp DPR: the default [1,2] renders 4x the pixels on a retina panel,
          // and every one of them now goes through the post stack (PostFX) —
          // capping at 1.5 protects the 10-players-at-60fps budget with no
          // visible loss in a grimy industrial scene. Ask for the discrete GPU.
          dpr={[1, 1.5]}
          gl={{ powerPreference: "high-performance" }}
          camera={{ fov: DEFAULT_FOV, near: 0.1, far: 1000, position: [0, 1.6, 5] }}
        >
          <Scene
            onFireRequest={net.sendFire}
            onReloadRequest={net.sendReload}
            onSwitchRequest={net.sendSwitch}
            canEngage={canEngage}
            ownedWeapons={selfOwned}
            onWeaponStateChange={setWeapon}
            onPlayerInput={net.sendInput}
            getAuthoritativePosition={net.getSelfPosition}
            interpolator={net.interpolator}
            selfId={net.selfId}
            players={net.roomState?.players ?? []}
            drainShotEvents={net.drainShotEvents}
            drainHitEvents={net.drainHitEvents}
            getFireCount={net.getFireCount}
            getGrenadeProjectiles={net.getGrenadeProjectiles}
            drainGrenadeExplosions={net.drainGrenadeExplosions}
            onGrenadeThrow={handleGrenadeThrow}
            perkTier={selfPerkTier}
            theme={mapTheme}
          />
          <PointerLockControls
            ref={controlsRef}
            selector="#canvas-wrap"
            pointerSpeed={effectiveSensitivity}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
        </Canvas>
      </div>

      {/* Cinematic vignette + a faint top-down gradient — sits over the 3D view
          (outside the canvas wrap, so it stays true black) but under the HUD,
          which paints on top since it comes later in the DOM. Never eats clicks. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 44%, transparent 52%, rgba(0,0,0,0.5) 100%), linear-gradient(180deg, rgba(0,0,0,0.22), transparent 22% 82%, rgba(0,0,0,0.3))",
        }}
      />

      <HUD
        weapon={weapon}
        roomState={net.roomState}
        selfId={net.selfId}
        lastHit={net.lastHit}
        grenadeReadyAt={grenadeReadyAt}
        onPauseClick={handlePause}
      />

      {/* Mid-match connection drop — the channel is auto-reconnecting and will
          rejoin the room on success. A quiet banner so the player knows why the
          world went still. */}
      {net.status === "reconnecting" && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 18px",
            borderRadius: 6,
            background: "rgba(20,16,10,0.82)",
            border: "1px solid #d9a441",
            color: "#f0c66a",
            font: "600 13px/1 ui-monospace, monospace",
            letterSpacing: "0.18em",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          RECONNECTING…
        </div>
      )}

      {matchEnded && net.roomState ? (
        <MatchEndScreen roomState={net.roomState} selfId={net.selfId} onLeaveMatch={handleLeaveMatch} />
      ) : buyMenuOpen && roundPhase === "buy" && net.roomState ? (
        <BuyMenu roomState={net.roomState} selfId={net.selfId} onBuy={handleBuy} onClose={handleCloseBuy} />
      ) : (
        !locked && (
          <PauseMenu
            onResume={handleResume}
            onLeaveMatch={handleLeaveMatch}
            sensitivity={sensitivity}
            onSensitivityChange={setSensitivity}
          />
        )
      )}
    </div>
  );
}

export default App;
