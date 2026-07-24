import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetServer } from "../net/transport";
import { Room } from "./Room";
import { EQUIP_SEC, WEAPON_RULES } from "../combat/weaponRules";
import { BUY_PHASE_MS, ROUND_END_MS } from "../rounds/roundLogic";

const fakeIo = { room: () => ({ emit: () => {} }) } as unknown as NetServer;

let activeRoom: Room | null = null;

function makeRoom(code = "TESTAB"): Room {
  activeRoom = new Room(code, fakeIo);
  return activeRoom;
}

/** Starts the match (as "host") and advances past the buy phase — firing is only legal in "action". */
function enterActionPhase(room: Room): void {
  room.startMatch("host");
  vi.advanceTimersByTime(BUY_PHASE_MS + 50);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  activeRoom?.stop();
  activeRoom = null;
  vi.useRealTimers();
});

describe("Room", () => {
  it("makes the first player who joins the host", () => {
    const room = makeRoom();
    room.addPlayer("p1");
    expect(room.hostId).toBe("p1");
  });

  it("alternates team assignment to keep 5v5 balance", () => {
    const room = makeRoom();
    const teams = ["p1", "p2", "p3", "p4"].map((id) => room.addPlayer(id).team);
    expect(teams).toEqual(["A", "B", "A", "B"]);
  });

  it("reports full once 10 players have joined", () => {
    const room = makeRoom();
    for (let i = 0; i < 10; i++) room.addPlayer(`p${i}`);
    expect(room.isFull()).toBe(true);
  });

  it("lets only the host start the match, moving phase waiting -> active", () => {
    const room = makeRoom();
    room.addPlayer("host");
    room.addPlayer("guest");

    expect(room.startMatch("guest")).toBe(false);
    expect(room.phase).toBe("waiting");

    expect(room.startMatch("host")).toBe(true);
    expect(room.phase).toBe("active");
  });

  it("rejects starting a match that is already active", () => {
    const room = makeRoom();
    room.addPlayer("host");
    room.startMatch("host");
    expect(room.startMatch("host")).toBe(false);
  });

  it("assigns each player a distinct auto-generated color name", () => {
    const room = makeRoom();
    const names = ["p1", "p2", "p3"].map((id) => room.addPlayer(id).name);
    expect(new Set(names).size).toBe(3);
    for (const name of names) expect(name.length).toBeGreaterThan(0);
  });

  it("allows a match to start with uneven or small teams (1v1, not just full 5v5)", () => {
    const room = makeRoom();
    room.addPlayer("host");
    room.addPlayer("guest");
    expect(room.startMatch("host")).toBe(true);
    expect(room.phase).toBe("active");
  });

  it("reassigns host when the host disconnects", () => {
    const room = makeRoom();
    room.addPlayer("host");
    room.addPlayer("guest");
    room.removePlayer("host");
    expect(room.hostId).toBe("guest");
  });

  describe("resolveFireRequest", () => {
    function fireStraightAhead(room: Room, shooterId: string, weaponId: "revolver" | "kar98" = "revolver") {
      const shooter = room.players.get(shooterId)!;
      return room.resolveFireRequest(shooterId, {
        weaponId,
        origin: shooter.movement.position,
        direction: [0, 0, -1],
        clientTick: 1,
      });
    }

    it("rejects a fire request whose origin is implausibly far from the shooter's actual position", () => {
      const room = makeRoom();
      room.addPlayer("host"); // spawns at [0, 1.6, 10] (team A)
      enterActionPhase(room);

      const outcome = room.resolveFireRequest("host", {
        weaponId: "revolver",
        origin: [500, 1.6, 500], // nowhere near the shooter's real position — spoofed
        direction: [0, 0, -1],
        clientTick: 1,
      });

      expect(outcome.type).toBe("rejected");
    });

    it("accepts a fire request whose origin matches the shooter's actual position", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);

      expect(fireStraightAhead(room, "host").type).toBe("ack");
    });

    it("credits a kill to the shooter and a death to the target on a lethal hit", () => {
      const room = makeRoom();
      room.addPlayer("host"); // team A at [0,1.6,10]
      room.addPlayer("guest"); // team B at [0,1.6,-10]
      enterActionPhase(room);

      const guest = room.players.get("guest")!;
      guest.movement.position = [0, 1.6, 8]; // directly in the host's line of fire
      guest.hp = 1; // one shot from death

      expect(fireStraightAhead(room, "host").type).toBe("hit");
      expect(room.players.get("host")!.kills).toBe(1);
      expect(room.players.get("host")!.streak).toBe(1);
      expect(guest.deaths).toBe(1);
      expect(guest.streak).toBe(0);
    });

    it("rejects firing with no ammo", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      room.players.get("host")!.weapons.revolver.ammo = 0;

      expect(fireStraightAhead(room, "host").type).toBe("rejected");
    });

    it("rejects firing before the match starts and during the buy phase", () => {
      const room = makeRoom();
      room.addPlayer("host");

      expect(fireStraightAhead(room, "host").type).toBe("rejected"); // lobby

      room.startMatch("host"); // now in round 1's buy phase
      expect(room.roundPhase).toBe("buy");
      expect(fireStraightAhead(room, "host").type).toBe("rejected"); // no buy-phase spawn sniping

      vi.advanceTimersByTime(BUY_PHASE_MS + 50);
      expect(fireStraightAhead(room, "host").type).toBe("ack");
    });

    it("rejects firing from a dead player (no untargetable ghost killers)", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      room.players.get("host")!.hp = 0;

      expect(fireStraightAhead(room, "host").type).toBe("rejected");
    });

    it("rejects firing a weapon that is not the equipped one", () => {
      const room = makeRoom();
      room.addPlayer("host"); // equipped defaults to revolver
      enterActionPhase(room);

      expect(fireStraightAhead(room, "host", "kar98").type).toBe("rejected");
      expect(fireStraightAhead(room, "host", "revolver").type).toBe("ack");
    });

    it("enforces the equip settle delay after a weapon switch", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      room.players.get("host")!.owned.add("kar98"); // own it so the switch is legal

      room.switchWeapon("host", "kar98");
      expect(fireStraightAhead(room, "host", "kar98").type).toBe("rejected"); // still drawing

      vi.advanceTimersByTime(EQUIP_SEC * 1000 + 50);
      expect(fireStraightAhead(room, "host", "kar98").type).toBe("ack");
    });

    it("does not hit teammates (friendly fire off)", () => {
      const room = makeRoom();
      room.addPlayer("host"); // team A at [0, 1.6, 10]
      room.addPlayer("guest"); // team B at [0, 1.6, -10]
      room.addPlayer("buddy"); // team A, same spawn as host
      enterActionPhase(room);

      // shoot from just behind the teammate straight through them at the enemy
      const outcome = room.resolveFireRequest("host", {
        weaponId: "revolver",
        origin: [0, 1.6, 11],
        direction: [0, 0, -1],
        clientTick: 1,
      });

      expect(outcome.type).toBe("hit");
      if (outcome.type === "hit") {
        expect(outcome.result.targetId).toBe("guest"); // passed through "buddy"
        expect(outcome.result.lethal).toBe(false); // revolver does 26, guest has 100
      }
    });
  });

  describe("hit zones & aim error", () => {
    /** Fresh room with an enemy at the B spawn; host fires one revolver shot along `dir`. */
    function fireOnce(dir: [number, number, number]) {
      const room = makeRoom();
      room.addPlayer("host"); // team A at [0, 1.6, 10]
      room.addPlayer("guest"); // team B at [0, 1.6, -10]
      enterActionPhase(room);
      const host = room.players.get("host")!;
      return room.resolveFireRequest("host", { weaponId: "revolver", origin: host.movement.position, direction: dir, clientTick: 1 });
    }

    it("a headshot deals more than a body shot with the same weapon", () => {
      // Flat shot at eye height strikes the head; angling down onto the torso is a body shot.
      const head = fireOnce([0, 0, -1]);
      const body = fireOnce([0, -0.55, -20]); // toward the enemy's chest, normalized inside
      expect(head.type).toBe("hit");
      expect(body.type).toBe("hit");
      if (head.type === "hit" && body.type === "hit") {
        expect(head.result.zone).toBe("head");
        expect(body.result.zone).toBe("body");
        expect(head.result.damage).toBeGreaterThan(body.result.damage);
        expect(head.result.damage).toBe(65); // 26 × 2.5
        expect(body.result.damage).toBe(26); // 26 × 1.0
      }
    });

    it("a kar98 body shot kills a full-HP target in one round", () => {
      const room = makeRoom();
      room.addPlayer("host");
      room.addPlayer("guest"); // enemy at [0, 1.6, -10]
      enterActionPhase(room);
      const host = room.players.get("host")!;
      host.owned.add("kar98");
      host.equipped = "kar98";
      host.switchRemaining = 0;

      const outcome = room.resolveFireRequest("host", {
        weaponId: "kar98",
        origin: host.movement.position,
        direction: [0, -0.55, -20], // angled onto the chest: body zone, 100 × 1.0
        clientTick: 1,
      });

      expect(outcome.type).toBe("hit");
      if (outcome.type === "hit") {
        expect(outcome.result.damage).toBe(100);
        expect(outcome.result.lethal).toBe(true);
      }
    });

    it("accumulates recoil across a burst and resets it after a firing gap", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      const host = room.players.get("host")!;
      // Bypass the fire-rate gate between shots — this test targets Room's
      // burst timer, not the cooldown (the revolver's 500ms cooldown would
      // otherwise always exceed the 350ms burst window).
      const clearCooldown = () => {
        host.weapons.revolver = { ...host.weapons.revolver, phase: "idle" as const, cooldownRemaining: 0 };
      };
      const fire = () =>
        room.resolveFireRequest("host", { weaponId: "revolver", origin: host.movement.position, direction: [0, 0, -1], clientTick: 1 });

      fire();
      expect(host.recoilShots).toBe(1);
      vi.advanceTimersByTime(120); // still inside the burst window
      clearCooldown();
      fire();
      expect(host.recoilShots).toBe(2); // same burst → climbs
      vi.advanceTimersByTime(400); // longer than the reset window
      clearCooldown();
      fire();
      expect(host.recoilShots).toBe(1); // burst reset to first-shot accuracy
    });
  });

  describe("buyWeapon", () => {
    it("buys a weapon during the buy phase, deducting money and granting ownership", () => {
      const room = makeRoom();
      room.addPlayer("host");
      room.startMatch("host"); // round 1 buy phase
      const player = room.players.get("host")!;
      player.money = 5000;

      expect(room.buyWeapon("host", "kar98")).toBe(true);
      expect(player.money).toBe(5000 - 2400);
      expect(player.owned.has("kar98")).toBe(true);
      expect(player.weapons.kar98.ammo).toBe(WEAPON_RULES.kar98.maxAmmo);
    });

    it("rejects a purchase the player can't afford (money unchanged, not owned)", () => {
      const room = makeRoom();
      room.addPlayer("host");
      room.startMatch("host");
      const player = room.players.get("host")!;
      player.money = 800; // less than the kar98's price

      expect(room.buyWeapon("host", "kar98")).toBe(false);
      expect(player.money).toBe(800);
      expect(player.owned.has("kar98")).toBe(false);
    });

    it("rejects buying outside the buy phase", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      room.players.get("host")!.money = 5000;

      expect(room.buyWeapon("host", "kar98")).toBe(false);
      expect(room.players.get("host")!.owned.has("kar98")).toBe(false);
    });

    it("only lets you equip a weapon you own", () => {
      const room = makeRoom();
      room.addPlayer("host");
      room.startMatch("host");
      const player = room.players.get("host")!;

      room.switchWeapon("host", "kar98"); // not owned yet
      expect(player.equipped).toBe("revolver");

      player.money = 5000;
      room.buyWeapon("host", "kar98");
      room.switchWeapon("host", "kar98");
      expect(player.equipped).toBe("kar98");
    });

    it("strips the bought loadout back to the pistol at the start of the next round", () => {
      const room = makeRoom();
      room.addPlayer("host");
      room.addPlayer("guest");
      room.startMatch("host");
      const host = room.players.get("host")!;
      host.money = 5000;
      room.buyWeapon("host", "kar98");
      expect(host.owned.has("kar98")).toBe(true);

      // Run to the action phase, wipe team B, and let the round-end intermission elapse.
      vi.advanceTimersByTime(BUY_PHASE_MS + 50);
      room.players.get("guest")!.hp = 0;
      vi.advanceTimersByTime(ROUND_END_MS + 100);

      expect(room.roundNumber).toBe(2);
      expect(host.owned.has("kar98")).toBe(false);
      expect(host.equipped).toBe("revolver");
    });
  });

  describe("throwGrenade", () => {
    it("accepts a throw in the action phase and then blocks a second until the cooldown elapses", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      const host = room.players.get("host")!;

      expect(room.throwGrenade("host", host.movement.position, [0, 0, -1])).toBe(true);
      // Cooldown is now running — an immediate second throw is rejected.
      expect(room.throwGrenade("host", host.movement.position, [0, 0, -1])).toBe(false);
    });

    it("rejects a throw before the action phase and from a dead player", () => {
      const room = makeRoom();
      room.addPlayer("host");
      const host = room.players.get("host")!;

      // Lobby.
      expect(room.throwGrenade("host", host.movement.position, [0, 0, -1])).toBe(false);
      // Buy phase.
      room.startMatch("host");
      expect(room.roundPhase).toBe("buy");
      expect(room.throwGrenade("host", host.movement.position, [0, 0, -1])).toBe(false);
      // Action phase but dead.
      vi.advanceTimersByTime(BUY_PHASE_MS + 50);
      host.hp = 0;
      expect(room.throwGrenade("host", host.movement.position, [0, 0, -1])).toBe(false);
    });

    it("rejects a throw whose origin is implausibly far from the thrower", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      expect(room.throwGrenade("host", [500, 1.6, 500], [0, 0, -1])).toBe(false);
    });

    it("detonates on fuse-out: damages a nearby enemy but not a teammate (friendly fire off)", () => {
      const room = makeRoom();
      room.addPlayer("host"); // team A at [0,1.6,10]
      room.addPlayer("guest"); // team B at [0,1.6,-10]
      room.addPlayer("buddy"); // team A, host's spawn
      enterActionPhase(room);
      const host = room.players.get("host")!;
      const guest = room.players.get("guest")!;
      const buddy = room.players.get("buddy")!;
      // Put an enemy and a teammate both right on top of where the grenade lands.
      guest.movement.position = [1, 1.6, 10];
      buddy.movement.position = [1.5, 1.6, 10];

      // Lob it straight down at the thrower's feet, then run past the fuse.
      room.throwGrenade("host", host.movement.position, [0, -1, 0]);
      vi.advanceTimersByTime(2000);

      expect(guest.hp).toBeLessThan(100); // caught in the blast
      expect(buddy.hp).toBe(100); // same team — unharmed
    });

    it("credits a kill and a death when a grenade is the lethal blow", () => {
      const room = makeRoom();
      room.addPlayer("host"); // team A at [0,1.6,10]
      room.addPlayer("guest"); // team B
      enterActionPhase(room);
      const host = room.players.get("host")!;
      const guest = room.players.get("guest")!;
      guest.movement.position = [1, 1.6, 10]; // in the blast
      guest.hp = 1; // any blast damage is lethal

      room.throwGrenade("host", host.movement.position, [0, -1, 0]);
      vi.advanceTimersByTime(2000);

      // kills/deaths persist across the round reset that a kill triggers.
      expect(room.players.get("host")!.kills).toBe(1);
      expect(room.players.get("guest")!.deaths).toBe(1);
    });
  });

  describe("reloadWeapon", () => {
    it("refills the server-side magazine after the reload duration", () => {
      const room = makeRoom();
      room.addPlayer("host");
      enterActionPhase(room);
      const player = room.players.get("host")!;
      player.weapons.revolver = { ...player.weapons.revolver, ammo: 0 };

      room.reloadWeapon("host", "revolver");
      expect(room.players.get("host")!.weapons.revolver.phase).toBe("reloading");

      vi.advanceTimersByTime(WEAPON_RULES.revolver.reloadSec * 1000 + 100);
      expect(room.players.get("host")!.weapons.revolver.ammo).toBe(WEAPON_RULES.revolver.maxAmmo);
      expect(fireStraightAheadFor(room, "host")).toBe("ack");
    });

    it("ignores reloads for a weapon that isn't equipped", () => {
      const room = makeRoom();
      room.addPlayer("host"); // revolver equipped
      const player = room.players.get("host")!;
      player.weapons.kar98 = { ...player.weapons.kar98, ammo: 0 };

      room.reloadWeapon("host", "kar98");
      expect(room.players.get("host")!.weapons.kar98.phase).toBe("idle");
    });
  });
});

function fireStraightAheadFor(room: Room, shooterId: string): string {
  const shooter = room.players.get(shooterId)!;
  return room.resolveFireRequest(shooterId, {
    weaponId: "revolver",
    origin: shooter.movement.position,
    direction: [0, 0, -1],
    clientTick: 1,
  }).type;
}
