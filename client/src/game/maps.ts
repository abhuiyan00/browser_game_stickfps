/**
 * Map themes. Maps are purely COSMETIC — movement + hit detection are
 * server-authoritative and only know the ±24m arena bounds, so a "map" is a
 * palette + lighting + fog + a couple of hero-prop swaps over the same play
 * space. The server picks one `MapId` per room and broadcasts it in RoomState so
 * every client renders the same place; the client owns the look here.
 *
 * The `MapId` strings must match the server's list (server/src/rooms/Room.ts
 * `MAP_IDS`). Add a map by adding a theme here and the same id there.
 */
export type MapId = "foundry7" | "coldline9";

export interface MapTheme {
  id: MapId;
  name: string;
  subtitle: string;
  /** Scene background + fog (aerial haze). */
  background: string;
  fog: { color: string; near: number; far: number };
  /** Lighting rig colours. */
  hemiSky: string;
  hemiGround: string;
  keyLight: string;
  rimLight: string;
  /** The two biggest surfaces, themed per map. */
  ground: string;
  wall: string;
  wallTrim: string;
  /** Which optional hero prop this map shows (Environment branches on it). */
  hero: "crane" | "gantry";
}

export const MAPS: Record<MapId, MapTheme> = {
  // Warm, soot-and-rust munitions yard at dusk (the original arena).
  foundry7: {
    id: "foundry7",
    name: "FOUNDRY-7",
    subtitle: "DECOMMISSIONED MUNITIONS YARD",
    background: "#1e242b",
    fog: { color: "#33404e", near: 34, far: 120 },
    hemiSky: "#9fbadb",
    hemiGround: "#4a3b2e",
    keyLight: "#cfe0f0",
    rimLight: "#ffb020",
    ground: "#3f4244",
    wall: "#4a5055",
    wallTrim: "#8fa2b8",
    hero: "crane",
  },
  // Cold, blue-white frontier depot — same yard, frozen over and floodlit.
  coldline9: {
    id: "coldline9",
    name: "COLDLINE-9",
    subtitle: "FROZEN FRONTIER DEPOT",
    background: "#12181f",
    fog: { color: "#20303f", near: 30, far: 110 },
    hemiSky: "#bcd4ea",
    hemiGround: "#2b3742",
    keyLight: "#e6f0ff",
    rimLight: "#57b6ff",
    ground: "#3a4750",
    wall: "#495863",
    wallTrim: "#bcd4ea",
    hero: "gantry",
  },
};

export const MAP_IDS = Object.keys(MAPS) as MapId[];
export const DEFAULT_MAP: MapId = "foundry7";

/** Safe lookup — falls back to the default map for an unknown/absent id. */
export function getMapTheme(id: string | null | undefined): MapTheme {
  return MAPS[(id ?? DEFAULT_MAP) as MapId] ?? MAPS[DEFAULT_MAP];
}
