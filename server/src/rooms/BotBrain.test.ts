import { describe, expect, it } from "vitest";
import { BotBrain, type BotView } from "./BotBrain";
import type { Vec3 } from "../net/messages";

const DT = 1 / 60;

function engaged(overrides: Partial<BotView> = {}): BotView {
  return {
    position: [0, 1.6, 0],
    speed: 0,
    onGround: true,
    hp: 100,
    enemies: [],
    canEngage: true,
    weaponReady: true,
    weaponEmpty: false,
    ...overrides,
  };
}

describe("BotBrain", () => {
  it("idles and holds fire when there are no enemies", () => {
    const brain = new BotBrain(() => 0.5);
    const d = brain.decide(DT, engaged({ enemies: [] }));
    expect(d.fireDirection).toBeUndefined();
    expect(d.reload).toBeFalsy();
    const moving = d.input.forward || d.input.backward || d.input.left || d.input.right;
    expect(moving).toBe(false);
  });

  it("holds fire outside the action phase even with an enemy in view", () => {
    const brain = new BotBrain(() => 0.5);
    const enemy = { position: [0, 1.6, -5] as Vec3 };
    const d = brain.decide(DT, engaged({ canEngage: false, enemies: [enemy] }));
    expect(d.fireDirection).toBeUndefined();
  });

  it("turns to face an enemy and eventually fires a shot toward it", () => {
    const brain = new BotBrain(() => 0.5);
    const enemy = { position: [0, 1.6, -10] as Vec3 };
    const view = engaged({ enemies: [enemy] });

    // First tick: still turning / reacting — no shot yet.
    expect(brain.decide(DT, view).fireDirection).toBeUndefined();

    let fired: Vec3 | undefined;
    for (let i = 0; i < 300 && !fired; i++) {
      fired = brain.decide(DT, engaged({ enemies: [enemy] })).fireDirection;
    }
    expect(fired).toBeDefined();
    // The enemy is straight down -Z, so the shot must travel that way.
    expect(fired![2]).toBeLessThan(0);
  });

  it("reloads instead of firing when the weapon is empty", () => {
    const brain = new BotBrain(() => 0.5);
    const enemy = { position: [0, 1.6, -4] as Vec3 };
    let d = brain.decide(DT, engaged({ enemies: [enemy], weaponReady: false, weaponEmpty: true }));
    // Give it a few ticks to settle its aim; the reload intent should persist.
    for (let i = 0; i < 30; i++) {
      d = brain.decide(DT, engaged({ enemies: [enemy], weaponReady: false, weaponEmpty: true }));
    }
    expect(d.reload).toBe(true);
    expect(d.fireDirection).toBeUndefined();
  });

  it("does not move or shoot while dead", () => {
    const brain = new BotBrain(() => 0.5);
    const enemy = { position: [0, 1.6, -6] as Vec3 };
    const d = brain.decide(DT, engaged({ hp: 0, enemies: [enemy] }));
    expect(d.fireDirection).toBeUndefined();
    const moving = d.input.forward || d.input.backward || d.input.left || d.input.right || d.input.jump;
    expect(moving).toBe(false);
  });
});
