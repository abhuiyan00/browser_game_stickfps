import { useEffect, useRef } from "react";
import { ALL_WEAPON_IDS, WEAPONS, WEAPON_HOTKEYS, type WeaponId } from "../game/weapons/weaponDefs";
import type { RoomState } from "../net/messages";

export interface BuyMenuProps {
  roomState: RoomState;
  selfId: string | null;
  onBuy: (weaponId: WeaponId) => void;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  pistol: "SIDEARM",
  sniper: "LONG RANGE",
};

/**
 * Buy-phase loadout picker. Purely a UX surface — every purchase is validated
 * server-side (Room.buyWeapon). Shown with the pointer released so its buttons
 * are clickable; number keys buy too, for players who keep their hand on WASD.
 */
export function BuyMenu({ roomState, selfId, onBuy, onClose }: BuyMenuProps) {
  const self = roomState.players.find((p) => p.id === selfId) ?? null;
  const money = self?.money ?? 0;
  const owned = self?.owned ?? ["revolver"];

  // Number-key buys read live money/owned through a ref so the listener subscribes
  // once instead of re-binding every render (owned is a fresh array each time).
  const buyStateRef = useRef({ money, owned, onBuy });
  buyStateRef.current = { money, owned, onBuy };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const id = ALL_WEAPON_IDS.find((w) => WEAPON_HOTKEYS[w] === e.key);
      if (!id) return;
      const def = WEAPONS[id];
      const state = buyStateRef.current;
      if (!state.owned.includes(id) && def.price > 0 && state.money >= def.price) state.onBuy(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div style={overlay} data-testid="buy-menu">
      <div style={panel}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "0.14em" }}>ARMORY</div>
            <div style={{ fontSize: "0.72rem", letterSpacing: "0.2em", color: "rgba(232,235,238,0.5)" }}>
              BUY PHASE · press a number to buy
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#8fd97f" }}>${money}</div>
            <button type="button" onClick={onClose} style={closeBtn}>
              [B] CLOSE
            </button>
          </div>
        </div>

        <div style={grid}>
          {ALL_WEAPON_IDS.map((id) => {
            const def = WEAPONS[id];
            const isOwned = owned.includes(id);
            const free = def.price === 0;
            const affordable = money >= def.price;
            const buyable = !isOwned && !free && affordable;
            const status = free ? "STARTER" : isOwned ? "OWNED" : affordable ? `$${def.price}` : "NO FUNDS";
            const statusColor = free || isOwned ? "#8fd97f" : affordable ? "#e6b455" : "#e0655a";
            return (
              <button
                key={id}
                type="button"
                disabled={!buyable}
                onClick={() => buyable && onBuy(id)}
                style={{
                  ...card,
                  cursor: buyable ? "pointer" : "default",
                  opacity: isOwned || free ? 0.7 : buyable ? 1 : 0.5,
                  borderColor: buyable ? "rgba(217,164,65,0.5)" : "rgba(255,255,255,0.09)",
                }}
                data-testid={`buy-${id}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>{def.label}</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.55 }}>[{WEAPON_HOTKEYS[id]}]</span>
                </div>
                <div style={{ fontSize: "0.62rem", letterSpacing: "0.16em", color: "rgba(232,235,238,0.45)", marginTop: 2 }}>
                  {ROLE_LABEL[def.role]} · {def.maxAmmo} RDS
                </div>
                <div style={{ marginTop: 10, fontSize: "0.85rem", fontWeight: 700, color: statusColor }}>{status}</div>
              </button>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes buy-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(6,7,9,0.55)",
  fontFamily: "system-ui, sans-serif",
  color: "#e8ebee",
  zIndex: 30,
};

const panel: React.CSSProperties = {
  width: "min(720px, 92vw)",
  padding: "22px 24px 26px",
  borderRadius: 14,
  background: "linear-gradient(180deg,rgba(20,23,27,0.96),rgba(12,14,17,0.96))",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)",
  animation: "buy-rise 0.4s cubic-bezier(0.2,0.8,0.2,1) both",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 18,
};

const closeBtn: React.CSSProperties = {
  marginTop: 4,
  fontFamily: "inherit",
  fontSize: "0.68rem",
  letterSpacing: "0.1em",
  padding: "4px 10px",
  background: "rgba(255,255,255,0.06)",
  color: "#e8ebee",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 6,
  cursor: "pointer",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
  gap: 10,
};

const card: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 13px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "#e8ebee",
  fontFamily: "inherit",
};
