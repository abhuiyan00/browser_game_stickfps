import { describe, expect, it } from "vitest";
import { PERK_COOLDOWN_MULT, PERK_MOVE_MULT, PERK_RELOAD_MULT, perkTierForStreak } from "./perks";

describe("killstreak perks", () => {
  it("maps streak to tier at the 3- and 5-kill thresholds", () => {
    expect(perkTierForStreak(0)).toBe(0);
    expect(perkTierForStreak(2)).toBe(0);
    expect(perkTierForStreak(3)).toBe(1);
    expect(perkTierForStreak(4)).toBe(1);
    expect(perkTierForStreak(5)).toBe(2);
    expect(perkTierForStreak(12)).toBe(2);
  });

  it("tier 0 is a no-op and higher tiers buff harder", () => {
    expect(PERK_COOLDOWN_MULT[0]).toBe(1);
    expect(PERK_RELOAD_MULT[0]).toBe(1);
    expect(PERK_MOVE_MULT[0]).toBe(1);
    expect(PERK_COOLDOWN_MULT[2]).toBeLessThan(PERK_COOLDOWN_MULT[1]);
    expect(PERK_RELOAD_MULT[2]).toBeLessThan(PERK_RELOAD_MULT[1]);
    expect(PERK_MOVE_MULT[2]).toBeGreaterThan(PERK_MOVE_MULT[1]);
  });
});
