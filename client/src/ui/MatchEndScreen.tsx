import type { CSSProperties } from "react";
import type { RoomState } from "../net/messages";

export interface MatchEndScreenProps {
  roomState: RoomState;
  selfId: string | null;
  onLeaveMatch: () => void;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  color: "white",
  fontFamily: "system-ui, sans-serif",
  background: "rgba(8, 8, 10, 0.9)",
};

/** Shown when roundPhase hits "match-end" — the winner is whoever leads the round-win tally. */
export function MatchEndScreen({ roomState, selfId, onLeaveMatch }: MatchEndScreenProps) {
  const { teamWins } = roomState;
  const selfTeam = roomState.players.find((p) => p.id === selfId)?.team ?? null;

  let headline = "DRAW";
  let sub = "dead even after all rounds";
  if (teamWins.A !== teamWins.B) {
    const winner = teamWins.A > teamWins.B ? "A" : "B";
    headline = selfTeam ? (selfTeam === winner ? "VICTORY" : "DEFEAT") : `TEAM ${winner} WINS`;
    sub = `Team ${winner} takes the match`;
  }

  return (
    <div style={overlayStyle} data-testid="match-end">
      <div style={{ fontSize: "2.6rem", fontWeight: 800, letterSpacing: "0.2em" }}>{headline}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, letterSpacing: "0.06em" }} data-testid="final-score">
        A {teamWins.A} — {teamWins.B} B
      </div>
      <div style={{ fontSize: "0.9rem", opacity: 0.7 }}>{sub}</div>
      <button
        type="button"
        onClick={onLeaveMatch}
        data-testid="leave-match-end"
        style={{ marginTop: 18, padding: "10px 34px", fontWeight: 600, cursor: "pointer" }}
      >
        Back to Lobby
      </button>
    </div>
  );
}
