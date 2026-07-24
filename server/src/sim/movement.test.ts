import { describe, expect, it } from "vitest";
import {
  ARENA_HALF_EXTENT,
  createInitialMovementState,
  CROUCH_Y,
  GROUND_Y,
  JUMP_SPEED,
  MAX_SPEED,
  MAX_SPEED_CAP,
  stepMovement,
  type MovementInput,
} from "./movement";

const noInput: MovementInput = { forward: false, backward: false, left: false, right: false, jump: false, yaw: 0 };

describe("stepMovement (server-authoritative)", () => {
  it("clamps horizontal speed under diagonal input", () => {
    let state = createInitialMovementState();
    const input: MovementInput = { ...noInput, forward: true, right: true };
    for (let i = 0; i < 200; i++) state = stepMovement(state, input, 1 / 60);
    expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
  });

  it("only allows a jump when grounded", () => {
    const grounded = createInitialMovementState();
    const jumped = stepMovement(grounded, { ...noInput, jump: true }, 1 / 60);
    expect(jumped.onGround).toBe(false);
    expect(jumped.velocity[1]).toBeCloseTo(JUMP_SPEED, 5);

    const stillAirborne = stepMovement({ ...jumped, onGround: false }, { ...noInput, jump: true }, 1 / 60);
    expect(stillAirborne.velocity[1]).toBeLessThan(JUMP_SPEED);
  });

  it("clamps to the ground plane and zeroes vertical velocity on landing", () => {
    let state = { position: [0, 10, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number], onGround: false };
    let steps = 0;
    while (!state.onGround && steps < 1000) {
      state = stepMovement(state, noInput, 1 / 60);
      steps++;
    }
    expect(state.position[1]).toBeCloseTo(GROUND_Y, 5);
    expect(state.velocity[1]).toBe(0);
  });

  it("clamps position to the arena bounds instead of letting players walk out of the map", () => {
    let state = createInitialMovementState([ARENA_HALF_EXTENT - 1, GROUND_Y, 0]);
    const input: MovementInput = { ...noInput, right: true, yaw: 0 }; // +X, straight at the wall
    for (let i = 0; i < 600; i++) state = stepMovement(state, input, 1 / 60);
    expect(state.position[0]).toBeLessThanOrEqual(ARENA_HALF_EXTENT);
    expect(state.position[0]).toBeCloseTo(ARENA_HALF_EXTENT, 5);

    let south = createInitialMovementState([0, GROUND_Y, -ARENA_HALF_EXTENT + 1]);
    const forward: MovementInput = { ...noInput, forward: true, yaw: 0 }; // -Z
    for (let i = 0; i < 600; i++) south = stepMovement(south, forward, 1 / 60);
    expect(south.position[2]).toBeGreaterThanOrEqual(-ARENA_HALF_EXTENT);
  });

  it("produces the same trajectory for the same input sequence (determinism)", () => {
    const input: MovementInput = { ...noInput, forward: true, yaw: 0.4 };
    let a = createInitialMovementState();
    let b = createInitialMovementState();
    for (let i = 0; i < 120; i++) {
      a = stepMovement(a, input, 1 / 60);
      b = stepMovement(b, input, 1 / 60);
    }
    expect(a).toEqual(b);
  });

  it("advances roughly the same distance regardless of tick rate (FPS-independence)", () => {
    const input: MovementInput = { ...noInput, forward: true, yaw: 0.4 };
    // One second of the same held input, integrated at 60Hz vs 120Hz.
    let coarse = createInitialMovementState();
    for (let i = 0; i < 60; i++) coarse = stepMovement(coarse, input, 1 / 60);
    let fine = createInitialMovementState();
    for (let i = 0; i < 120; i++) fine = stepMovement(fine, input, 1 / 120);
    const drift = Math.hypot(coarse.position[0] - fine.position[0], coarse.position[2] - fine.position[2]);
    expect(drift).toBeLessThan(0.15);
  });

  it("keeps slide-hop chains under the hard speed cap while building past walk speed", () => {
    // Start near the far +Z wall moving -Z so the whole chain stays inside the ±24 arena.
    let s = createInitialMovementState([0, GROUND_Y, 22]);
    for (let i = 0; i < 40; i++) s = stepMovement(s, { ...noInput, forward: true, yaw: 0 }, 1 / 60);
    let maxHoriz = 0;
    const track = () => {
      maxHoriz = Math.max(maxHoriz, Math.hypot(s.velocity[0], s.velocity[2]));
    };
    for (let cycle = 0; cycle < 4; cycle++) {
      for (let i = 0; i < 8; i++) {
        s = stepMovement(s, { ...noInput, forward: true, crouch: true, yaw: 0 }, 1 / 60);
        track();
      }
      s = stepMovement(s, { ...noInput, forward: true, crouch: true, jump: true, yaw: 0 }, 1 / 60);
      track();
      let g = 0;
      while (!s.onGround && g < 80) {
        s = stepMovement(s, { ...noInput, forward: true, yaw: 0 }, 1 / 60);
        track();
        g++;
      }
    }
    expect(maxHoriz).toBeLessThanOrEqual(MAX_SPEED_CAP + 1e-6);
    expect(Math.hypot(s.velocity[0], s.velocity[2])).toBeGreaterThan(MAX_SPEED);
  });

  it("lowers the eye height while crouching and restores it when standing", () => {
    let s = createInitialMovementState([0, GROUND_Y, 0]);
    s = stepMovement(s, { ...noInput, crouch: true, yaw: 0 }, 1 / 60);
    expect(s.position[1]).toBeCloseTo(CROUCH_Y, 5);
    s = stepMovement(s, { ...noInput, yaw: 0 }, 1 / 60);
    expect(s.position[1]).toBeCloseTo(GROUND_Y, 5);
  });

  it("preserves more speed in a slide than braking to a stop", () => {
    let base = createInitialMovementState();
    for (let i = 0; i < 50; i++) base = stepMovement(base, { ...noInput, forward: true, yaw: 0 }, 1 / 60);
    let walk = base;
    let slide = base;
    for (let i = 0; i < 20; i++) walk = stepMovement(walk, noInput, 1 / 60);
    for (let i = 0; i < 20; i++) slide = stepMovement(slide, { ...noInput, crouch: true, yaw: 0 }, 1 / 60);
    expect(Math.hypot(slide.velocity[0], slide.velocity[2])).toBeGreaterThan(Math.hypot(walk.velocity[0], walk.velocity[2]));
  });
});
