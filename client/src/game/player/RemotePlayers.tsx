import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Stickman, type StickmanPose } from "./Stickman";
import { ENEMY_COLOR, FRIENDLY_COLOR } from "../teamColors";
import type { RemotePlayerInterpolator } from "../../net/remoteInterpolation";
import type { RoomPlayerSummary } from "../../net/messages";

export interface RemotePlayersProps {
  interpolator: RemotePlayerInterpolator;
  selfId: string | null;
  /** Current roster from RoomState — supplies team (friend/foe marker), hp (death pose), and equipped gun per remote. */
  players: RoomPlayerSummary[];
  /** Monotonic confirmed-shot count per player (useNetwork) — edge-triggers third-person fire animation. */
  getFireCount?: (playerId: string) => number;
}

// 5v5 minus the local player = at most 9 remotes. Pre-allocated and toggled
// via `.visible` rather than mounted/unmounted per join/leave, so joins don't
// allocate new meshes mid-match (same principle Phase 7 formalizes for
// bullets/particles).
const MAX_REMOTE_SLOTS = 9;
const EYE_HEIGHT = 1.6;
const MAX_LEAN_SPEED = 7; // matches the walk cap — full lean by run speed, more on a slide
const MAX_LEAN = 0.18; // radians (~10°) of body roll at full strafe
const FLINCH_DECAY = 5; // hit-react bleeds from 1 → 0 in ~0.2s

export function RemotePlayers({ interpolator, selfId, players, getFireCount }: RemotePlayersProps) {
  const groupRefs = useRef<(Group | null)[]>([]);
  const lastPos = useRef<([number, number] | null)[]>(Array.from({ length: MAX_REMOTE_SLOTS }, () => null));
  // One stable pose object per slot — mutated in useFrame, read by each Stickman's own useFrame.
  const poses = useRef<StickmanPose[]>(
    Array.from({ length: MAX_REMOTE_SLOTS }, () => ({
      speed: 0,
      dead: false,
      lean: 0,
      flinch: 0,
      landTick: 0,
      landImpact: 0,
      equipped: "revolver" as const,
      fireTick: 0,
    })),
  );
  // Which player currently occupies each slot — roster shifts recycle a slot to
  // a different player, and their motion/HP history must not carry over.
  const slotIds = useRef<(string | null)[]>(Array.from({ length: MAX_REMOTE_SLOTS }, () => null));
  // Last-seen HP per slot, so a drop can trigger a one-shot hit-react flinch.
  const prevHp = useRef<number[]>(Array.from({ length: MAX_REMOTE_SLOTS }, () => 100));
  // Vertical-position/velocity history per slot, to catch the frame a jumper
  // lands and fire a one-shot squash. Cooldown blocks a re-trigger on the settle.
  const prevFootY = useRef<number[]>(Array.from({ length: MAX_REMOTE_SLOTS }, () => 0));
  const prevVy = useRef<number[]>(Array.from({ length: MAX_REMOTE_SLOTS }, () => 0));
  const landCooldown = useRef<number[]>(Array.from({ length: MAX_REMOTE_SLOTS }, () => 0));

  const selfTeam = players.find((p) => p.id === selfId)?.team ?? null;
  const remotes = useMemo(
    () => players.filter((p) => p.id !== selfId).slice(0, MAX_REMOTE_SLOTS),
    [players, selfId],
  );
  const remotesRef = useRef(remotes);
  remotesRef.current = remotes;

  useFrame((_state, delta) => {
    for (let i = 0; i < MAX_REMOTE_SLOTS; i++) {
      const group = groupRefs.current[i];
      if (!group) continue;

      const player = remotesRef.current[i];
      const sample = player ? interpolator.sample(player.id) : null;
      if (!player || !sample) {
        group.visible = false;
        slotIds.current[i] = null;
        lastPos.current[i] = null;
        prevHp.current[i] = 100; // reset so a recycled slot doesn't flinch on join
        prevVy.current[i] = 0;
        landCooldown.current[i] = 0.3; // brief guard so a fresh spawn doesn't squash on appearance
        continue;
      }

      // The roster shifted and this slot now shows someone else: drop the old
      // occupant's position/HP history so their motion doesn't bleed into the
      // new player as a phantom velocity spike, flinch, or landing squash.
      if (slotIds.current[i] !== player.id) {
        slotIds.current[i] = player.id;
        lastPos.current[i] = null;
        prevHp.current[i] = player.hp;
        prevVy.current[i] = 0;
        landCooldown.current[i] = 0.3;
        poses.current[i].flinch = 0;
      }

      const prev = lastPos.current[i];
      let vx = 0;
      let vz = 0;
      if (prev && delta > 0) {
        vx = (sample.position[0] - prev[0]) / delta;
        vz = (sample.position[2] - prev[1]) / delta;
      }
      lastPos.current[i] = [sample.position[0], sample.position[2]];

      // Lean into the strafe: project world velocity onto the model's right axis
      // (it's yawed about Y) and roll toward it — a slide reads as a hard lean.
      const yaw = sample.yaw;
      const strafe = vx * Math.cos(yaw) - vz * Math.sin(yaw);
      const lean = -Math.max(-1, Math.min(1, strafe / MAX_LEAN_SPEED)) * MAX_LEAN;

      const pose = poses.current[i];
      // A drop in HP that didn't kill kicks off a one-shot flinch; else it bleeds out.
      if (player.hp < prevHp.current[i] && player.hp > 0) pose.flinch = 1;
      else pose.flinch = Math.max(0, pose.flinch - delta * FLINCH_DECAY);
      prevHp.current[i] = player.hp;

      // Landing squash: track vertical velocity from the interpolated height; when
      // a fast descent stops near the floor, bump landTick so the Stickman springs
      // a one-shot squash-and-stretch, its depth scaled by the impact speed.
      const footY = sample.position[1] - EYE_HEIGHT;
      const vy = prev && delta > 0 ? (footY - prevFootY.current[i]) / delta : 0;
      landCooldown.current[i] = Math.max(0, landCooldown.current[i] - delta);
      if (prevVy.current[i] < -3 && vy > -0.8 && footY < 0.3 && landCooldown.current[i] <= 0 && player.hp > 0) {
        pose.landTick += 1;
        pose.landImpact = Math.min(1, -prevVy.current[i] / 9);
        landCooldown.current[i] = 0.25;
      }
      prevFootY.current[i] = footY;
      prevVy.current[i] = vy;

      pose.speed = Math.hypot(vx, vz);
      pose.dead = player.hp <= 0;
      pose.lean = lean;
      pose.equipped = player.equipped;
      pose.fireTick = getFireCount?.(player.id) ?? 0;

      group.position.set(sample.position[0], sample.position[1] - EYE_HEIGHT, sample.position[2]);
      group.rotation.y = sample.yaw;
      group.visible = true;
    }
  });

  return (
    <>
      {Array.from({ length: MAX_REMOTE_SLOTS }, (_, i) => {
        const player = remotes[i];
        const isTeammate = !!player && selfTeam !== null && player.team === selfTeam;
        return (
          <group key={i} visible={false} ref={(el) => { groupRefs.current[i] = el; }}>
            <Stickman
              color={isTeammate ? FRIENDLY_COLOR : ENEMY_COLOR}
              marker={isTeammate}
              poseRef={{ current: poses.current[i] }}
            />
          </group>
        );
      })}
    </>
  );
}
