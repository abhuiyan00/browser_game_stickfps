# Spec — Task 3.1: Weapons & Ballistics

## Scope

Client-side weapon state machine (ammo, cooldown, reload, zoom) and fire-request emission. This task does **not** resolve hits — the client only ever sends a `FireRequest`; the server (Phase 4) independently validates cooldown/ammo and performs the authoritative raycast. The client-side ammo/cooldown tracked here is a *cosmetic/predictive* mirror for UI responsiveness, not a trust boundary — Phase 4's server combat module keeps its own authoritative copy per player and does not trust the client's.

## Files

- `client/src/game/weapons/weaponDefs.ts` — Revolver (6 rounds, 0.5s cooldown) and Kar98 (5 rounds, 1.5s cooldown, 75°→30° zoom) definitions.
- `client/src/game/weapons/weaponStateMachine.ts` — pure functions: `createWeaponState`, `canFire`, `requestFire`, `requestReload`, `toggleZoom`, `stepWeapon(state, dt)`. No React/Three imports — unit-testable.
- `client/src/game/weapons/weaponStateMachine.test.ts` — vitest coverage.
- `client/src/game/weapons/useWeapon.ts` — hook: fixed-timestep cooldown/reload ticking, exposes `fire()/reload()/zoom()`, calls an injected `onFireRequest` callback (the network layer, wired in Phase 4) with a `FireRequest`. Side effects live in the callback, not inside a `setState` updater, so React StrictMode's double-invoke of updaters can't cause a duplicate network send.
- `client/src/net/messages.ts` — client-side `FireRequest` shape (mirrors the SRS §6 contract; Phase 4 formalizes the server-side canonical copy).

## Interfaces

```ts
type WeaponId = "revolver" | "kar98";
interface WeaponState { weaponId: WeaponId; ammo: number; phase: "idle" | "cooldown" | "reloading"; cooldownRemaining: number; reloadRemaining: number; zoomed: boolean; }
interface FireRequest { weaponId: WeaponId; origin: [number, number, number]; direction: [number, number, number]; clientTick: number; }
function canFire(state: WeaponState): boolean;
function requestFire(state: WeaponState): WeaponState;
function stepWeapon(state: WeaponState, dt: number): WeaponState;
```

Phase 4's `onFireRequest` handler signature is `(req: FireRequest) => void` — do not change `FireRequest`'s shape without updating the server's combat validation spec too.

## Constraints carried over

- **C1 (hard constraint)**: nothing in this task computes or transmits a hit result, damage, or "did I hit" boolean. Only a fire *request* (intent) is ever sent.
- Deviation from the SRS §6.3 state diagram, noted here for traceability: `zoomed` is modeled as an independent boolean rather than a state competing with Firing/Cooldown/Reloading, so a Kar98 can be fired while zoomed. The diagram's simplification (Zoomed reachable only from Idle) does not reflect this — this spec is the source of truth for implementation.

## Acceptance criteria

1. `npm test` (client) passes, including new weapon-state-machine coverage: ammo decrements on fire, cooldown blocks fire until elapsed, reload refills ammo after its duration, zoom only toggles for weapons with a zoom def.
2. `npm run build` (client) succeeds.
3. Grep confirms no function in `client/src/game/weapons/` returns or transmits a hit/damage value — only `FireRequest` objects leave this module.
4. `fire()` calls `onFireRequest` exactly once per click even under React StrictMode (verified by keeping the network call out of the `setState` updater).

## Open questions

None.
