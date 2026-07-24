import { Environment, Lightformer } from "@react-three/drei";

/**
 * Procedural image-based lighting (IBL) for the arena's PBR materials.
 *
 * The yard is full of metallic surfaces — shipping containers, barrels, the
 * crane, pipes (metalness 0.3–0.6). A metal reflects its surroundings, so with
 * no environment map those surfaces have nothing to reflect and read as flat,
 * near-black shapes ("toy-like", DESIGN_PROMPT §5.1). This is the exact mistake
 * the threejs-impl-lighting skill flags: "missing environment maps for PBR."
 *
 * The fix, kept within the no-external-assets constraint: bake a tiny cube map
 * from a handful of emissive `<Lightformer>` planes — no HDR file, no network.
 * `frames={1}` bakes once at mount (the lightformers are static), so runtime
 * cost is just a cube-map sample in the standard-material shader; `resolution`
 * is small because reflections in this grimy industrial scene need no fine detail.
 *
 * The lightformers echo the three scene lights — a cool overhead sky fill, a
 * bright cool "moon" key from the directional at [10,16,6], and a dim warm rim
 * opposite — so tinted reflections fall where the direct lighting already does.
 * `environmentIntensity` is deliberately low so this adds specular life to the
 * metals without lifting the mood into a flat, evenly-lit look.
 */
export function SceneEnvironment() {
  return (
    <Environment frames={1} resolution={128} environmentIntensity={0.35}>
      {/* cool overhead sky fill */}
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#8fa6c4"
        scale={[50, 50, 1]}
        position={[0, 22, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {/* bright cool key highlight — mirrors the "moon" directional light */}
      <Lightformer form="rect" intensity={3} color="#cfe0f0" scale={[14, 14, 1]} position={[18, 15, 11]} target />
      {/* warm low rim — mirrors the orange rim light on the far side */}
      <Lightformer form="rect" intensity={1.1} color="#ffb060" scale={[18, 7, 1]} position={[-16, 4, -18]} target />
      {/* faint ground bounce so undersides don't crush to pure black */}
      <Lightformer
        form="rect"
        intensity={0.12}
        color="#3a4048"
        scale={[50, 50, 1]}
        position={[0, -8, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </Environment>
  );
}
