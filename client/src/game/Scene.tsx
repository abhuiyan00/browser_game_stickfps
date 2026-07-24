import { PlayerRig } from "./player/PlayerRig";
import { RemotePlayers } from "./player/RemotePlayers";
import { WeaponRig, type WeaponRigProps } from "./weapons/WeaponRig";
import { BulletTracers } from "./effects/BulletTracers";
import { ImpactParticles } from "./effects/ImpactParticles";
import { GrenadeProjectiles, GrenadeExplosions } from "./effects/Grenades";
import { GrenadeThrower } from "./effects/GrenadeThrower";
import { PostFX } from "./effects/PostFX";
import { Environment } from "./environment/Environment";
import { SceneEnvironment } from "./environment/SceneEnvironment";
import type { MapTheme } from "./maps";
import type { RemotePlayerInterpolator } from "../net/remoteInterpolation";
import type { GrenadeExplosion, GrenadeSnapshot, HitResult, PlayerInput, RoomPlayerSummary, ShotFired, Vec3 } from "../net/messages";

export interface SceneProps {
  onFireRequest: WeaponRigProps["onFireRequest"];
  onReloadRequest: WeaponRigProps["onReloadRequest"];
  onSwitchRequest: WeaponRigProps["onSwitchRequest"];
  canEngage: WeaponRigProps["canEngage"];
  ownedWeapons: WeaponRigProps["ownedWeapons"];
  onWeaponStateChange?: WeaponRigProps["onStateChange"];
  onPlayerInput?: (input: PlayerInput) => void;
  getAuthoritativePosition?: () => Vec3 | null;
  interpolator: RemotePlayerInterpolator;
  selfId: string | null;
  players: RoomPlayerSummary[];
  drainShotEvents: () => ShotFired[];
  drainHitEvents: () => HitResult[];
  getFireCount?: (playerId: string) => number;
  /** Latest live grenade projectiles (server-broadcast) — rendered as blinking casings. */
  getGrenadeProjectiles?: () => GrenadeSnapshot[];
  /** Drains grenade detonations for the explosion VFX. */
  drainGrenadeExplosions?: () => GrenadeExplosion[];
  /** Expresses a [G] grenade throw (camera origin + aim) — the server owns the actual spawn/cooldown. */
  onGrenadeThrow?: (origin: Vec3, direction: Vec3) => void;
  /** Local player's killstreak perk tier — threaded to the rigs so prediction matches the server's buff. */
  perkTier?: number;
  /** Active map theme (palette + lighting + fog) — server-selected, broadcast in RoomState. */
  theme: MapTheme;
}

export function Scene({
  onFireRequest,
  onReloadRequest,
  onSwitchRequest,
  canEngage,
  ownedWeapons,
  onWeaponStateChange,
  onPlayerInput,
  getAuthoritativePosition,
  interpolator,
  selfId,
  players,
  drainShotEvents,
  drainHitEvents,
  getFireCount,
  getGrenadeProjectiles,
  drainGrenadeExplosions,
  onGrenadeThrow,
  perkTier,
  theme,
}: SceneProps) {
  return (
    <>
      {/* Diesel-ops lighting, now full colour: a cool hemisphere sky fill over a
          warm ground bounce, a hard cool "moon" key for long shadows and depth, a
          warm orange rim from the far corner, and cool blue fog so distant
          silhouettes haze out (aerial perspective) instead of reading as flat grey.
          Fill is kept moderate so the key and the scene's own colour carry the
          contrast rather than a flat even wash. The key light's shadow camera must
          cover the whole ±24m arena: the three.js default is a ±5m box, which leaves
          everything outside it in clamped shadow (a near-black midfield). */}
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, 2.0]} />
      <ambientLight intensity={0.6} color="#8fa2b8" />
      <directionalLight
        position={[10, 16, 6]}
        intensity={2.6}
        color={theme.keyLight}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-8, 6, -10]} intensity={0.8} color={theme.rimLight} />
      {/* cool fill from the opposite corner so faces away from the key don't crush to black */}
      <directionalLight position={[-10, 12, 14]} intensity={0.7} color="#9db4cc" />

      {/* Procedural IBL so the yard's metals actually reflect something (baked
          once from Lightformers — no external HDR). Sets scene.environment. */}
      <SceneEnvironment />

      <Environment theme={theme} />

      <RemotePlayers interpolator={interpolator} selfId={selfId} players={players} getFireCount={getFireCount} />

      <PlayerRig onInput={onPlayerInput} getAuthoritativePosition={getAuthoritativePosition} perkTier={perkTier} />
      <WeaponRig
        onFireRequest={onFireRequest}
        onReloadRequest={onReloadRequest}
        onSwitchRequest={onSwitchRequest}
        canEngage={canEngage}
        ownedWeapons={ownedWeapons}
        perkTier={perkTier}
        onStateChange={onWeaponStateChange}
      />

      <BulletTracers drainShotEvents={drainShotEvents} />
      <ImpactParticles drainHitEvents={drainHitEvents} />
      {getGrenadeProjectiles && <GrenadeProjectiles getGrenadeProjectiles={getGrenadeProjectiles} />}
      {drainGrenadeExplosions && <GrenadeExplosions drainGrenadeExplosions={drainGrenadeExplosions} />}
      {onGrenadeThrow && <GrenadeThrower onThrow={onGrenadeThrow} canThrow={canEngage} />}

      {/* Cinematic post stack — runs before the CSS grayscale filter (App.tsx),
          so emissive accents bloom then desaturate to bright greys. Kept last so
          it composites the finished scene. */}
      <PostFX />
    </>
  );
}
