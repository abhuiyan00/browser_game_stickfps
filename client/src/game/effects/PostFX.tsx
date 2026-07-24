import { EffectComposer, Bloom, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Cinematic post stack. Runs inside the WebGL canvas, ahead of the App.tsx CSS
 * colour grade, so the scene resolves in HDR here first. Bloom pushes the
 * emissive accents (warning beacons, drone light, muzzle flash, tracers, spawn
 * pads) past the display range so they read as real, coloured light sources
 * rather than flat bright patches — the biggest single "looks like a game, not a
 * tech demo" lever now that the art direction is full colour.
 *
 * Pipeline notes (threejs-impl-post-processing skill):
 *  - @react-three/postprocessing forces `renderer.toneMapping = NoToneMapping`
 *    while mounted, so tone mapping MUST be re-applied here or the image renders
 *    in linear space and looks washed out (anti-pattern: "Bloom Without Tone
 *    Mapping"). ToneMapping is the LAST effect so bloom operates on true HDR.
 *  - Bloom's `luminanceThreshold` is kept at ~1.0 so only genuinely HDR emissive
 *    accents bloom; ordinary lit surfaces (LDR) stay crisp and the scene never
 *    washes out. `mipmapBlur` gives a wide, cheap glow that fits the perf budget
 *    (10 players + effects @ 60fps) far better than a large-kernel gaussian.
 *  - `multisampling={4}` is a deliberate quality/perf midpoint: enough MSAA to
 *    keep the blocky primitive silhouettes clean without the cost of the lib's
 *    default 8x on a full-resolution HDR target.
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={0.85}
        luminanceThreshold={0.95}
        luminanceSmoothing={0.28}
        radius={0.6}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
