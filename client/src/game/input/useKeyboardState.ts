import { useEffect, useRef } from "react";

export interface KeyboardState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
}

const INITIAL_STATE: KeyboardState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  crouch: false,
};

function applyKey(state: KeyboardState, code: string, pressed: boolean): void {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      state.forward = pressed;
      break;
    case "KeyS":
    case "ArrowDown":
      state.backward = pressed;
      break;
    case "KeyA":
    case "ArrowLeft":
      state.left = pressed;
      break;
    case "KeyD":
    case "ArrowRight":
      state.right = pressed;
      break;
    case "Space":
      state.jump = pressed;
      break;
    case "ControlLeft":
    case "ControlRight":
    case "KeyC":
      state.crouch = pressed;
      break;
    default:
      break;
  }
}

/** Ref-based key tracker so movement input never triggers a React re-render. */
export function useKeyboardState() {
  const stateRef = useRef<KeyboardState>({ ...INITIAL_STATE });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => applyKey(stateRef.current, e.code, true);
    const onKeyUp = (e: KeyboardEvent) => applyKey(stateRef.current, e.code, false);
    const onBlur = () => {
      stateRef.current = { ...INITIAL_STATE };
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return stateRef;
}
