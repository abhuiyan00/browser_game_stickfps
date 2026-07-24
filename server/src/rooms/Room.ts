import type { NetServer } from "../net/transport";
import { assignColorName } from "./colorNames";
import { BotBrain, type BotView } from "./BotBrain";
import { startFixedInterval, type FixedIntervalHandle } from "../sim/fixedInterval";
import { createInitialMovementState, stepMovement, type MovementState } from "../sim/movement";
import {
  applyFire,
  applyReload,
  canFire,
  createServerWeaponState,
  stepWeaponState,
  EQUIP_SEC,
  type ServerWeaponState,
} from "../combat/weaponRules";
import { WEAPON_PRICE } from "../combat/weaponRules";
import { PERK_COOLDOWN_MULT, PERK_MOVE_MULT, PERK_RELOAD_MULT, perkTierForStreak } from "../combat/perks";
import { createGrenade, grenadeDamageAt, stepGrenade, GRENADE_COOLDOWN_SEC, type GrenadeState } from "../combat/grenade";
import { isOriginPlausible, raycastPlayers, WEAPON_DAMAGE, ZONE_MULT, type HitCandidate } from "../combat/hitValidation";
import { buildShotRays, WEAPON_ACCURACY, RECOIL_RESET_SEC, type AimContext } from "../combat/aimError";
import {
  beginActionPhase,
  beginNextRound,
  beginRoundEnd,
  hasClinchedMatch,
  isPhaseElapsed,
  isSideSwapRound,
  startFirstRound,
  STARTING_MONEY,
  ROUND_WIN_MONEY,
  type RoundPhase,
  type RoundState,
} from "../rounds/roundLogic";
import {
  WIRE_EVENTS,
  type FireAck,
  type FireRequest,
  type HitResult,
  type HitZone,
  type PlayerInput,
  type PositionSnapshot,
  type RoomState,
  type Team,
  type Vec3,
  type WeaponId,
} from "../net/messages";

const TICK_HZ = 60;
const MAX_PLAYERS_PER_TEAM = 5;
const DEFAULT_WEAPON: WeaponId = "revolver";
const ALL_WEAPON_IDS: WeaponId[] = ["revolver", "kar98"];
// Cosmetic map ids — must match the client theme table (client/src/game/maps.ts MAPS).
const MAP_IDS = ["foundry7", "coldline9"] as const;

export interface PlayerRecord {
  id: string;
  name: string;
  team: Team;
  hp: number;
  money: number;
  movement: MovementState;
  latestInput: PlayerInput;
  weapons: Record<WeaponId, ServerWeaponState>;
  equipped: WeaponId;
  /** Weapons owned this round. Reset to just the free pistol at the start of every round; grown by buying. */
  owned: Set<WeaponId>;
  /** Seconds left of the equip settle delay after a weapon switch — can't fire until 0. */
  switchRemaining: number;
  /** Shots fired in the current burst — drives recoil climb. Reset on a firing gap or weapon switch. */
  recoilShots: number;
  /** serverTick of the last shot — a long enough gap resets the burst to first-shot accuracy. */
  lastFireTick: number;
  /** Match-long tallies (persist across rounds, reset on match start) — drive the scoreboard. */
  kills: number;
  deaths: number;
  /** Consecutive kills without dying (reset on death and each round) — drives killstreak perks. */
  streak: number;
  /** Seconds left before this player can throw another grenade (0 = ready). Reset each round. */
  grenadeCooldownRemaining: number;
}

export type FireOutcome =
  | { type: "hit"; result: HitResult }
  | { type: "ack"; result: FireAck }
  | { type: "rejected" };

function spawnPointFor(team: Team): [number, number, number] {
  return team === "A" ? [0, 1.6, 10] : [0, 1.6, -10];
}

const NEUTRAL_INPUT: PlayerInput = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  crouch: false,
  yaw: 0,
  clientTick: 0,
};

export class Room {
  readonly code: string;
  /** Cosmetic map id, broadcast so every client renders the same arena. Host can cycle it in the lobby. */
  mapId: string = MAP_IDS[0];
  hostId: string | null = null;
  phase: "waiting" | "active" = "waiting";
  roundNumber = 0;
  roundPhase: RoundPhase = "buy";
  phaseEndsAt = 0;
  teamWins: Record<Team, number> = { A: 0, B: 0 };
  /** Who took the most recently decided round — what the round-end banner shows. Null = draw / none yet. */
  lastRoundWinner: Team | null = null;
  players = new Map<string, PlayerRecord>();
  private loop: FixedIntervalHandle | null = null;
  private serverTick = 0;
  /** AI brains for bot players, keyed by their player id. Membership in this map is what marks a player as a bot. */
  private bots = new Map<string, BotBrain>();
  private botCounter = 0;
  /** Live grenades in flight — stepped each tick, broadcast for rendering, detonated on fuse-out. */
  private grenades: GrenadeState[] = [];
  private grenadeSeq = 0;

  constructor(
    code: string,
    private io: NetServer,
    /** Injectable for deterministic spread/recoil in tests; defaults to Math.random. */
    private rng: () => number = Math.random,
  ) {
    this.code = code;
    this.mapId = MAP_IDS[Math.min(MAP_IDS.length - 1, Math.floor(this.rng() * MAP_IDS.length))];
  }

  private nextTeam(): Team {
    let a = 0;
    let b = 0;
    for (const p of this.players.values()) {
      if (p.team === "A") a++;
      else b++;
    }
    return a <= b ? "A" : "B";
  }

  isFull(): boolean {
    return this.players.size >= MAX_PLAYERS_PER_TEAM * 2;
  }

  addPlayer(id: string): PlayerRecord {
    const team = this.nextTeam();
    const weapons = {} as Record<WeaponId, ServerWeaponState>;
    for (const weaponId of ALL_WEAPON_IDS) weapons[weaponId] = createServerWeaponState(weaponId);

    const usedNames = new Set(Array.from(this.players.values()).map((p) => p.name));
    const record: PlayerRecord = {
      id,
      name: assignColorName(usedNames),
      team,
      hp: 100,
      money: STARTING_MONEY,
      movement: createInitialMovementState(spawnPointFor(team)),
      latestInput: { ...NEUTRAL_INPUT },
      weapons,
      equipped: DEFAULT_WEAPON,
      owned: new Set<WeaponId>([DEFAULT_WEAPON]),
      switchRemaining: 0,
      recoilShots: 0,
      lastFireTick: 0,
      kills: 0,
      deaths: 0,
      streak: 0,
      grenadeCooldownRemaining: 0,
    };
    this.players.set(id, record);
    if (this.hostId === null) this.hostId = id;
    if (this.players.size === 1) this.start();
    return record;
  }

  /**
   * Spawns an AI bot on the given team — a full PlayerRecord, so the sim, round
   * logic, hit detection and snapshots all treat it exactly like a human — plus
   * a BotBrain that supplies its input each tick. A bot never becomes host.
   */
  private addBot(team: Team): void {
    if (this.isFull()) return;
    const id = `bot-${this.code}-${++this.botCounter}`;
    const weapons = {} as Record<WeaponId, ServerWeaponState>;
    for (const weaponId of ALL_WEAPON_IDS) weapons[weaponId] = createServerWeaponState(weaponId);

    const usedNames = new Set(Array.from(this.players.values()).map((p) => p.name));
    this.players.set(id, {
      id,
      name: assignColorName(usedNames),
      team,
      hp: 100,
      money: STARTING_MONEY,
      movement: createInitialMovementState(spawnPointFor(team)),
      latestInput: { ...NEUTRAL_INPUT },
      weapons,
      equipped: DEFAULT_WEAPON,
      owned: new Set<WeaponId>([DEFAULT_WEAPON]),
      switchRemaining: 0,
      recoilShots: 0,
      lastFireTick: 0,
      kills: 0,
      deaths: 0,
      streak: 0,
      grenadeCooldownRemaining: 0,
    });
    this.bots.set(id, new BotBrain(this.rng));
  }

  /**
   * Host-only, lobby-only. Fills both teams up to the per-team cap with AI bots
   * so a solo host can start (and watch) a full match. Returns the number added.
   */
  fillWithBots(requesterId: string): number {
    if (this.hostId !== requesterId || this.phase !== "waiting") return 0;
    let added = 0;
    for (const team of ["A", "B"] as Team[]) {
      let count = 0;
      for (const p of this.players.values()) if (p.team === team) count++;
      while (count < MAX_PLAYERS_PER_TEAM && !this.isFull()) {
        this.addBot(team);
        count++;
        added++;
      }
    }
    if (added > 0) this.broadcastRoomState();
    return added;
  }

  /** Host-only, lobby-only. Advances the cosmetic map to the next in the list. Returns whether it changed. */
  cycleMap(requesterId: string): boolean {
    if (this.hostId !== requesterId || this.phase !== "waiting") return false;
    const i = MAP_IDS.indexOf(this.mapId as (typeof MAP_IDS)[number]);
    this.mapId = MAP_IDS[(i + 1) % MAP_IDS.length];
    this.broadcastRoomState();
    return true;
  }

  removePlayer(id: string): void {
    const removed = this.players.delete(id);
    this.bots.delete(id); // no-op for a human; drops a bot's brain if one is ever removed directly
    if (this.hostId === id) {
      // Host migrates to another human, never to a bot (a bot can't press Start).
      this.hostId = this.firstHumanId();
    }
    // Once no humans remain, the bots are only keeping the 60Hz loop alive for an
    // abandoned room — drop them so players.size can hit 0 and RoomManager reclaims it.
    if (this.humanCount() === 0) this.clearBots();
    if (this.players.size === 0) {
      this.stop();
      return;
    }
    // Tell the survivors. In the lobby nothing else ever broadcasts, so without
    // this a leaver stays on the roster forever — and a migrated host never
    // learns they now own the Start button.
    if (removed) this.broadcastRoomState();
  }

  private firstHumanId(): string | null {
    for (const id of this.players.keys()) if (!this.bots.has(id)) return id;
    return null;
  }

  private humanCount(): number {
    let n = 0;
    for (const id of this.players.keys()) if (!this.bots.has(id)) n++;
    return n;
  }

  private clearBots(): void {
    for (const id of this.bots.keys()) this.players.delete(id);
    this.bots.clear();
  }

  setInput(id: string, input: PlayerInput): void {
    const player = this.players.get(id);
    if (!player) return;
    player.latestInput = input;
  }

  /** Host-only. The client hiding the Start button is UX only — this is the actual authority boundary. */
  startMatch(requesterId: string): boolean {
    if (this.hostId !== requesterId) return false;
    if (this.phase !== "waiting") return false;
    this.phase = "active";

    const round = startFirstRound(Date.now());
    this.applyRoundState(round);
    this.teamWins = { A: 0, B: 0 };
    for (const player of this.players.values()) {
      player.money = STARTING_MONEY;
      player.kills = 0;
      player.deaths = 0;
      player.streak = 0;
    }
    this.resetPositionsAndHp();
    return true;
  }

  /**
   * Tracks which weapon is actually in hand. Fire requests for anything else
   * are rejected, and the settle delay stops switch+fire interleaving from
   * beating both weapons' cooldowns.
   */
  switchWeapon(playerId: string, weaponId: WeaponId): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0 || player.equipped === weaponId) return;
    if (!player.owned.has(weaponId)) return; // can't equip a weapon you don't own
    player.equipped = weaponId;
    player.switchRemaining = EQUIP_SEC;
    player.recoilShots = 0; // fresh weapon starts its spray from zero
    // `equipped` drives the third-person gun prop on every other client —
    // without a broadcast the swap wouldn't show until the next unrelated one.
    this.broadcastRoomState();
  }

  /**
   * Buy-phase purchase (CS-style economy). Rejected outside the buy phase, for
   * the free starter, for something already owned, or when the player can't
   * afford it. On success the weapon is granted with a full magazine; the
   * player equips it themselves. Returns whether the purchase went through.
   */
  buyWeapon(playerId: string, weaponId: WeaponId): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (this.phase !== "active" || this.roundPhase !== "buy") return false;
    if (weaponId === DEFAULT_WEAPON || player.owned.has(weaponId)) return false;
    const price = WEAPON_PRICE[weaponId];
    if (player.money < price) return false;

    player.money -= price;
    player.owned.add(weaponId);
    player.weapons[weaponId] = createServerWeaponState(weaponId);
    this.broadcastRoomState();
    return true;
  }

  /** Server-side reload — without this the server's ammo only ever counts down (client reloads are cosmetic). */
  reloadWeapon(playerId: string, weaponId: WeaponId): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0 || player.equipped !== weaponId) return;
    if (!player.owned.has(weaponId)) return;
    player.weapons[weaponId] = applyReload(player.weapons[weaponId], PERK_RELOAD_MULT[perkTierForStreak(player.streak)]);
  }

  /**
   * Server-authoritative grenade throw. Rejected outside the action phase, when
   * dead, or while the per-player cooldown is still running. On success it spawns
   * a live grenade and starts the cooldown — the arc, damage, and detonation are
   * all decided by the sim (createGrenade/tickGrenades), never the client (C1).
   */
  throwGrenade(playerId: string, origin: Vec3, direction: Vec3): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (this.phase !== "active" || this.roundPhase !== "action") return false;
    if (player.hp <= 0 || player.grenadeCooldownRemaining > 0) return false;
    if (!isOriginPlausible(origin, player.movement.position)) return false;
    player.grenadeCooldownRemaining = GRENADE_COOLDOWN_SEC;
    this.grenades.push(createGrenade(++this.grenadeSeq, playerId, player.team, origin, direction));
    return true;
  }

  /**
   * Advances every live grenade one step (integrate + bounce) and detonates any
   * whose fuse ran out. Runs before the elimination check so a grenade kill can
   * end the round the same tick it lands. Emits the surviving set for rendering —
   * including the empty set on the tick the last one clears, so clients drop it.
   */
  private tickGrenades(dt: number): void {
    const hadGrenades = this.grenades.length > 0;
    if (hadGrenades) {
      const survivors: GrenadeState[] = [];
      for (const g of this.grenades) {
        const stepped = stepGrenade(g, dt);
        if (stepped.fuseRemaining <= 0) this.detonateGrenade(stepped);
        else survivors.push(stepped);
      }
      this.grenades = survivors;
    }
    if (this.grenades.length > 0 || hadGrenades) {
      this.io.room(this.code).emit(
        WIRE_EVENTS.grenadeState,
        this.grenades.map((g) => ({ id: g.id, position: g.position, ownerTeam: g.ownerTeam })),
      );
    }
  }

  /** Detonation: radial damage to living enemies (friendly fire off, like bullets), then the explosion event. */
  private detonateGrenade(g: GrenadeState): void {
    const shooter = this.players.get(g.ownerId);
    for (const [id, target] of this.players) {
      if (target.hp <= 0 || target.team === g.ownerTeam) continue;
      const damage = grenadeDamageAt(g.position, target.movement.position);
      if (damage <= 0) continue;
      target.hp = Math.max(0, target.hp - damage);
      const lethal = target.hp <= 0;
      if (lethal) {
        if (shooter) {
          shooter.kills += 1;
          shooter.streak += 1;
        }
        target.deaths += 1;
        target.streak = 0;
      }
      const result: HitResult = {
        shooterId: g.ownerId,
        targetId: id,
        damage,
        zone: "body",
        lethal,
        point: [target.movement.position[0], target.movement.position[1], target.movement.position[2]],
        serverTick: this.serverTick,
      };
      this.io.room(this.code).emit(WIRE_EVENTS.hitResult, result);
    }
    this.io.room(this.code).emit(WIRE_EVENTS.grenadeExploded, { position: g.position, ownerId: g.ownerId });
    this.broadcastRoomState();
  }

  /** True only when shots are allowed to resolve: mid-match, action phase, shooter alive and settled on the weapon. */
  private canPlayerFire(shooter: PlayerRecord, weaponId: WeaponId): boolean {
    if (this.phase !== "active" || this.roundPhase !== "action") return false;
    if (shooter.hp <= 0) return false;
    if (!shooter.owned.has(weaponId)) return false;
    if (shooter.equipped !== weaponId || shooter.switchRemaining > 0) return false;
    return true;
  }

  /** The only method in this codebase that decides which player a shot hit (C1). */
  resolveFireRequest(shooterId: string, req: FireRequest): FireOutcome {
    const shooter = this.players.get(shooterId);
    if (!shooter) return { type: "rejected" };
    if (!this.canPlayerFire(shooter, req.weaponId)) return { type: "rejected" };

    const weaponState = shooter.weapons[req.weaponId];
    if (!canFire(weaponState)) return { type: "rejected" };
    if (!isOriginPlausible(req.origin, shooter.movement.position)) return { type: "rejected" };
    shooter.weapons[req.weaponId] = applyFire(weaponState, PERK_COOLDOWN_MULT[perkTierForStreak(shooter.streak)]);

    this.io.room(this.code).emit(WIRE_EVENTS.shotFired, {
      shooterId,
      weaponId: req.weaponId,
      origin: req.origin,
      direction: req.direction,
    });

    // --- Aim error (server-authoritative): spread is a speed-based random cone,
    // recoil is a systematic climb over a sustained burst. Both perturb the ray
    // HERE, before the raycast — a modified client's reported direction is only
    // the starting aim, so it can't fire pixel-perfect full-auto (C1). A quiet
    // gap resets the burst back to first-shot accuracy.
    if (this.serverTick - shooter.lastFireTick > RECOIL_RESET_SEC * TICK_HZ) shooter.recoilShots = 0;
    const vel = shooter.movement.velocity;
    const aimCtx: AimContext = {
      speed: Math.hypot(vel[0], vel[2]),
      grounded: shooter.movement.onGround,
      crouching: (shooter.latestInput.crouch ?? false) || (shooter.movement.sliding ?? false),
      recoilShots: shooter.recoilShots,
    };
    const rays = buildShotRays(req.direction, WEAPON_ACCURACY[req.weaponId], aimCtx, this.rng);
    shooter.recoilShots += 1;
    shooter.lastFireTick = this.serverTick;

    // Teammates are neither targets nor blockers (friendly fire off for v1) —
    // shots pass through them to whatever enemy is behind.
    const candidates: HitCandidate[] = [];
    for (const [id, p] of this.players) {
      if (id === shooterId || p.hp <= 0 || p.team === shooter.team) continue;
      candidates.push({ playerId: id, position: p.movement.position });
    }

    // Accumulate each ray's zone-scaled damage per target, then attribute the
    // shot to the nearest target it landed on. Both current weapons fire one
    // ray, so this reduces to a single-hit path; the aggregation stays for any
    // future multi-pellet weapon (one HitResult per trigger pull either way).
    const perTarget = new Map<string, { damage: number; distance: number; zone: HitZone; point: Vec3 }>();
    for (const ray of rays) {
      const hit = raycastPlayers(req.origin, ray, candidates);
      if (!hit) continue;
      const dmg = Math.round(WEAPON_DAMAGE[req.weaponId] * ZONE_MULT[hit.zone]);
      const cur = perTarget.get(hit.playerId);
      if (!cur) {
        perTarget.set(hit.playerId, { damage: dmg, distance: hit.distance, zone: hit.zone, point: hit.point });
      } else {
        cur.damage += dmg;
        if (hit.distance < cur.distance) {
          cur.distance = hit.distance;
          cur.zone = hit.zone; // report the nearest pellet's zone (the aimed one)
          cur.point = hit.point;
        }
      }
    }

    let primaryId: string | null = null;
    let primary: { damage: number; distance: number; zone: HitZone; point: Vec3 } | null = null;
    for (const [id, agg] of perTarget) {
      if (primary === null || agg.distance < primary.distance) {
        primaryId = id;
        primary = agg;
      }
    }

    if (primaryId !== null && primary !== null) {
      const target = this.players.get(primaryId);
      if (target) target.hp = Math.max(0, target.hp - primary.damage);
      const lethal = (target?.hp ?? 0) <= 0;
      if (lethal && target) {
        shooter.kills += 1;
        shooter.streak += 1;
        target.deaths += 1;
        target.streak = 0; // dying breaks the victim's streak (and their perks)
      }
      const result: HitResult = {
        shooterId,
        targetId: primaryId,
        damage: primary.damage,
        zone: primary.zone,
        lethal,
        point: primary.point,
        serverTick: this.serverTick,
      };
      // HP lives in RoomState and clients only see it when it's broadcast —
      // per-hit is the moment it changes, and hits are low-frequency enough
      // (cooldown-gated) that this costs nothing next to the 60Hz snapshots.
      this.broadcastRoomState();
      return { type: "hit", result };
    }

    const ack: FireAck = { weaponId: req.weaponId, ammoRemaining: shooter.weapons[req.weaponId].ammo };
    return { type: "ack", result: ack };
  }

  /** Runs one bot's AI for a tick: perceive the world, then apply its input and any fire/reload through the normal paths. */
  private driveBot(bot: PlayerRecord, brain: BotBrain, dt: number): void {
    const enemies: { position: Vec3 }[] = [];
    for (const [id, p] of this.players) {
      if (id === bot.id || p.team === bot.team || p.hp <= 0) continue;
      enemies.push({ position: p.movement.position });
    }
    const weapon = bot.weapons[bot.equipped];
    const vel = bot.movement.velocity;
    const view: BotView = {
      position: bot.movement.position,
      speed: Math.hypot(vel[0], vel[2]),
      onGround: bot.movement.onGround,
      hp: bot.hp,
      enemies,
      canEngage: this.phase === "active" && this.roundPhase === "action",
      weaponReady: canFire(weapon),
      weaponEmpty: weapon.ammo <= 0 && weapon.phase !== "reloading",
    };
    const decision = brain.decide(dt, view);
    bot.latestInput = decision.input;
    if (decision.reload) this.reloadWeapon(bot.id, bot.equipped);
    if (decision.fireDirection) this.botFire(bot, decision.fireDirection);
  }

  /**
   * A bot pulling the trigger — resolved through the same authoritative path a
   * human's shot is. A human's hit is echoed to the room by the net handler;
   * a bot has no channel, so mirror that here or its kills never reach the kill
   * feed and its victims never get damage feedback.
   */
  private botFire(bot: PlayerRecord, direction: Vec3): void {
    const outcome = this.resolveFireRequest(bot.id, {
      weaponId: bot.equipped,
      origin: [bot.movement.position[0], bot.movement.position[1], bot.movement.position[2]],
      direction,
      clientTick: this.serverTick,
    });
    if (outcome.type === "hit") this.io.room(this.code).emit(WIRE_EVENTS.hitResult, outcome.result);
  }

  start(): void {
    if (this.loop) return;
    this.loop = startFixedInterval(TICK_HZ, (dt) => this.tick(dt));
  }

  stop(): void {
    this.loop?.stop();
    this.loop = null;
  }

  private tick(dt: number): void {
    this.serverTick += 1;
    const snapshots: PositionSnapshot[] = [];

    for (const player of this.players.values()) {
      // Bots choose their own input (and any fire/reload) before the sim reads it,
      // routed through the same authoritative paths as a human's — they get no
      // special power. A human's latestInput arrives over the wire.
      const brain = this.bots.get(player.id);
      if (brain) this.driveBot(player, brain, dt);

      // Dead players are frozen: their buffered input is ignored so they
      // can't run around as untargetable ghosts until the next round.
      const { forward, backward, left, right, jump, crouch, yaw } = player.hp > 0 ? player.latestInput : NEUTRAL_INPUT;
      // Killstreak move-speed perk — the client mirrors this exact multiplier in its
      // own prediction (perks.ts), so faster feet never fight reconciliation.
      const speedMult = PERK_MOVE_MULT[perkTierForStreak(player.streak)];
      player.movement = stepMovement(player.movement, { forward, backward, left, right, jump, crouch, yaw }, dt, speedMult);

      for (const weaponId of ALL_WEAPON_IDS) {
        player.weapons[weaponId] = stepWeaponState(player.weapons[weaponId], dt);
      }
      if (player.switchRemaining > 0) player.switchRemaining = Math.max(0, player.switchRemaining - dt);
      if (player.grenadeCooldownRemaining > 0)
        player.grenadeCooldownRemaining = Math.max(0, player.grenadeCooldownRemaining - dt);

      snapshots.push({
        playerId: player.id,
        position: player.movement.position,
        yaw: player.latestInput.yaw,
        onGround: player.movement.onGround,
        velocity: player.movement.velocity,
        sliding: player.movement.sliding ?? false,
        serverTick: this.serverTick,
      });
    }

    if (this.phase !== "active") return; // lobby: nothing to broadcast, nobody is in the 3D scene yet

    this.tickGrenades(dt); // may damage/eliminate — must precede the elimination check in tickRound
    this.tickRound();

    if (snapshots.length > 0) {
      this.io.room(this.code).emit(WIRE_EVENTS.positionSnapshotBatch, snapshots);
    }
  }

  private tickRound(): void {
    if (this.roundPhase === "match-end") return;
    const now = Date.now();

    if (this.roundPhase === "action") {
      const winner = this.checkElimination();
      if (winner) {
        this.endRound(winner);
        return;
      }
    }

    const current: RoundState = { roundNumber: this.roundNumber, phase: this.roundPhase, phaseEndsAt: this.phaseEndsAt };
    if (!isPhaseElapsed(current, now)) return;

    if (this.roundPhase === "buy") {
      this.applyRoundState(beginActionPhase(current, now));
      this.broadcastRoomState();
      return;
    }

    if (this.roundPhase === "round-end") {
      this.advanceToNextRound(current, now);
      return;
    }

    // action phase timed out with no elimination -> draw, no payout (v1 simplification, see docs/specs/task-6.1.md)
    this.endRound(null);
  }

  /** A team with zero players is not "eliminated" — only a team that had players and lost all of them is. */
  private checkElimination(): Team | null {
    let aTotal = 0;
    let aAlive = 0;
    let bTotal = 0;
    let bAlive = 0;
    for (const player of this.players.values()) {
      if (player.team === "A") {
        aTotal++;
        if (player.hp > 0) aAlive++;
      } else {
        bTotal++;
        if (player.hp > 0) bAlive++;
      }
    }
    if (aTotal > 0 && aAlive === 0 && bAlive > 0) return "B";
    if (bTotal > 0 && bAlive === 0 && aAlive > 0) return "A";
    return null;
  }

  /** A round was just decided: pay out, tally, then either end the match or hold a short intermission. */
  private endRound(winner: Team | null): void {
    this.lastRoundWinner = winner;
    if (winner) {
      this.teamWins[winner] += 1;
      for (const player of this.players.values()) {
        if (player.team === winner) player.money += ROUND_WIN_MONEY;
      }
    }

    const now = Date.now();
    const current: RoundState = { roundNumber: this.roundNumber, phase: this.roundPhase, phaseEndsAt: this.phaseEndsAt };

    // A clinched match ends immediately — the remaining rounds can't change the winner.
    const clinched = winner !== null && hasClinchedMatch(this.teamWins[winner]);
    const capped = beginNextRound(current, now).phase === "match-end";
    if (clinched || capped) {
      this.applyRoundState({ ...current, phase: "match-end" });
      this.broadcastRoomState();
      return;
    }

    this.applyRoundState(beginRoundEnd(current, now));
    this.broadcastRoomState();
  }

  /** Round-end intermission elapsed: swap sides if due, reset everyone, start the next buy phase. */
  private advanceToNextRound(current: RoundState, now: number): void {
    const next = beginNextRound(current, now);
    if (isSideSwapRound(next.roundNumber)) this.swapSides();
    this.resetPositionsAndHp();
    this.applyRoundState(next);
    this.broadcastRoomState();
  }

  private applyRoundState(state: RoundState): void {
    this.roundNumber = state.roundNumber;
    this.roundPhase = state.phase;
    this.phaseEndsAt = state.phaseEndsAt;
  }

  toRoomState(): RoomState {
    return {
      code: this.code,
      mapId: this.mapId,
      hostId: this.hostId ?? "",
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        hp: p.hp,
        money: p.money,
        equipped: p.equipped,
        owned: Array.from(p.owned),
        kills: p.kills,
        deaths: p.deaths,
        perkTier: perkTierForStreak(p.streak),
      })),
      phase: this.phase,
      roundPhase: this.roundPhase,
      roundNumber: this.roundNumber,
      // null once the match ends — the old timestamp is meaningless and clients would render a stale countdown
      phaseEndsAt: this.phase === "active" && this.roundPhase !== "match-end" ? this.phaseEndsAt : null,
      teamWins: { ...this.teamWins },
      lastRoundWinner: this.lastRoundWinner,
    };
  }

  private broadcastRoomState(): void {
    this.io.room(this.code).emit(WIRE_EVENTS.roomState, this.toRoomState());
  }

  private swapSides(): void {
    for (const player of this.players.values()) {
      player.team = player.team === "A" ? "B" : "A";
    }
    // Wins belong to the group of players, not the side label — swap the tally with them.
    this.teamWins = { A: this.teamWins.B, B: this.teamWins.A };
  }

  private resetPositionsAndHp(): void {
    this.grenades = []; // any grenade still mid-air from the previous round is gone
    for (const player of this.players.values()) {
      player.movement = createInitialMovementState(spawnPointFor(player.team));
      player.hp = 100;
      player.streak = 0; // streaks (and their perks) don't carry between rounds
      player.grenadeCooldownRemaining = 0; // a fresh grenade each round
      // CS-style loadout reset: back to the free pistol each round, full ammo,
      // so the buy phase that follows is where the round's loadout is chosen.
      player.owned = new Set<WeaponId>([DEFAULT_WEAPON]);
      player.equipped = DEFAULT_WEAPON;
      player.switchRemaining = 0;
      player.recoilShots = 0;
      player.lastFireTick = 0;
      for (const weaponId of ALL_WEAPON_IDS) player.weapons[weaponId] = createServerWeaponState(weaponId);
    }
  }

  get currentTick(): number {
    return this.serverTick;
  }
}
