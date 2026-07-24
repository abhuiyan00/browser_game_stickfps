import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode } from "./roomCode";

describe("roomCode", () => {
  it("generates a 6-character code accepted by isValidRoomCode", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("never generates ambiguous characters (0, O, 1, I)", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("rejects codes of the wrong length or containing invalid characters", () => {
    expect(isValidRoomCode("ABC12")).toBe(false);
    expect(isValidRoomCode("ABCDE0")).toBe(false);
    expect(isValidRoomCode("ABCDEF")).toBe(true);
  });
});
