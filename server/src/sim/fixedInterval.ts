export interface FixedIntervalHandle {
  stop: () => void;
}

/**
 * Drift-corrected fixed-rate loop for a long-lived Node process (C3, C5).
 * Uses recursive setTimeout rather than plain setInterval so scheduling drift
 * under event-loop load is corrected rather than accumulated.
 */
export function startFixedInterval(hz: number, onTick: (dt: number) => void): FixedIntervalHandle {
  const stepMs = 1000 / hz;
  const stepSec = 1 / hz;
  let stopped = false;
  let expected = Date.now() + stepMs;
  let timer: ReturnType<typeof setTimeout>;

  function loop(): void {
    if (stopped) return;
    onTick(stepSec);
    const drift = Date.now() - expected;
    expected += stepMs;
    timer = setTimeout(loop, Math.max(0, stepMs - drift));
  }

  timer = setTimeout(loop, stepMs);

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
