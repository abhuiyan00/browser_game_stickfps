import { useEffect, useRef, useState } from "react";
import { ALL_WEAPON_IDS, WEAPON_HOTKEYS, WEAPONS } from "../game/weapons/weaponDefs";
import { addTrauma } from "../game/effects/screenShake";
import { readCrosshairGap } from "../game/effects/crosshairBloom";
import { playKillConfirm, playKillstreak } from "../audio/sounds";
import { FACTIONS } from "../game/lore";
import { getMapTheme } from "../game/maps";
import { GRENADE_COOLDOWN_SEC } from "../game/grenadeConfig";
import { ENEMY_COLOR, FRIENDLY_COLOR } from "../game/teamColors";
import { PERK_LABELS } from "../game/perks";
import type { WeaponRigStateChange } from "../game/weapons/WeaponRig";
import type { HitResult, HitZone, RoomState, Team } from "../net/messages";

export interface HUDProps {
  weapon: WeaponRigStateChange | null;
  roomState: RoomState | null;
  selfId: string | null;
  /** Latest server-confirmed hit — drives the hitmarker, damage flash, and kill feed. */
  lastHit: HitResult | null;
  /** Epoch ms when the grenade is ready again (client cooldown mirror) — drives the ability chip. */
  grenadeReadyAt?: number;
  onPauseClick: () => void;
}

interface KillFeedEntry {
  key: string;
  text: string;
  at: number;
  /** Whether the lethal blow was a headshot — shown with a marker in the feed. */
  head: boolean;
}

const KILL_FEED_TTL_MS = 4500;
const KILL_FEED_MAX = 4;

// Self reads blue, the enemy team red — shared with the in-world stickman colours
// (teamColors.ts) so the HUD's team read always agrees with what the player sees.
const SELF_TEAM_COLOR = FRIENDLY_COLOR;
const ENEMY_TEAM_COLOR = ENEMY_COLOR;
function teamColor(team: Team, selfTeam: Team | null | undefined): string {
  if (!selfTeam) return "#e8ebee";
  return team === selfTeam ? SELF_TEAM_COLOR : ENEMY_TEAM_COLOR;
}

// Killstreak call-outs (client-cosmetic: counts the local player's lethal blows
// between deaths — the server stays the source of truth for the kills themselves).
const STREAK_LABELS: Record<number, string> = {
  2: "DOUBLE KILL",
  3: "TRIPLE KILL",
  4: "RAMPAGE",
  5: "UNSTOPPABLE",
};
function streakLabel(streak: number): string | null {
  if (streak >= 6) return "GODLIKE";
  return STREAK_LABELS[streak] ?? null;
}

interface DamageNumber {
  key: string;
  value: number;
  head: boolean;
  at: number;
  x: number;
}

// Shared HUD design tokens — a translucent noir panel and a monospace face for
// numeric readouts, so HP / ammo / funds all read as one instrument cluster.
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
const HUD_PANEL: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  color: "#e8ebee",
  background: "rgba(10,12,14,0.42)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "6px 12px",
  textShadow: "0 1px 3px rgba(0,0,0,0.8)",
};
const HUD_LABEL: React.CSSProperties = {
  fontSize: "0.58rem",
  letterSpacing: "0.2em",
  color: "rgba(232,235,238,0.5)",
};

function formatCountdown(phaseEndsAt: number | null, now: number): string {
  if (phaseEndsAt === null) return "";
  const seconds = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
  return `${seconds}s`;
}

export function HUD({ weapon, roomState, selfId, lastHit, grenadeReadyAt = 0, onPauseClick }: HUDProps) {
  const self = roomState?.players.find((p) => p.id === selfId) ?? null;
  const selfDead = !!self && self.hp <= 0;
  // Active map — server-broadcast in RoomState.mapId; the HUD labels read it so
  // the top banner + setup card name the arena the player is actually standing in.
  const map = getMapTheme(roomState?.mapId);
  // The death overlay spans the rest of the action phase and the round-end
  // intermission — the fallen player sees "eliminated" until the next buy phase.
  const inCombatWindow = roomState?.roundPhase === "action" || roomState?.roundPhase === "round-end";

  // Round-phase broadcasts only arrive on transitions, not every second — this
  // local ticker keeps the countdown display and kill-feed expiry live between them.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const [hitmarker, setHitmarker] = useState<false | { zone: HitZone; lethal: boolean }>(false);
  const [dmgNumbers, setDmgNumbers] = useState<DamageNumber[]>([]);
  const [killBanner, setKillBanner] = useState<{ name: string; at: number } | null>(null);
  const [streakBadge, setStreakBadge] = useState<{ label: string; at: number } | null>(null);
  const streakRef = useRef(0);
  useEffect(() => {
    if (!lastHit || lastHit.shooterId !== selfId) return;
    const zone = lastHit.zone ?? "body";
    setHitmarker({ zone, lethal: lastHit.lethal });
    const t = setTimeout(() => setHitmarker(false), lastHit.lethal ? 320 : 220);

    // A floating damage number near the crosshair — gold + bigger for a headshot.
    setDmgNumbers((prev) =>
      [
        ...prev,
        {
          key: `${lastHit.serverTick}-${lastHit.targetId}-${Math.random().toString(36).slice(2, 7)}`,
          value: lastHit.damage,
          head: zone === "head",
          at: Date.now(),
          x: (Math.random() * 2 - 1) * 26,
        },
      ].slice(-8),
    );

    // A kill by the local player: bump the streak, flash a banner + milestone call-out.
    if (lastHit.lethal) {
      const targetName = roomState?.players.find((p) => p.id === lastHit.targetId)?.name ?? "target";
      setKillBanner({ name: targetName, at: Date.now() });
      streakRef.current += 1;
      playKillConfirm();
      addTrauma(0.3); // a kill jolts the camera — the hit-stop-adjacent punch
      const label = streakLabel(streakRef.current);
      if (label) {
        setStreakBadge({ label, at: Date.now() });
        playKillstreak(streakRef.current);
      }
    }
    return () => clearTimeout(t);
    // roomState is intentionally not a dependency: this must fire once per new hit,
    // not on every roster broadcast (which would duplicate numbers/banners/sounds).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastHit, selfId]);

  // Dying breaks the killstreak.
  const selfDeadRef = useRef(false);
  useEffect(() => {
    if (selfDead && !selfDeadRef.current) streakRef.current = 0;
    selfDeadRef.current = selfDead;
  }, [selfDead]);

  // Hold Tab for the scoreboard (standard FPS). preventDefault stops Tab from
  // walking focus through the DOM while in a match.
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Tab") return;
      e.preventDefault();
      setScoreboardOpen(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Tab") return;
      e.preventDefault();
      setScoreboardOpen(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const [damageFlash, setDamageFlash] = useState(false);
  useEffect(() => {
    if (!lastHit || lastHit.targetId !== selfId) return;
    setDamageFlash(true);
    // Rattle the view when hit — scaled by the blow, so a chip barely shakes and
    // a shotgun blast really jolts.
    addTrauma(Math.min(0.5, 0.18 + lastHit.damage / 220));
    const t = setTimeout(() => setDamageFlash(false), 380);
    return () => clearTimeout(t);
  }, [lastHit, selfId]);

  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  useEffect(() => {
    if (!lastHit || !lastHit.lethal || !roomState) return;
    const name = (id: string) => roomState.players.find((p) => p.id === id)?.name ?? "???";
    setKillFeed((prev) =>
      [
        ...prev,
        {
          key: `${lastHit.serverTick}-${lastHit.targetId}`,
          text: `${name(lastHit.shooterId)} ✕ ${name(lastHit.targetId)}`,
          at: Date.now(),
          head: lastHit.zone === "head",
        },
      ].slice(-KILL_FEED_MAX),
    );
    // roomState is deliberately not a dependency: a new entry should only be
    // appended when the hit itself changes, not when the roster broadcasts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastHit]);
  const liveFeed = killFeed.filter((e) => now - e.at < KILL_FEED_TTL_MS);
  const liveDmg = dmgNumbers.filter((d) => now - d.at < 950);
  const showKill = killBanner && now - killBanner.at < 1400;
  const showStreak = streakBadge && now - streakBadge.at < 1600;
  const lowHp = !!self && self.hp > 0 && self.hp <= 30;
  const grenadeCdMs = Math.max(0, grenadeReadyAt - now);
  const grenadeReady = grenadeCdMs <= 0;
  const grenadeFrac = grenadeReady ? 1 : 1 - grenadeCdMs / (GRENADE_COOLDOWN_SEC * 1000);

  return (
    <>
      {weapon && !selfDead && (weapon.active.zoomed ? <ScopeReticle /> : <Crosshair />)}
      {hitmarker && <Hitmarker zone={hitmarker.zone} lethal={hitmarker.lethal} />}
      {liveDmg.length > 0 && <DamageNumbers items={liveDmg} />}
      {showKill && killBanner && <KillBanner name={killBanner.name} />}
      {showStreak && streakBadge && <KillstreakBadge label={streakBadge.label} />}
      {lowHp && <LowHpVignette />}
      {damageFlash && <DamageFlash />}

      {roomState && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.32em", opacity: 0.5, marginBottom: 2 }}>{map.name}</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.05em" }} data-testid="team-score">
            <span style={{ opacity: self?.team === "A" ? 1 : 0.8, color: teamColor("A", self?.team) }}>
              A{self?.team === "A" ? " (you)" : ""} {roomState.teamWins.A}
            </span>
            <span style={{ opacity: 0.5, margin: "0 8px" }}>—</span>
            <span style={{ opacity: self?.team === "B" ? 1 : 0.8, color: teamColor("B", self?.team) }}>
              {roomState.teamWins.B} {self?.team === "B" ? "(you) " : ""}B
            </span>
          </div>
          <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>
            Round {roomState.roundNumber} · {roomState.roundPhase}
          </div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>{formatCountdown(roomState.phaseEndsAt, now)}</div>
        </div>
      )}

      {roomState?.roundPhase === "buy" && (
        <div
          style={{
            position: "fixed",
            top: "34%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            pointerEvents: "none",
            userSelect: "none",
          }}
          data-testid="buy-phase-banner"
        >
          <div style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "0.12em" }}>SETUP</div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.24em", opacity: 0.6, marginTop: 2 }}>
            {map.name} · {map.subtitle}
          </div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            take position — weapons unlock in {formatCountdown(roomState.phaseEndsAt, now)}
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.65, marginTop: 6, letterSpacing: "0.14em" }}>
            [B] ARMORY · [G] FRAG
          </div>
        </div>
      )}

      {roomState?.roundPhase === "round-end" && (
        <div
          style={{
            position: "fixed",
            top: "30%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            pointerEvents: "none",
            userSelect: "none",
          }}
          data-testid="round-end-banner"
        >
          <div style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "0.12em" }}>
            {roomState.lastRoundWinner === null
              ? "ROUND DRAW"
              : self && roomState.lastRoundWinner === self.team
                ? "YOUR TEAM TAKES THE ROUND"
                : `TEAM ${roomState.lastRoundWinner} TAKES THE ROUND`}
          </div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            next round in {formatCountdown(roomState.phaseEndsAt, now)}
          </div>
        </div>
      )}

      {selfDead && inCombatWindow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "rgba(0,0,0,0.45)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            pointerEvents: "none",
            userSelect: "none",
          }}
          data-testid="death-overlay"
        >
          <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "0.18em" }}>ELIMINATED</div>
          <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>spectating until the next round</div>
        </div>
      )}

      <button
        type="button"
        onClick={onPauseClick}
        data-testid="pause-button"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          fontFamily: "system-ui, sans-serif",
          fontSize: "0.85rem",
          padding: "6px 12px",
          background: "rgba(0,0,0,0.45)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        ⏸ Pause
      </button>

      {liveFeed.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: 56,
            right: 16,
            color: "white",
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.85rem",
            textAlign: "right",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
            pointerEvents: "none",
            userSelect: "none",
          }}
          data-testid="kill-feed"
        >
          {liveFeed.map((e) => (
            <div key={e.key} style={{ marginBottom: 3, opacity: 0.9 }}>
              {e.head && <span style={{ color: "#ffd76a" }}>◎ </span>}
              {e.text}
            </div>
          ))}
        </div>
      )}

      {self && (self.perkTier ?? 0) > 0 && (
        <div
          data-testid="perk-badge"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 70,
            transform: "translateX(-50%)",
            padding: "3px 11px",
            borderRadius: 999,
            background: "rgba(217,164,65,0.16)",
            border: "1px solid rgba(255,200,90,0.5)",
            color: "#ffd76a",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "0.62rem",
            letterSpacing: "0.14em",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          ⚡ {PERK_LABELS[self.perkTier ?? 0]}
        </div>
      )}

      {self && (
        <div
          style={{
            ...HUD_PANEL,
            position: "fixed",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            width: 232,
            pointerEvents: "none",
            userSelect: "none",
          }}
          data-testid="hp-bar"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={HUD_LABEL}>HEALTH</span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: "1rem",
                fontWeight: 700,
                color: self.hp > 30 ? "#e8ebee" : "#ff786e",
              }}
            >
              {self.hp}
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, self.hp))}%`,
                height: "100%",
                background: self.hp > 30 ? "rgba(240,244,248,0.92)" : "rgba(255,120,110,0.95)",
                transition: "width 180ms ease-out, background 180ms ease-out",
              }}
            />
          </div>
        </div>
      )}

      {weapon && !selfDead && weapon.active.ammo === 0 && weapon.active.phase !== "reloading" && (
        <div
          style={{
            position: "fixed",
            top: "58%",
            left: "50%",
            transform: "translateX(-50%)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.95rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            animation: "stickfps-pulse 0.9s ease-in-out infinite",
            pointerEvents: "none",
            userSelect: "none",
          }}
          data-testid="reload-hint"
        >
          [R] RELOAD
        </div>
      )}

      {weapon && (
        <div
          style={{
            ...HUD_PANEL,
            position: "fixed",
            left: 16,
            bottom: 16,
            padding: "8px 10px",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {ALL_WEAPON_IDS.filter((id) => self?.owned?.includes(id) ?? true).map((id) => {
            const isActive = id === weapon.activeWeaponId;
            const state = weapon.states[id];
            return (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "1px 6px",
                  borderLeft: `2px solid ${isActive ? "#e6b455" : "transparent"}`,
                  opacity: isActive ? 1 : 0.45,
                  marginBottom: 1,
                }}
              >
                <span style={{ ...HUD_LABEL, fontSize: "0.6rem", width: 12 }}>{WEAPON_HOTKEYS[id]}</span>
                <span style={{ fontSize: isActive ? "0.98rem" : "0.82rem", fontWeight: isActive ? 700 : 500, flex: 1 }}>
                  {WEAPONS[id].label}
                </span>
                <span style={{ fontFamily: MONO, fontSize: "0.82rem", color: state.ammo === 0 ? "#ff786e" : "#cfe0f0" }}>
                  {state.ammo}/{WEAPONS[id].maxAmmo}
                </span>
                {isActive && state.phase !== "idle" && (
                  <span style={{ ...HUD_LABEL, fontSize: "0.55rem" }}>{state.zoomed ? "ZOOM" : state.phase.toUpperCase()}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {self && (
        <div
          style={{
            ...HUD_PANEL,
            position: "fixed",
            right: 16,
            bottom: 16,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <span style={HUD_LABEL}>FUNDS</span>
          <span style={{ fontFamily: MONO, fontSize: "1.1rem", fontWeight: 700, color: "#8fd97f" }}>${self.money}</span>
        </div>
      )}

      {self && self.hp > 0 && (
        <div
          data-testid="grenade-indicator"
          data-ready={grenadeReady ? "true" : undefined}
          style={{
            ...HUD_PANEL,
            position: "fixed",
            right: 16,
            bottom: 62,
            width: 132,
            padding: "6px 10px",
            pointerEvents: "none",
            userSelect: "none",
            opacity: grenadeReady ? 1 : 0.72,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={HUD_LABEL}>⦿ FRAG</span>
            <span style={{ fontFamily: MONO, fontSize: "0.72rem", fontWeight: 700, color: grenadeReady ? "#8fd97f" : "#cfe0f0" }}>
              {grenadeReady ? "[G]" : `${Math.ceil(grenadeCdMs / 1000)}s`}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.round(grenadeFrac * 100)}%`,
                height: "100%",
                background: grenadeReady ? "rgba(143,217,127,0.95)" : "rgba(230,180,85,0.9)",
                transition: "width 220ms linear",
              }}
            />
          </div>
        </div>
      )}

      {scoreboardOpen && roomState && <Scoreboard roomState={roomState} selfId={selfId} />}

      <style>{`
        @keyframes stickfps-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes stickfps-dmg {
          0% { opacity: 0; transform: translate(-50%, 8px) scale(0.7); }
          18% { opacity: 1; transform: translate(-50%, 0) scale(1.08); }
          40% { transform: translate(-50%, -8px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -40px) scale(1); }
        }
        @keyframes stickfps-kill {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          12% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
          22% { transform: translate(-50%, -50%) scale(1); }
          72% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes stickfps-streak {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes stickfps-lowhp { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
      `}</style>
    </>
  );
}

const CH_ARM_LEN = 7;
const CH_ARM_HALF = CH_ARM_LEN / 2;

/**
 * Dynamic four-arm reticle with a center dot. The arm gap expands with movement
 * and each shot (read from the crosshairBloom bus via rAF, so no re-render), so
 * the reticle mirrors how accurate a shot would be right now — tight when still,
 * bloomed when running or spraying.
 */
function Crosshair() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      rootRef.current?.style.setProperty("--g", `${readCrosshairGap()}px`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const base: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 0 2px rgba(0,0,0,0.95)",
    pointerEvents: "none",
  };
  const offset = `calc(var(--g, 4px) + ${CH_ARM_HALF}px)`;
  return (
    <div ref={rootRef} data-testid="crosshair">
      <div style={{ ...base, width: 2, height: 2, transform: "translate(-50%, -50%)" }} />
      <div style={{ ...base, width: 2, height: CH_ARM_LEN, transform: `translate(-50%, -50%) translateY(calc(${offset} * -1))` }} />
      <div style={{ ...base, width: 2, height: CH_ARM_LEN, transform: `translate(-50%, -50%) translateY(${offset})` }} />
      <div style={{ ...base, width: CH_ARM_LEN, height: 2, transform: `translate(-50%, -50%) translateX(calc(${offset} * -1))` }} />
      <div style={{ ...base, width: CH_ARM_LEN, height: 2, transform: `translate(-50%, -50%) translateX(${offset})` }} />
    </div>
  );
}

/** Four diagonal ticks shown when a shot connects — gold for a headshot, red and larger for the lethal blow. */
function Hitmarker({ zone, lethal }: { zone: HitZone; lethal: boolean }) {
  const head = zone === "head";
  const color = lethal ? "rgba(255,72,52,0.98)" : head ? "rgba(255,215,106,0.98)" : "rgba(255,255,255,0.95)";
  const spread = lethal ? 12 : head ? 10 : 8;
  const armLen = lethal ? 14 : head ? 12 : 10;
  const arm = {
    position: "fixed" as const,
    top: "50%",
    left: "50%",
    width: armLen,
    height: lethal ? 3 : 2,
    background: color,
    boxShadow: `0 0 ${lethal ? 5 : 2}px rgba(0,0,0,0.9)`,
    pointerEvents: "none" as const,
  };
  const offsets = [
    { rotate: 45, x: -spread - 4, y: -spread },
    { rotate: -45, x: spread - 4, y: -spread },
    { rotate: -45, x: -spread - 4, y: spread - 1 },
    { rotate: 45, x: spread - 4, y: spread - 1 },
  ];
  return (
    <div data-testid="hitmarker" data-headshot={head ? "true" : undefined} data-lethal={lethal ? "true" : undefined}>
      {offsets.map((o, i) => (
        <div key={i} style={{ ...arm, transform: `translate(${o.x}px, ${o.y}px) rotate(${o.rotate}deg)` }} />
      ))}
    </div>
  );
}

/** Dark vignette pulse when the local player takes a confirmed hit. */
function DamageFlash() {
  return (
    <div
      data-testid="damage-flash"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background: "radial-gradient(circle at 50% 50%, transparent 40%, rgba(120,10,10,0.55) 100%)",
      }}
    />
  );
}

/** Floating damage numbers by the crosshair — they rise and fade; gold + bigger for a headshot. */
function DamageNumbers({ items }: { items: DamageNumber[] }) {
  return (
    <div data-testid="damage-numbers" style={{ position: "fixed", top: "50%", left: "50%", pointerEvents: "none", userSelect: "none" }}>
      {items.map((d) => (
        <div
          key={d.key}
          style={{
            position: "absolute",
            left: d.x,
            top: -14,
            transform: "translate(-50%, 0)",
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: d.head ? "1.35rem" : "1.05rem",
            color: d.head ? "#ffd76a" : "#ffffff",
            textShadow: "0 2px 6px rgba(0,0,0,0.9)",
            animation: "stickfps-dmg 0.9s ease-out forwards",
            whiteSpace: "nowrap",
          }}
        >
          {d.value}
          {d.head && <span style={{ fontSize: "0.62rem", marginLeft: 3, letterSpacing: "0.06em" }}>HS</span>}
        </div>
      ))}
    </div>
  );
}

/** Center-screen call-out when the local player scores a kill. */
function KillBanner({ name }: { name: string }) {
  return (
    <div
      data-testid="kill-banner"
      style={{
        position: "fixed",
        top: "38%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
        pointerEvents: "none",
        userSelect: "none",
        animation: "stickfps-kill 1.4s ease-out forwards",
      }}
    >
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          fontWeight: 800,
          letterSpacing: "0.16em",
          fontSize: "1.15rem",
          color: "#ff8a3c",
          textShadow: "0 2px 8px rgba(0,0,0,0.9)",
        }}
      >
        ✖ ELIMINATED
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: "0.85rem",
          letterSpacing: "0.1em",
          color: "#e8ebee",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          marginTop: 2,
        }}
      >
        {name.toUpperCase()}
      </div>
    </div>
  );
}

/** Big gold milestone flash for a 2+ killstreak (DOUBLE KILL, RAMPAGE, …). */
function KillstreakBadge({ label }: { label: string }) {
  return (
    <div
      data-testid="killstreak-badge"
      style={{
        position: "fixed",
        top: "30%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontFamily: "system-ui, sans-serif",
        fontWeight: 900,
        letterSpacing: "0.22em",
        fontSize: "1.5rem",
        color: "#ffd76a",
        textShadow: "0 0 18px rgba(255,180,60,0.55), 0 2px 8px rgba(0,0,0,0.9)",
        pointerEvents: "none",
        userSelect: "none",
        animation: "stickfps-streak 1.6s ease-out forwards",
      }}
    >
      {label}
    </div>
  );
}

/** Pulsing red screen edge while the local player is critically wounded (pairs with the heartbeat audio). */
function LowHpVignette() {
  return (
    <div
      aria-hidden
      data-testid="low-hp-vignette"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(150,12,12,0.42) 100%)",
        animation: "stickfps-lowhp 1s ease-in-out infinite",
      }}
    />
  );
}

/** Tab-held scoreboard: both teams' rosters with K/D, sorted by kills, self highlighted. */
function Scoreboard({ roomState, selfId }: { roomState: RoomState; selfId: string | null }) {
  const selfTeam = roomState.players.find((p) => p.id === selfId)?.team ?? null;

  const column = (team: Team) => {
    const color = teamColor(team, selfTeam);
    const rows = roomState.players
      .filter((p) => p.team === team)
      .sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0));
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottom: `2px solid ${color}`,
            paddingBottom: 6,
            marginBottom: 6,
          }}
        >
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 800, letterSpacing: "0.12em", color }}>
              TEAM {team}
              {team === selfTeam ? " · YOU" : ""}
            </span>
            <span style={{ fontSize: "0.56rem", letterSpacing: "0.14em", color, opacity: 0.7 }}>{FACTIONS[team].name}</span>
          </span>
          <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: "1.15rem", color }}>{roomState.teamWins[team]}</span>
        </div>
        <div style={{ ...HUD_LABEL, display: "flex", padding: "0 4px 4px" }}>
          <span style={{ flex: 1 }}>PLAYER</span>
          <span style={{ width: 32, textAlign: "right" }}>K</span>
          <span style={{ width: 32, textAlign: "right" }}>D</span>
        </div>
        {rows.map((p) => {
          const isSelf = p.id === selfId;
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "3px 4px",
                borderRadius: 4,
                background: isSelf ? "rgba(255,255,255,0.09)" : "transparent",
                opacity: p.hp <= 0 ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: isSelf ? 700 : 500,
                }}
              >
                {p.name}
                {isSelf ? " (you)" : ""}
              </span>
              <span style={{ width: 32, textAlign: "right", fontFamily: MONO }}>{p.kills ?? 0}</span>
              <span style={{ width: 32, textAlign: "right", fontFamily: MONO, opacity: 0.65 }}>{p.deaths ?? 0}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      data-testid="scoreboard"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 5,
      }}
    >
      <div style={{ ...HUD_PANEL, width: "min(680px, 92vw)", padding: 20, background: "rgba(10,12,14,0.85)" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, letterSpacing: "0.2em", fontSize: "1.05rem" }}>SCOREBOARD</div>
          <div style={{ ...HUD_LABEL, marginTop: 2 }}>
            ROUND {roomState.roundNumber} · {roomState.roundPhase.toUpperCase()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {column("A")}
          {column("B")}
        </div>
      </div>
    </div>
  );
}

/** Kar98 ADS: a gapped reticle plus a dark tunnel vignette, standing in for an actual scope lens. */
function ScopeReticle() {
  const gap = 14;
  const length = 22;
  const thickness = 2;
  const lineBase = {
    position: "fixed" as const,
    top: "50%",
    left: "50%",
    background: "rgba(230,230,230,0.9)",
    boxShadow: "0 0 2px rgba(0,0,0,0.9)",
    pointerEvents: "none" as const,
  };

  return (
    <div data-testid="scope-reticle">
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(circle at 50% 50%, transparent 0 230px, rgba(0,0,0,0.92) 300px)",
        }}
      />
      <div style={{ ...lineBase, width: thickness, height: length, transform: `translate(-50%, calc(-50% - ${gap}px))` }} />
      <div style={{ ...lineBase, width: thickness, height: length, transform: `translate(-50%, calc(-50% + ${gap}px))` }} />
      <div style={{ ...lineBase, width: length, height: thickness, transform: `translate(calc(-50% - ${gap}px), -50%)` }} />
      <div style={{ ...lineBase, width: length, height: thickness, transform: `translate(calc(-50% + ${gap}px), -50%)` }} />
    </div>
  );
}
