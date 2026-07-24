import { afterEach, describe, expect, it } from "vitest";
import { addTrauma, decayTrauma, readTrauma, resetTrauma } from "./screenShake";

afterEach(() => resetTrauma());

describe("screenShake trauma bus", () => {
  it("starts calm", () => {
    expect(readTrauma()).toBe(0);
  });

  it("accumulates trauma and clamps at 1", () => {
    addTrauma(0.3);
    expect(readTrauma()).toBeCloseTo(0.3, 6);
    addTrauma(1);
    expect(readTrauma()).toBe(1);
  });

  it("ignores negative kicks", () => {
    addTrauma(-0.5);
    expect(readTrauma()).toBe(0);
  });

  it("decays toward zero over time and never below it", () => {
    addTrauma(1);
    decayTrauma(0.1);
    expect(readTrauma()).toBeLessThan(1);
    decayTrauma(100);
    expect(readTrauma()).toBe(0);
  });
});
