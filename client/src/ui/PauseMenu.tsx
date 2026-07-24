import type { CSSProperties } from "react";
import { MAX_SENSITIVITY, MIN_SENSITIVITY } from "../settings/useSensitivity";
import { WEAPON_HOTKEYS } from "../game/weapons/weaponDefs";

export interface PauseMenuProps {
  onResume: () => void;
  onLeaveMatch: () => void;
  sensitivity: number;
  onSensitivityChange: (value: number) => void;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  color: "white",
  fontFamily: "system-ui, sans-serif",
  background: "rgba(10, 10, 12, 0.84)",
};

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "stretch",
  minWidth: 280,
  padding: "24px 28px",
  background: "rgba(30, 30, 32, 0.9)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
};

/**
 * A "pause" here only opens a local menu — it doesn't freeze the match for
 * anyone else, since the round loop is server-authoritative (see
 * server/src/rooms/roundLogic.ts). This matches standard tactical-FPS
 * behavior (CS-style Esc menu) rather than a single-player pause.
 */
export function PauseMenu({ onResume, onLeaveMatch, sensitivity, onSensitivityChange }: PauseMenuProps) {
  return (
    // The backdrop itself resumes on click ("click the game to continue" below) — only the
    // panel stops propagation, so its buttons/slider don't also trigger a resume.
    <div style={overlayStyle} data-testid="pause-menu" onClick={onResume}>
      <h2 style={{ margin: 0 }}>Paused</h2>

      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onResume} data-testid="resume-button" style={{ padding: "10px 0", fontWeight: 600 }}>
          Resume
        </button>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.9rem" }}>
          Mouse sensitivity: {sensitivity.toFixed(2)}x
          <input
            type="range"
            min={MIN_SENSITIVITY}
            max={MAX_SENSITIVITY}
            step={0.05}
            value={sensitivity}
            onChange={(e) => onSensitivityChange(Number(e.target.value))}
            data-testid="sensitivity-slider"
          />
        </label>

        <div style={{ fontSize: "0.8rem", opacity: 0.7, lineHeight: 1.5 }}>
          [{WEAPON_HOTKEYS.revolver}] Revolver &nbsp;·&nbsp; [{WEAPON_HOTKEYS.kar98}] Kar98
          <br />
          Left-click fire · Right-click zoom (Kar98) · R reload
        </div>

        <button type="button" onClick={onLeaveMatch} data-testid="leave-match" style={{ padding: "8px 0", opacity: 0.85 }}>
          Leave Match
        </button>
      </div>

      <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>Click Resume or click the game to continue</div>
    </div>
  );
}
