import { describe, expect, it } from "vitest";
import {
  ARENA_HALF_EXTENT,
  createInitialPlayerState,
  CROUCH_Y,
  GRAVITY,
  GROUND_Y,
  JUMP_SPEED,
  MAX_SPEED,
  MAX_SPEED_CAP,
  stepPlayer,
  type InputState,
} from "./playerController";

const noInput: InputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  yaw: 0,
};

describe("stepPlayer", () => {
  it("does not exceed MAX_SPEED even under diagonal input", () => {
    let state = createInitialPlayerState();
    const input: InputState = { ...noInput, forward: true, right: true };
    for (let i = 0; i < 200; i++) {
      state = stepPlayer(state, input, 1 / 60);
    }
    const [vx, , vz] = state.velocity;
    expect(Math.hypot(vx, vz)).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
  });

  it("applies friction and comes to rest when no input is given", () => {
    let state = createInitialPlayerState();
    state = { ...state, velocity: [MAX_SPEED, 0, 0] };
    for (let i = 0; i < 60; i++) {
      state = stepPlayer(state, noInput, 1 / 60);
    }
    expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeCloseTo(0, 3);
  });

  it("only allows a jump when onGround is true", () => {
    const grounded = createInitialPlayerState();
    const afterJump = stepPlayer(grounded, { ...noInput, jump: true }, 1 / 60);
    expect(afterJump.onGround).toBe(false);
    expect(afterJump.velocity[1]).toBeCloseTo(JUMP_SPEED, 5);

    const airborne = { ...afterJump, onGround: false };
    const afterSecondJumpAttempt = stepPlayer(airborne, { ...noInput, jump: true }, 1 / 60);
    // still falling under gravity, not re-launched to JUMP_SPEED
    expect(afterSecondJumpAttempt.velocity[1]).toBeLessThan(JUMP_SPEED);
  });

  it("applies gravity while airborne and clamps to the ground plane on landing", () => {
    let state = createInitialPlayerState();
    state = { ...state, velocity: [0, 5, 0], onGround: false, position: [0, 10, 0] };
    let steps = 0;
    while (!state.onGround && steps < 1000) {
      state = stepPlayer(state, noInput, 1 / 60);
      steps += 1;
    }
    expect(state.position[1]).toBeCloseTo(GROUND_Y, 5);
    expect(state.velocity[1]).toBe(0);
    expect(GRAVITY).toBeLessThan(0);
  });

  it("clamps position to the arena bounds (matches the server's clamp — prediction must agree at the walls)", () => {
    let state = createInitialPlayerState([ARENA_HALF_EXTENT - 1, GROUND_Y, 0]);
    const input: InputState = { ...noInput, right: true, yaw: 0 }; // +X, straight at the wall
    for (let i = 0; i < 600; i++) state = stepPlayer(state, input, 1 / 60);
    expect(state.position[0]).toBeLessThanOrEqual(ARENA_HALF_EXTENT);
    expect(state.position[0]).toBeCloseTo(ARENA_HALF_EXTENT, 5);
  });

  it("moves forward along the camera yaw direction", () => {
    let state = createInitialPlayerState([0, GROUND_Y, 0]);
    const input: InputState = { ...noInput, forward: true, yaw: 0 };
    for (let i = 0; i < 30; i++) {
      state = stepPlayer(state, input, 1 / 60);
    }
    // yaw=0 forward vector is -Z
    expect(state.position[2]).toBeLessThan(0);
    expect(Math.abs(state.position[0])).toBeLessThan(0.1);
  });

  it("advances roughly the same distance regardless of tick rate (FPS-independence)", () => {
    const input: InputState = { ...noInput, forward: true, yaw: 0.4 };
    let coarse = createInitialPlayerState();
    for (let i = 0; i < 60; i++) coarse = stepPlayer(coarse, input, 1 / 60);
    let fine = createInitialPlayerState();
    for (let i = 0; i < 120; i++) fine = stepPlayer(fine, input, 1 / 120);
    const drift = Math.hypot(coarse.position[0] - fine.position[0], coarse.position[2] - fine.position[2]);
    expect(drift).toBeLessThan(0.15);
  });

  it("keeps slide-hop chains under the hard speed cap while building past walk speed", () => {
    // Start near the far +Z wall moving -Z so the whole chain stays inside the ±24 arena.
    let s = createInitialPlayerState([0, GROUND_Y, 22]);
    for (let i = 0; i < 40; i++) s = stepPlayer(s, { ...noInput, forward: true, yaw: 0 }, 1 / 60);
    let maxHoriz = 0;
    const track = () => {
      maxHoriz = Math.max(maxHoriz, Math.hypot(s.velocity[0], s.velocity[2]));
    };
    for (let cycle = 0; cycle < 4; cycle++) {
      for (let i = 0; i < 8; i++) {
        s = stepPlayer(s, { ...noInput, forward: true, crouch: true, yaw: 0 }, 1 / 60);
        track();
      }
      s = stepPlayer(s, { ...noInput, forward: true, crouch: true, jump: true, yaw: 0 }, 1 / 60);
      track();
      let g = 0;
      while (!s.onGround && g < 80) {
        s = stepPlayer(s, { ...noInput, forward: true, yaw: 0 }, 1 / 60);
        track();
        g++;
      }
    }
    expect(maxHoriz).toBeLessThanOrEqual(MAX_SPEED_CAP + 1e-6);
    expect(Math.hypot(s.velocity[0], s.velocity[2])).toBeGreaterThan(MAX_SPEED);
  });

  it("lowers the eye height while crouching and restores it when standing", () => {
    let s = createInitialPlayerState([0, GROUND_Y, 0]);
    s = stepPlayer(s, { ...noInput, crouch: true, yaw: 0 }, 1 / 60);
    expect(s.position[1]).toBeCloseTo(CROUCH_Y, 5);
    s = stepPlayer(s, { ...noInput, yaw: 0 }, 1 / 60);
    expect(s.position[1]).toBeCloseTo(GROUND_Y, 5);
  });

  it("preserves more speed in a slide than braking to a stop", () => {
    let base = createInitialPlayerState();
    for (let i = 0; i < 50; i++) base = stepPlayer(base, { ...noInput, forward: true, yaw: 0 }, 1 / 60);
    let walk = base;
    let slide = base;
    for (let i = 0; i < 20; i++) walk = stepPlayer(walk, noInput, 1 / 60);
    for (let i = 0; i < 20; i++) slide = stepPlayer(slide, { ...noInput, crouch: true, yaw: 0 }, 1 / 60);
    expect(Math.hypot(slide.velocity[0], slide.velocity[2])).toBeGreaterThan(Math.hypot(walk.velocity[0], walk.velocity[2]));
  });
});
