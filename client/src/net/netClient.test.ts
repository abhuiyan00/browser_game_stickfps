import { describe, it, expect } from "vitest";
import { reconnectDelay } from "./netClient";

describe("reconnectDelay", () => {
  it("grows exponentially from the base delay", () => {
    // 500 * 2^(attempt-1), plus up to 250ms of jitter.
    expect(reconnectDelay(1)).toBeGreaterThanOrEqual(500);
    expect(reconnectDelay(1)).toBeLessThan(750);
    expect(reconnectDelay(2)).toBeGreaterThanOrEqual(1000);
    expect(reconnectDelay(2)).toBeLessThan(1250);
    expect(reconnectDelay(3)).toBeGreaterThanOrEqual(2000);
    expect(reconnectDelay(3)).toBeLessThan(2250);
  });

  it("caps the backoff so retries never stall out", () => {
    // The raw delay passes the 8s cap at attempt 5 and stays capped forever after.
    for (const attempt of [5, 8, 20, 100]) {
      const d = reconnectDelay(attempt);
      expect(d).toBeGreaterThanOrEqual(8000);
      expect(d).toBeLessThan(8250);
    }
  });
});
