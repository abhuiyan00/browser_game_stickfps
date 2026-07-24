export type WeaponId = "revolver" | "kar98";
export type Team = "A" | "B";
export type Vec3 = [number, number, number];
/** Body part a shot landed on — carried on HitResult to drive headshot feedback. */
export type HitZone = "head" | "body" | "legs";

/** Client -> Server, sent every fixed tick. Movement is never decided by the client (C1). */
export interface PlayerInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Crouch / slide trigger. Optional on the wire so old clients stay compatible. */
  crouch?: boolean;
  yaw: number;
  clientTick: number;
}

/** Client -> Server. Intent only — never a hit result (C1). */
export interface FireRequest {
  weaponId: WeaponId;
  origin: Vec3;
  direction: Vec3;
  clientTick: number;
}

/**
 * Client -> Server. Without this, the server's ammo counters only ever go
 * down — the client's local reload is cosmetic, so every weapon would be
 * permanently empty server-side after its first magazine.
 */
export interface ReloadRequest {
  weaponId: WeaponId;
}

/**
 * Client -> Server. The server tracks which weapon is actually in hand and
 * only accepts fire requests for it (plus an equip settle delay) — otherwise
 * a modified client could interleave both weapons' independent cooldowns for
 * roughly double the fire rate.
 */
export interface SwitchWeaponRequest {
  weaponId: WeaponId;
}

/**
 * Client -> Server. Buy-phase purchase. The server validates the phase, the
 * price against the player's money, and that the weapon isn't already owned —
 * the client's buy menu is UX only (C1).
 */
export interface BuyRequest {
  weaponId: WeaponId;
}

/** Server -> Client, broadcast to the room every fixed tick. */
export interface PositionSnapshot {
  playerId: string;
  position: Vec3;
  yaw: number;
  onGround: boolean;
  /** Authoritative horizontal+vertical velocity — drives remote lean/slide pose and smoother interpolation. Optional for old clients. */
  velocity?: Vec3;
  /** True while the player is crouch-sliding — remote pose reads this. */
  sliding?: boolean;
  serverTick: number;
}

/** Server -> Client. The server is the only place this is ever constructed. */
export interface HitResult {
  shooterId: string;
  targetId: string;
  damage: number;
  /** Where the shot landed. Optional on the wire so old clients tolerate it. */
  zone?: HitZone;
  /** True when this hit reduced the target to 0 HP — drives the client's kill feed. */
  lethal: boolean;
  point: Vec3;
  serverTick: number;
}

/** Server -> shooter's Client, when a FireRequest was valid but did not land a hit. */
export interface FireAck {
  weaponId: WeaponId;
  ammoRemaining: number;
}

/** Server -> whole room, on every resolved fire request (hit or miss) — drives tracer rendering for all clients. */
export interface ShotFired {
  shooterId: string;
  weaponId: WeaponId;
  origin: Vec3;
  direction: Vec3;
}

/** Client -> Server. Intent to throw a frag grenade — the server owns the arc, damage, and cooldown (C1). */
export interface GrenadeThrowRequest {
  origin: Vec3;
  direction: Vec3;
}

/** Server -> whole room, every tick a grenade is live — one entry per airborne projectile, for rendering. */
export interface GrenadeSnapshot {
  id: number;
  position: Vec3;
  /** Owning team — the client can tint a friendly vs. enemy grenade. */
  ownerTeam: Team;
}

/** Server -> whole room, at the moment a grenade detonates — drives the explosion VFX/SFX/shake. */
export interface GrenadeExplosion {
  position: Vec3;
  ownerId: string;
}

export interface RoomPlayerSummary {
  id: string;
  name: string;
  team: Team;
  hp: number;
  money: number;
  /** Weapon currently in hand (server-authoritative). */
  equipped: WeaponId;
  /** Weapons the player owns this round — drives the buy menu's owned/affordable state. */
  owned: WeaponId[];
  /** Match-long kill/death tallies — drive the scoreboard. */
  kills: number;
  deaths: number;
  /** Current killstreak perk tier (0 = none) — the client mirrors the buff in its own prediction. */
  perkTier: number;
}

export type RoundPhase = "buy" | "action" | "round-end" | "match-end";

export interface RoomState {
  code: string;
  /** Cosmetic map id — every client renders the arena theme for this id. */
  mapId: string;
  hostId: string;
  players: RoomPlayerSummary[];
  /** Room-level phase: lobby vs. in-match. */
  phase: string;
  /** Only meaningful once `phase === "active"`. */
  roundPhase: RoundPhase;
  roundNumber: number;
  phaseEndsAt: number | null;
  /** Rounds won per team so far — the match winner is whoever leads when roundPhase hits "match-end". */
  teamWins: Record<Team, number>;
  /** Who took the most recently decided round (drives the round-end banner). Null = draw or none yet. */
  lastRoundWinner: Team | null;
}

export interface NetError {
  message: string;
}

export const WIRE_EVENTS = {
  /** Server -> client, once, right after connect: carries the connection's server-assigned id. */
  connectionReady: "connection-ready",
  createRoom: "create-room",
  joinRoom: "join-room",
  startMatch: "start-match",
  roomState: "room-state",
  playerInput: "player-input",
  positionSnapshotBatch: "position-snapshot-batch",
  fireRequest: "fire-request",
  reloadRequest: "reload-request",
  switchWeapon: "switch-weapon",
  buyRequest: "buy-request",
  fireAck: "fire-ack",
  hitResult: "hit-result",
  shotFired: "shot-fired",
  netError: "net-error",
  addBots: "add-bots",
  cycleMap: "cycle-map",
  throwGrenade: "throw-grenade",
  grenadeState: "grenade-state",
  grenadeExploded: "grenade-exploded",
} as const;
