import { useState } from "react";
import type { UseAuthResult } from "../net/useAuth";
import type { UseNetworkResult } from "../net/useNetwork";
import type { RoomPlayerSummary } from "../net/messages";
import { BRIEFING_LINES, FACTIONS, SETTING_BLURB } from "../game/lore";
import { getMapTheme } from "../game/maps";

export interface LobbyProps {
  auth: UseAuthResult;
  net: UseNetworkResult;
}

// Procedural film-grain: an inline SVG turbulence data-URI (no asset file), drifted
// by the keyframes below so the noir backdrop breathes instead of sitting dead-flat.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Amber status dot for a good state, muted for pending, red for error/not-configured. */
function statusColor(state: string): string {
  if (state === "signed-in" || state === "connected") return "#6ec96e";
  if (state === "error" || state === "not-configured") return "#e0655a";
  return "#d9a441";
}

export function Lobby({ auth, net }: LobbyProps) {
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);

  const canAct = auth.status === "signed-in" && net.status === "connected";
  const connecting = !canAct && auth.status !== "error" && auth.status !== "not-configured" && !net.error;
  const teamA = net.roomState?.players.filter((p) => p.team === "A") ?? [];
  const teamB = net.roomState?.players.filter((p) => p.team === "B") ?? [];
  const isHost = !!net.roomState && net.roomState.hostId === net.selfId;
  // Active map — falls back to the default before a room exists; the host can
  // cycle it from the lobby (server-authoritative, broadcast to everyone).
  const map = getMapTheme(net.roomState?.mapId);

  const copyCode = () => {
    const code = net.roomState?.code;
    if (!code) return;
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };

  return (
    <div className="lb-root">
      <div className="lb-grain" />
      <div className="lb-scan" />
      <div className="lb-vignette" />

      <div className="lb-stage">
        <header className="lb-brand">
          <BrandMark />
          <div className="lb-wordmark">
            STICK<span className="lb-accent">FPS</span>
          </div>
          <div className="lb-tagline">FIVE VERSUS FIVE · {map.name}</div>
        </header>

        <p className="lb-blurb">{SETTING_BLURB}</p>

        <div className="lb-status">
          <span className="lb-dot" style={{ background: statusColor(auth.status) }} />
          <span>
            auth: {auth.status}
            {auth.error ? ` — ${auth.error}` : ""}
          </span>
          <span className="lb-status-sep">·</span>
          <span className="lb-dot" style={{ background: statusColor(net.status) }} />
          <span>
            net: {net.status}
            {net.error ? ` — ${net.error}` : ""}
          </span>
        </div>

        {net.roomState ? (
          <section className="lb-card lb-rise">
            <div className="lb-room-head">
              <span className="lb-kicker">ROOM CODE</span>
              <button type="button" className="lb-code" onClick={copyCode} title="Click to copy">
                <strong data-testid="room-code">{net.roomState.code}</strong>
                <span className="lb-copy">{copied ? "COPIED" : "COPY"}</span>
              </button>
              <span className="lb-hint">share this code so your squad can join</span>
            </div>

            <div className="lb-rosters">
              <RosterColumn title="TEAM A" faction={FACTIONS.A.name} players={teamA} selfId={net.selfId} hostId={net.roomState.hostId} testId="roster-a" />
              <div className="lb-versus">VS</div>
              <RosterColumn title="TEAM B" faction={FACTIONS.B.name} players={teamB} selfId={net.selfId} hostId={net.roomState.hostId} testId="roster-b" />
            </div>

            {isHost ? (
              <>
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  style={{ padding: "12px 0" }}
                  onClick={net.cycleMap}
                  data-testid="cycle-map"
                >
                  ⟳ MAP: {map.name}
                </button>
                <button
                  type="button"
                  className="lb-btn lb-btn-ghost"
                  style={{ padding: "12px 0" }}
                  onClick={net.addBots}
                  disabled={(net.roomState?.players.length ?? 0) >= 10}
                  data-testid="add-bots"
                >
                  + FILL WITH BOTS
                </button>
                <button type="button" className="lb-btn lb-btn-primary" onClick={net.startMatch} data-testid="start-match">
                  START MATCH
                </button>
              </>
            ) : (
              <div className="lb-waiting">
                <span className="lb-spinner" /> waiting for host to start…
              </div>
            )}
          </section>
        ) : (
          <section className="lb-card lb-rise">
            {auth.status === "not-configured" ? (
              <div className="lb-notice">
                <div className="lb-notice-title">AUTH NOT CONFIGURED</div>
                <div className="lb-hint">Set Supabase keys in client/.env to enable matchmaking.</div>
              </div>
            ) : (
              <>
                <div className="lb-briefing">
                  <div className="lb-briefing-title">◆ {map.name} — {map.subtitle}</div>
                  {BRIEFING_LINES.map((line, i) => (
                    <div key={i} className="lb-briefing-line">
                      {line}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="lb-btn lb-btn-primary"
                  onClick={net.createRoom}
                  disabled={!canAct}
                >
                  CREATE ROOM
                </button>

                <div className="lb-divider">
                  <span>OR JOIN A ROOM</span>
                </div>

                <div className="lb-join">
                  <input
                    className="lb-input"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE"
                    maxLength={6}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="lb-btn lb-btn-ghost"
                    onClick={() => net.joinRoom(codeInput)}
                    disabled={!canAct || codeInput.length !== 6}
                  >
                    JOIN
                  </button>
                </div>

                {connecting && (
                  <div className="lb-waiting">
                    <span className="lb-spinner" /> establishing secure session…
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <footer className="lb-foot">anonymous session · server-authoritative · WASD to move · click to lock aim</footer>
      </div>

      <style>{LOBBY_CSS}</style>
    </div>
  );
}

/** Stick figure inside a reticle — the game's identity as a small monochrome mark. */
function BrandMark() {
  return (
    <svg className="lb-mark" width="58" height="58" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="27" fill="none" stroke="#d9a441" strokeWidth="1.4" opacity="0.6" />
      {[
        [32, 3, 32, 11],
        [32, 53, 32, 61],
        [3, 32, 11, 32],
        [53, 32, 61, 32],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d9a441" strokeWidth="1.4" opacity="0.6" />
      ))}
      <g stroke="#e8ebee" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <circle cx="32" cy="21" r="4" fill="#e8ebee" stroke="none" />
        <line x1="32" y1="25" x2="32" y2="40" />
        <line x1="32" y1="29" x2="24" y2="35" />
        <line x1="32" y1="29" x2="41" y2="33" />
        <line x1="32" y1="40" x2="26" y2="49" />
        <line x1="32" y1="40" x2="38" y2="49" />
      </g>
    </svg>
  );
}

interface RosterColumnProps {
  title: string;
  faction: string;
  players: RoomPlayerSummary[];
  selfId: string | null;
  hostId: string;
  testId: string;
}

function RosterColumn({ title, faction, players, selfId, hostId, testId }: RosterColumnProps) {
  const slots = Math.max(5, players.length);
  return (
    <div className="lb-team" data-testid={testId}>
      <h3 className="lb-team-title">
        {title} <span className="lb-team-count">{players.length}/5</span>
      </h3>
      <div className="lb-faction">{faction}</div>
      <ul className="lb-team-list">
        {players.map((p) => (
          <li key={p.id} className="lb-player" data-testid="roster-player">
            <span className="lb-avatar" />
            {p.name}
            {p.id === selfId ? " (you)" : ""}
            {p.id === hostId ? " (host)" : ""}
          </li>
        ))}
        {Array.from({ length: slots - players.length }).map((_, i) => (
          <li key={`empty-${i}`} className="lb-player lb-player-empty">
            <span className="lb-avatar lb-avatar-empty" />
            open slot
          </li>
        ))}
      </ul>
    </div>
  );
}

const LOBBY_CSS = `
.lb-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;
  background:radial-gradient(130% 100% at 50% 8%,#1b1f24 0%,#0c0e11 62%,#08090b 100%);
  color:#e8ebee;font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.lb-grain{position:absolute;inset:-60%;background-image:${GRAIN};opacity:0.045;pointer-events:none;
  animation:lb-grain 1.1s steps(4) infinite}
@keyframes lb-grain{0%{transform:translate(0,0)}25%{transform:translate(-4%,3%)}50%{transform:translate(3%,-2%)}
  75%{transform:translate(-2%,-3%)}100%{transform:translate(2%,2%)}}
.lb-scan{position:absolute;inset:0;pointer-events:none;opacity:0.35;mix-blend-mode:overlay;
  background:repeating-linear-gradient(0deg,rgba(255,255,255,0.03) 0 1px,transparent 1px 3px)}
.lb-vignette{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 240px 60px rgba(0,0,0,0.75)}
.lb-stage{position:relative;z-index:1;width:min(440px,92vw);display:flex;flex-direction:column;align-items:center;gap:22px}

.lb-brand{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.lb-mark{filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6));animation:lb-fade 0.7s ease both}
.lb-wordmark{font-size:2.9rem;font-weight:800;letter-spacing:0.14em;line-height:1;
  text-shadow:0 2px 14px rgba(0,0,0,0.7)}
.lb-accent{color:#d9a441}
.lb-tagline{font-size:0.68rem;letter-spacing:0.42em;color:rgba(232,235,238,0.5);padding-left:0.42em}

.lb-status{display:flex;align-items:center;gap:8px;font-size:0.72rem;letter-spacing:0.04em;
  color:rgba(232,235,238,0.6);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lb-dot{width:7px;height:7px;border-radius:50%;box-shadow:0 0 7px currentColor;flex:none}
.lb-status-sep{opacity:0.4;margin:0 2px}

.lb-card{width:100%;box-sizing:border-box;padding:26px 24px;display:flex;flex-direction:column;gap:16px;
  background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015));
  border:1px solid rgba(255,255,255,0.09);border-radius:14px;
  box-shadow:0 24px 60px -20px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.06)}
.lb-rise{animation:lb-rise 0.55s cubic-bezier(0.2,0.8,0.2,1) both}

.lb-btn{appearance:none;border:none;border-radius:9px;font-family:inherit;font-weight:700;
  letter-spacing:0.12em;cursor:pointer;transition:transform 0.12s ease,box-shadow 0.15s ease,background 0.15s ease,opacity 0.15s}
.lb-btn:disabled{opacity:0.38;cursor:not-allowed}
.lb-btn-primary{padding:14px 0;font-size:1rem;color:#171310;
  background:linear-gradient(180deg,#e6b455,#d9a441);box-shadow:0 8px 22px -8px rgba(217,164,65,0.7)}
.lb-btn-primary:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 12px 26px -8px rgba(217,164,65,0.85)}
.lb-btn-primary:not(:disabled):active{transform:translateY(0)}
.lb-btn-ghost{padding:0 20px;font-size:0.85rem;color:#e8ebee;background:rgba(255,255,255,0.06);
  border:1px solid rgba(255,255,255,0.16)}
.lb-btn-ghost:not(:disabled):hover{background:rgba(255,255,255,0.12);border-color:rgba(217,164,65,0.5)}

.lb-divider{display:flex;align-items:center;gap:12px;color:rgba(232,235,238,0.4);
  font-size:0.64rem;letter-spacing:0.24em}
.lb-divider::before,.lb-divider::after{content:"";flex:1;height:1px;background:rgba(255,255,255,0.1)}

.lb-join{display:flex;gap:10px}
.lb-input{flex:1;min-width:0;padding:13px 14px;border-radius:9px;background:rgba(0,0,0,0.35);
  border:1px solid rgba(255,255,255,0.14);color:#e8ebee;text-align:center;text-transform:uppercase;
  letter-spacing:0.42em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.05rem;outline:none;
  transition:border-color 0.15s,box-shadow 0.15s}
.lb-input::placeholder{color:rgba(232,235,238,0.3);letter-spacing:0.2em}
.lb-input:focus{border-color:#d9a441;box-shadow:0 0 0 3px rgba(217,164,65,0.18)}

.lb-waiting{display:flex;align-items:center;justify-content:center;gap:9px;
  font-size:0.8rem;color:rgba(232,235,238,0.6)}
.lb-spinner{width:13px;height:13px;border-radius:50%;border:2px solid rgba(217,164,65,0.25);
  border-top-color:#d9a441;animation:lb-spin 0.7s linear infinite}

.lb-notice{text-align:center;display:flex;flex-direction:column;gap:6px;padding:6px 0}
.lb-notice-title{font-weight:700;letter-spacing:0.14em;color:#e0655a}
.lb-hint{font-size:0.72rem;color:rgba(232,235,238,0.5);letter-spacing:0.02em}

.lb-room-head{display:flex;flex-direction:column;align-items:center;gap:6px}
.lb-kicker{font-size:0.62rem;letter-spacing:0.34em;color:rgba(232,235,238,0.45)}
.lb-code{display:inline-flex;align-items:center;gap:12px;background:none;border:none;cursor:pointer;color:inherit}
.lb-code strong{font-size:2.1rem;letter-spacing:0.34em;padding-left:0.34em;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#e8ebee;text-shadow:0 2px 10px rgba(0,0,0,0.6)}
.lb-copy{font-size:0.6rem;letter-spacing:0.12em;padding:3px 7px;border-radius:5px;
  background:rgba(217,164,65,0.16);color:#d9a441;border:1px solid rgba(217,164,65,0.35)}

.lb-rosters{display:flex;align-items:stretch;gap:12px}
.lb-team{flex:1;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.07);
  border-radius:10px;padding:12px 12px 14px}
.lb-team-title{margin:0 0 10px;font-size:0.74rem;letter-spacing:0.16em;color:rgba(232,235,238,0.85);
  display:flex;justify-content:space-between;align-items:center}
.lb-team-count{font-size:0.66rem;color:rgba(232,235,238,0.45);font-family:ui-monospace,monospace}
.lb-team-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.lb-player{display:flex;align-items:center;gap:9px;font-size:0.86rem;color:#e8ebee}
.lb-player-empty{color:rgba(232,235,238,0.28);font-style:italic}
.lb-avatar{width:8px;height:8px;border-radius:2px;background:#d9a441;box-shadow:0 0 6px rgba(217,164,65,0.5);flex:none}
.lb-avatar-empty{background:none;border:1px solid rgba(255,255,255,0.15);box-shadow:none}
.lb-versus{align-self:center;font-size:0.7rem;font-weight:700;letter-spacing:0.1em;color:rgba(232,235,238,0.35)}

.lb-foot{font-size:0.64rem;letter-spacing:0.1em;color:rgba(232,235,238,0.32);text-align:center;
  max-width:340px;line-height:1.6}

@keyframes lb-spin{to{transform:rotate(360deg)}}
@keyframes lb-fade{from{opacity:0}to{opacity:1}}
@keyframes lb-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

.lb-blurb{max-width:410px;text-align:center;font-size:0.76rem;line-height:1.65;
  color:rgba(232,235,238,0.55);margin:-6px 0 0;letter-spacing:0.01em}
.lb-faction{font-size:0.6rem;letter-spacing:0.18em;color:rgba(217,164,65,0.8);margin:-6px 0 8px}
.lb-briefing{display:flex;flex-direction:column;gap:5px;padding:12px 14px;border-radius:9px;
  background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06)}
.lb-briefing-title{font-size:0.66rem;letter-spacing:0.14em;color:#d9a441}
.lb-briefing-line{font-size:0.72rem;line-height:1.5;color:rgba(232,235,238,0.6)}
`;
