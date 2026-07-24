import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const DEFAULT_HZ = 60;
const MAX_STEPS_PER_FRAME = 5;

/**
 * Advances `step` at a fixed 1/hz interval using an accumulator, so the
 * simulation rate stays constant regardless of the browser's render rate (C3).
 */
export function useFixedTimestep(step: (dt: number) => void, hz: number = DEFAULT_HZ): void {
  const accumulator = useRef(0);
  const fixedDt = 1 / hz;

  useFrame((_state, delta) => {
    accumulator.current += delta;
    let steps = 0;
    while (accumulator.current >= fixedDt && steps < MAX_STEPS_PER_FRAME) {
      step(fixedDt);
      accumulator.current -= fixedDt;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      accumulator.current = 0;
    }
  });
}
