# Spec — Task 2.1: Core 3D & Input

## Scope

Local (non-networked) first-person movement in an empty scene: pointer-lock look, WASD + jump, ground plane, low-poly stickman avatar rendered, fixed 60Hz simulation loop decoupled from render rate. No weapons, no networking — those are Phase 3/4.

## Files

- `client/src/game/loop/useFixedTimestep.ts` — accumulator-based fixed-timestep hook built on R3F's `useFrame`.
- `client/src/game/input/useKeyboardState.ts` — WASD + jump key-state tracker (ref-based, no re-renders).
- `client/src/game/player/playerController.ts` — pure `stepPlayer(state, input, dt) -> state` function: velocity-clamped WASD movement relative to camera yaw, gravity, jump, ground clamp. No React/Three imports — unit-testable in isolation.
- `client/src/game/player/playerController.test.ts` — vitest coverage of clamping, gravity, jump-only-when-grounded, friction.
- `client/src/game/player/PlayerRig.tsx` — R3F component: reads keyboard + camera yaw each fixed step, calls `stepPlayer`, writes result to the camera position.
- `client/src/game/player/Stickman.tsx` — low-poly capsule+limbs avatar component, takes `position`/`rotation` props.
- `client/src/game/Scene.tsx` — ground plane, lighting, a demo `Stickman` instance (stands in for a remote player until Phase 4), `PlayerRig`.
- `client/src/App.tsx` — Canvas + `PointerLockControls` (drei) + click-to-play overlay + `Scene`.

## Interfaces

```ts
interface PlayerState { position: [number, number, number]; velocity: [number, number, number]; onGround: boolean; }
interface InputState { forward: boolean; backward: boolean; left: boolean; right: boolean; jump: boolean; yaw: number; }
function stepPlayer(state: PlayerState, input: InputState, dt: number): PlayerState;
```

This `PlayerState`/`stepPlayer` signature is what the Phase 4 architect spec will reuse for client-side prediction — do not change its shape without updating that spec too.

## Constraints carried over

- C3: simulation must run at a fixed 1/60s step via an accumulator pattern, independent of `useFrame`'s variable delta.
- No per-frame allocation inside `stepPlayer` (new arrays are fine per *step*, not per render frame — render frame and sim step are decoupled by design, so this is within budget; true hot-path pooling constraint (C4) starts to matter in Phase 3/7 for bullets/particles).

## Acceptance criteria

1. `npm run build` (client) succeeds with no TypeScript errors.
2. `npm test` (client) passes, including `playerController.test.ts`.
3. Manual check: `npm run dev`, click to lock pointer, WASD moves the camera, mouse looks around, Space jumps and gravity returns the camera to ground level, speed does not exceed the clamp regardless of diagonal input.
4. A stickman avatar and ground plane are visible in the scene.
5. Simulation step count is stable regardless of monitor refresh rate (verified by inspecting the accumulator loop, not a runtime assertion).

## Open questions

None.
