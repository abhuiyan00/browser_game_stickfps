import { useCallback, useState } from "react";

const STORAGE_KEY = "stickfps.sensitivity";
export const DEFAULT_SENSITIVITY = 1;
export const MIN_SENSITIVITY = 0.3;
export const MAX_SENSITIVITY = 3;

function clamp(value: number): number {
  return Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, value));
}

function readStored(): number {
  if (typeof window === "undefined") return DEFAULT_SENSITIVITY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_SENSITIVITY;
}

export interface UseSensitivityResult {
  sensitivity: number;
  setSensitivity: (value: number) => void;
}

/** Mouse-look sensitivity multiplier, persisted across sessions (maps directly to PointerLockControls' `pointerSpeed`). */
export function useSensitivity(): UseSensitivityResult {
  const [sensitivity, setSensitivityState] = useState<number>(readStored);

  const setSensitivity = useCallback((value: number) => {
    const clamped = clamp(value);
    setSensitivityState(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  return { sensitivity, setSensitivity };
}
