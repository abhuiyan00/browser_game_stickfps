import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight } from "three";
import type { MapTheme } from "../maps";

/**
 * Soft additive halo for emissive props — a cheap stand-in for a bloom post
 * pass (which the CSS grayscale pipeline can't host). Reads as a glow from any
 * angle without billboarding, and the brightness filter blooms it a little more.
 */
function Glow({ radius, color = "#ffffff", opacity = 0.5 }: { radius: number; color?: string; opacity?: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

/**
 * Static + animated set-dressing for the arena — a "Diesel Ops" industrial
 * yard (crates, containers, catwalk silhouettes) framing the two teams'
 * spawn lane (A at z=+10, B at z=-10, see server `Room.spawnPointFor`).
 *
 * Visual only: nothing here participates in movement collision or bullet
 * raycasting (both are server-authoritative and only know about players —
 * see PROGRESS.md follow-ups). Props read as cover/verticality but don't
 * block anything yet; that needs matching server-side geometry to avoid
 * client/server position divergence, tracked as a follow-up.
 */
export function Environment({ theme }: { theme: MapTheme }) {
  return (
    <group>
      <Ground color={theme.ground} />
      <PerimeterWalls wall={theme.wall} trim={theme.wallTrim} />
      <SpawnPad position={[0, 0, 10]} /> {/* team A */}
      <SpawnPad position={[0, 0, -10]} /> {/* team B */}
      <ContainerCover position={[-7, 0, 2]} rotationY={0.15} color="#4a5f73" />
      <ContainerCover position={[6.5, 0, -3]} rotationY={-0.2} color="#66513c" />

      <CrateCluster origin={[3, 0, 5]} />
      <CrateCluster origin={[-4.5, 0, -4]} />
      <CrateCluster origin={[1, 0, -7]} />

      <Barrel position={[-2.2, 0, 3.4]} color="#7a2e2e" />
      <Barrel position={[-1.6, 0, 3.9]} color="#585c5f" />
      <Barrel position={[4.8, 0, -1.5]} color="#7a2e2e" />
      <Barrel position={[5.4, 0, -0.9]} color="#585c5f" />
      <Barrel position={[-6.2, 0, -5.6]} color="#585c5f" />
      {/* kept out of x≈0: the A-spawn (0, +10) looks straight down that lane at B */}
      <Barrel position={[2.6, 0, 6.4]} color="#7a2e2e" />

      <SandbagWall position={[2.2, 0, 8.5]} rotationY={0.05} />
      <SandbagWall position={[-2.8, 0, -8.2]} rotationY={-0.1} />

      <PipeRun start={[-14, 0.4, -14]} end={[-14, 0.4, 14]} />
      <PipeRun start={[14, 0.4, -14]} end={[14, 0.4, 14]} />

      <CatwalkTower position={[-16, 0, 0]} />
      <CatwalkTower position={[16, 0, 6]} />

      <RotatingFan position={[-7, 4.6, 2]} />
      {theme.hero === "crane" ? (
        <SwingingCrane basePosition={[13, 0, -12]} />
      ) : (
        <GantryFrame position={[13, 0, -12]} />
      )}
      <PatrolDrone />
      <WarningBeacon position={[6.5, 3.2, -3]} />
      <WarningBeacon position={[-16, 6.2, 0]} />

      {/* --- set-dressing pass 2: denser yard, more verticality, more light anchors --- */}
      <ContainerStack position={[-11, 0, -9]} rotationY={0.35} />
      <ContainerStack position={[10, 0, 9]} rotationY={-0.5} />
      <CrateCluster origin={[-9, 0, 7]} />
      <CrateCluster origin={[8, 0, 3]} />
      <Barrel position={[-8.4, 0, 6.2]} color="#7a2e2e" />
      <Barrel position={[9.2, 0, 2.2]} color="#585c5f" />
      <RubblePile origin={[-3.5, 0, -1.5]} />
      <RubblePile origin={[4.2, 0, 7.5]} />
      <LampPost position={[-4, 0, 10]} />
      <LampPost position={[4, 0, -10]} />
      <SteamVent position={[7.5, 0, -7.5]} />
      <SteamVent position={[-12, 0, 3]} />
      <CableSpan y={6.4} z={-4} />
      <CableSpan y={7.1} z={5} />
      <LaneMarkings />
      {/* industrial skyline beyond the walls — fog turns these into layered silhouettes */}
      <Smokestack position={[-30, 0, -18]} height={16} />
      <Smokestack position={[-26, 0, -24]} height={11} />
      <Smokestack position={[31, 0, 14]} height={14} />
      <GantryFrame position={[0, 0, -32]} />
    </group>
  );
}

/** Two shipping containers stacked with a slight offset — mid-height cover silhouette + verticality. */
function ContainerStack({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 2.6, 6]} />
        <meshStandardMaterial color="#535c48" roughness={0.65} metalness={0.3} />
      </mesh>
      <mesh position={[0.35, 3.95, -0.4]} rotation={[0, -0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 2.6, 6]} />
        <meshStandardMaterial color="#5c4a3a" roughness={0.65} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Low pile of broken slabs — ground clutter that breaks up the open floor. */
function RubblePile({ origin }: { origin: [number, number, number] }) {
  const chunks: Array<{ dx: number; dz: number; w: number; h: number; d: number; ry: number; rz: number }> = [
    { dx: 0, dz: 0, w: 0.7, h: 0.22, d: 0.5, ry: 0.4, rz: 0.08 },
    { dx: 0.5, dz: 0.35, w: 0.45, h: 0.18, d: 0.4, ry: -0.7, rz: -0.12 },
    { dx: -0.4, dz: 0.3, w: 0.5, h: 0.15, d: 0.35, ry: 1.1, rz: 0.05 },
    { dx: 0.15, dz: -0.45, w: 0.35, h: 0.25, d: 0.3, ry: -0.3, rz: 0.15 },
  ];
  return (
    <group position={origin}>
      {chunks.map((c, i) => (
        <mesh key={i} position={[c.dx, c.h / 2, c.dz]} rotation={[0, c.ry, c.rz]} castShadow receiveShadow>
          <boxGeometry args={[c.w, c.h, c.d]} />
          <meshStandardMaterial color="#4c4f52" roughness={0.95} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

/** Industrial lamp post — a warm pool of light that anchors its corner of the yard. */
function LampPost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 3.2, 8]} />
        <meshStandardMaterial color="#2a2d30" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 3.25, 0]} castShadow>
        <boxGeometry args={[0.5, 0.14, 0.24]} />
        <meshStandardMaterial color="#1f2224" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 3.16, 0]}>
        <boxGeometry args={[0.42, 0.04, 0.18]} />
        <meshStandardMaterial color="#ffe0a3" emissive="#ffcf7d" emissiveIntensity={2.2} />
      </mesh>
      <Glow radius={0.28} color="#ffd990" opacity={0.35} />
      <pointLight position={[0, 3, 0]} color="#ffd08a" intensity={1.6} distance={9} decay={1.8} />
    </group>
  );
}

const STEAM_PUFFS = 5;

/** Vent stack leaking a loop of rising, swelling, fading steam puffs — pooled, no allocation. */
function SteamVent({ position }: { position: [number, number, number] }) {
  const puffs = useRef<(Mesh | null)[]>([]);
  const seed = useMemo(() => Math.random() * 10, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < STEAM_PUFFS; i++) {
      const mesh = puffs.current[i];
      if (!mesh) continue;
      const cycle = (t * 0.35 + seed + i / STEAM_PUFFS) % 1; // 0 at the vent, 1 fully dissolved
      mesh.position.set(Math.sin((cycle + i) * 4) * 0.15 * cycle, 0.9 + cycle * 2.2, Math.cos((cycle + i) * 3) * 0.1 * cycle);
      mesh.scale.setScalar(0.25 + cycle * 0.9);
      (mesh.material as MeshBasicMaterial).opacity = 0.16 * (1 - cycle);
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.9, 10]} />
        <meshStandardMaterial color="#3c4043" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.26, 0.22, 0.08, 10]} />
        <meshStandardMaterial color="#2c2f32" roughness={0.5} metalness={0.6} />
      </mesh>
      {Array.from({ length: STEAM_PUFFS }, (_, i) => (
        <mesh key={i} ref={(el) => { puffs.current[i] = el; }}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#c7ccd1" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Overhead power line sagging across the yard, with two hanging work lights. */
function CableSpan({ y, z }: { y: number; z: number }) {
  const half = 24;
  // Fake catenary: three straight segments, the middle one lower.
  const sag = 0.5;
  return (
    <group position={[0, 0, z]}>
      <mesh position={[-half * 0.66, y - sag * 0.45, 0]} rotation={[0, 0, Math.PI / 2 - 0.028]}>
        <cylinderGeometry args={[0.02, 0.02, half * 0.68, 4]} />
        <meshStandardMaterial color="#17191b" roughness={0.8} />
      </mesh>
      <mesh position={[0, y - sag, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, half * 0.68, 4]} />
        <meshStandardMaterial color="#17191b" roughness={0.8} />
      </mesh>
      <mesh position={[half * 0.66, y - sag * 0.45, 0]} rotation={[0, 0, Math.PI / 2 + 0.028]}>
        <cylinderGeometry args={[0.02, 0.02, half * 0.68, 4]} />
        <meshStandardMaterial color="#17191b" roughness={0.8} />
      </mesh>
      {[-8, 8].map((x) => (
        <group key={x} position={[x, y - sag * 0.8, 0]}>
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.6, 4]} />
            <meshStandardMaterial color="#17191b" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.66, 0]}>
            <coneGeometry args={[0.16, 0.18, 8]} />
            <meshStandardMaterial color="#2b2e31" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#fff2cf" emissive="#ffe1a0" emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Painted floor guidance: hazard dashes down the mid-lane and a broad landing stripe per spawn. */
function LaneMarkings() {
  const dashes = [-18, -13.5, -9, -4.5, 0, 4.5, 9, 13.5, 18];
  return (
    <group>
      {dashes.map((z) => (
        <mesh key={z} position={[0, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.35, 2.2]} />
          <meshStandardMaterial color="#8e959b" roughness={0.9} />
        </mesh>
      ))}
      {[12.8, -12.8].map((z) => (
        <mesh key={z} position={[0, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[7, 0.4]} />
          <meshStandardMaterial color="#7d8489" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Distant chimney silhouette past the wall — skyline depth for the fog to eat. */
function Smokestack({ position, height }: { position: [number, number, number]; height: number }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.9, 1.4, height, 10]} />
        <meshStandardMaterial color="#26292c" roughness={0.9} />
      </mesh>
      <mesh position={[0, height + 0.2, 0]}>
        <cylinderGeometry args={[1.05, 0.9, 0.5, 10]} />
        <meshStandardMaterial color="#1e2124" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Big background gantry frame — a wide industrial arch on the far skyline. */
function GantryFrame({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-10, 10].map((x) => (
        <mesh key={x} position={[x, 5.5, 0]}>
          <boxGeometry args={[0.8, 11, 0.8]} />
          <meshStandardMaterial color="#212427" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 10.6, 0]}>
        <boxGeometry args={[22, 1.2, 1]} />
        <meshStandardMaterial color="#26292c" roughness={0.85} />
      </mesh>
      <mesh position={[-4, 9.4, 0]}>
        <boxGeometry args={[1.6, 1.4, 1.2]} />
        <meshStandardMaterial color="#1c1f22" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Ground({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

/**
 * Lit landing pad at each team spawn. The bright emissive ring is the scene's
 * strongest value anchor on the dark floor — it reads instantly through the
 * grayscale filter and doubles as a "you spawn here" cue.
 */
function SpawnPad({ position }: { position: [number, number, number] }) {
  return (
    <group position={[position[0], 0.02, position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 1.7, 40]} />
        <meshStandardMaterial color="#e2e9ef" emissive="#cfe0f0" emissiveIntensity={1.5} roughness={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
        <circleGeometry args={[1.4, 40]} />
        <meshStandardMaterial color="#2c3033" emissive="#1b2833" emissiveIntensity={0.5} roughness={0.7} />
      </mesh>
    </group>
  );
}

// Visual counterpart of ARENA_HALF_EXTENT (playerController.ts / server movement.ts):
// the movement clamp stops players at ±24, these walls are what they see stopping them.
const WALL_DISTANCE = 24.4;
const WALL_LENGTH = WALL_DISTANCE * 2 + 0.6;
const WALL_HEIGHT = 3.2;

function PerimeterWalls({ wall, trim }: { wall: string; trim: string }) {
  const walls: Array<{ position: [number, number, number]; rotationY: number }> = [
    { position: [0, WALL_HEIGHT / 2, -WALL_DISTANCE], rotationY: 0 },
    { position: [0, WALL_HEIGHT / 2, WALL_DISTANCE], rotationY: 0 },
    { position: [-WALL_DISTANCE, WALL_HEIGHT / 2, 0], rotationY: Math.PI / 2 },
    { position: [WALL_DISTANCE, WALL_HEIGHT / 2, 0], rotationY: Math.PI / 2 },
  ];
  return (
    <group>
      {walls.map((w, i) => (
        <group key={i} position={w.position} rotation={[0, w.rotationY, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[WALL_LENGTH, WALL_HEIGHT, 0.6]} />
            <meshStandardMaterial color={wall} roughness={0.85} metalness={0.15} />
          </mesh>
          {/* lighter cap rail so the wall top reads against the fog */}
          <mesh position={[0, WALL_HEIGHT / 2 + 0.08, 0]}>
            <boxGeometry args={[WALL_LENGTH, 0.16, 0.7]} />
            <meshStandardMaterial color="#5a5f63" roughness={0.6} metalness={0.3} />
          </mesh>
          {/* emissive base trim on the inward face — a lit seam that frames the
              play space and keeps the floor/wall boundary readable in grayscale */}
          <mesh position={[0, -WALL_HEIGHT / 2 + 0.07, 0.32]}>
            <boxGeometry args={[WALL_LENGTH, 0.1, 0.04]} />
            <meshStandardMaterial color={trim} emissive={trim} emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ContainerCover({
  position,
  rotationY = 0,
  color,
}: {
  position: [number, number, number];
  rotationY?: number;
  color: string;
}) {
  return (
    <mesh position={[position[0], 1.3, position[2]]} rotation={[0, rotationY, 0]} castShadow receiveShadow>
      <boxGeometry args={[2.4, 2.6, 6]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.35} />
    </mesh>
  );
}

function CrateCluster({ origin }: { origin: [number, number, number] }) {
  const offsets: Array<{ dx: number; dz: number; size: number; ry: number }> = [
    { dx: 0, dz: 0, size: 1, ry: 0.2 },
    { dx: 1.1, dz: 0.4, size: 0.8, ry: -0.3 },
    { dx: -0.9, dz: 0.8, size: 0.9, ry: 0.6 },
  ];
  return (
    <group position={origin}>
      {offsets.map((o, i) => (
        <mesh key={i} position={[o.dx, o.size / 2, o.dz]} rotation={[0, o.ry, 0]} castShadow receiveShadow>
          <boxGeometry args={[o.size, o.size, o.size]} />
          <meshStandardMaterial color="#6b5335" roughness={0.85} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function Barrel({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={[position[0], 0.45, position[2]]} castShadow receiveShadow>
      <cylinderGeometry args={[0.35, 0.35, 0.9, 16]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.4} />
    </mesh>
  );
}

function SandbagWall({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const bags = [-0.6, -0.2, 0.2, 0.6];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {bags.map((x, i) => (
        <mesh key={i} position={[x, 0.25, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.3, 8, 6]} />
          <meshStandardMaterial color="#8a7a58" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function PipeRun({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
  const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
  const mid: [number, number, number] = [(start[0] + end[0]) / 2, start[1], (start[2] + end[2]) / 2];
  const angle = Math.atan2(end[0] - start[0], end[2] - start[2]);
  return (
    <mesh position={mid} rotation={[Math.PI / 2, 0, angle]} receiveShadow>
      <cylinderGeometry args={[0.18, 0.18, length, 10]} />
      <meshStandardMaterial color="#4a4f52" roughness={0.4} metalness={0.7} />
    </mesh>
  );
}

/** Background silhouette only — a catwalk/truss tower, not currently walkable (see file header). */
function CatwalkTower({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} position={[x, 4, z]} castShadow>
          <boxGeometry args={[0.2, 8, 0.2]} />
          <meshStandardMaterial color="#383d42" roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 8, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 0.25, 3]} />
        <meshStandardMaterial color="#41464b" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 8.5, -1.4]}>
        <boxGeometry args={[3, 0.8, 0.08]} />
        <meshStandardMaterial color="#33373c" roughness={0.7} metalness={0.4} />
      </mesh>
    </group>
  );
}

function RotatingFan({ position }: { position: [number, number, number] }) {
  const bladesRef = useRef<Group>(null);
  useFrame((_state, delta) => {
    if (bladesRef.current) bladesRef.current.rotation.z += delta * 2.4;
  });

  return (
    <group position={position}>
      <mesh>
        <torusGeometry args={[1.1, 0.08, 8, 24]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.5} metalness={0.6} />
      </mesh>
      <group ref={bladesRef}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.18, 1.7, 0.04]} />
            <meshStandardMaterial color="#9a9a9a" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SwingingCrane({ basePosition }: { basePosition: [number, number, number] }) {
  const armRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (armRef.current) armRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.5;
  });

  return (
    <group position={basePosition}>
      <mesh position={[0, 3.5, 0]} castShadow>
        <boxGeometry args={[0.5, 7, 0.5]} />
        <meshStandardMaterial color="#453a31" roughness={0.6} metalness={0.4} />
      </mesh>
      <group position={[0, 7, 0]} ref={armRef}>
        <mesh position={[2.5, 0, 0]} castShadow>
          <boxGeometry args={[5, 0.35, 0.35]} />
          <meshStandardMaterial color="#57493e" roughness={0.6} metalness={0.4} />
        </mesh>
        <mesh position={[4.8, -1.4, 0]} castShadow>
          <boxGeometry args={[0.12, 2.6, 0.12]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.7} />
        </mesh>
        <mesh position={[4.8, -2.8, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.5]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.5} metalness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

const DRONE_RADIUS = 9;
const DRONE_HEIGHT = 7.5;
const DRONE_SPEED = 0.25;

function PatrolDrone() {
  const groupRef = useRef<Group>(null);
  const lightRef = useRef<PointLight>(null);
  const bodyRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * DRONE_SPEED;
    const x = Math.sin(t) * DRONE_RADIUS;
    const z = Math.cos(t * 0.6) * (DRONE_RADIUS * 0.5);
    groupRef.current?.position.set(x, DRONE_HEIGHT, z);
    groupRef.current?.rotation.set(0, t + Math.PI / 2, 0);

    const blink = 0.4 + Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.8;
    if (lightRef.current) lightRef.current.intensity = blink;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={bodyRef} castShadow>
        <boxGeometry args={[0.5, 0.15, 0.5]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff3b1f" emissiveIntensity={2} />
      </mesh>
      <group position={[0, -0.12, 0]}>
        <Glow radius={0.16} color="#ff5533" opacity={0.5} />
      </group>
      <pointLight ref={lightRef} color="#ff5533" distance={6} intensity={0.6} />
    </group>
  );
}

function WarningBeacon({ position }: { position: [number, number, number] }) {
  const lightMeshRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);
  const glowRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = 0.3 + Math.abs(Math.sin(clock.elapsedTime * 2.2)) * 1.4;
    if (lightRef.current) lightRef.current.intensity = pulse;
    if (lightMeshRef.current) {
      (lightMeshRef.current.material as MeshStandardMaterial).emissiveIntensity = pulse;
    }
    // The halo breathes with the strobe — fake bloom that swells on each flash.
    if (glowRef.current) {
      const s = 0.7 + pulse * 0.4;
      glowRef.current.scale.setScalar(s);
      (glowRef.current.material as MeshBasicMaterial).opacity = 0.15 + pulse * 0.2;
    }
  });

  return (
    <group position={position}>
      <mesh ref={lightMeshRef}>
        <sphereGeometry args={[0.15, 10, 10]} />
        <meshStandardMaterial color="#ffb020" emissive="#ffb020" emissiveIntensity={1} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial color="#ffb020" transparent opacity={0.3} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight ref={lightRef} color="#ffb020" distance={8} intensity={1} />
    </group>
  );
}
