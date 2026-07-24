import type { WeaponId } from "../game/weapons/weaponDefs";

/**
 * All SFX are synthesized with the Web Audio API — no audio assets to load,
 * nothing external to fetch. The AudioContext is created lazily on the first
 * play call, which always happens inside a click/keydown handler, so the
 * browser autoplay policy is satisfied without a separate "enable sound" step.
 */

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

const MASTER_GAIN = 0.55;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One second of cached white noise, reused by every shot/click. */
function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface NoiseBurstOptions {
  duration: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  gain: number;
  when?: number;
}

function noiseBurst(ac: AudioContext, opts: NoiseBurstOptions): void {
  const when = ac.currentTime + (opts.when ?? 0);
  const source = ac.createBufferSource();
  source.buffer = getNoiseBuffer(ac);

  const filter = ac.createBiquadFilter();
  filter.type = opts.filterType;
  filter.frequency.value = opts.filterFreq;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(opts.gain * MASTER_GAIN, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.duration);

  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(when, Math.random(), opts.duration + 0.02);
  source.stop(when + opts.duration + 0.05);
}

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  when?: number;
}

function tone(ac: AudioContext, opts: ToneOptions): void {
  const when = ac.currentTime + (opts.when ?? 0);
  const osc = ac.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.frequency, when);
  if (opts.endFrequency) osc.frequency.exponentialRampToValueAtTime(opts.endFrequency, when + opts.duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(opts.gain * MASTER_GAIN, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(when);
  osc.stop(when + opts.duration + 0.05);
}

/**
 * Gunshot: a filtered noise crack plus a low "thump" sweep. The Kar98 is
 * longer, deeper, and louder than the revolver's snap.
 * `volume` scales 0..1 — remote shots pass distance-attenuated values.
 */
export function playGunshot(weaponId: WeaponId, volume = 1): void {
  const ac = getContext();
  if (!ac || volume <= 0.01) return;
  switch (weaponId) {
    case "kar98": // deep, long rifle boom
      noiseBurst(ac, { duration: 0.22, filterType: "lowpass", filterFreq: 900, gain: 0.5 * volume });
      tone(ac, { frequency: 130, endFrequency: 45, duration: 0.2, gain: 0.45 * volume });
      break;
    default: // revolver — sharp snap
      noiseBurst(ac, { duration: 0.09, filterType: "bandpass", filterFreq: 1800, gain: 0.35 * volume });
      tone(ac, { frequency: 190, endFrequency: 70, duration: 0.08, gain: 0.3 * volume });
  }
}

/** Empty-magazine trigger pull: a dry mechanical click. */
export function playDryFire(): void {
  const ac = getContext();
  if (!ac) return;
  noiseBurst(ac, { duration: 0.03, filterType: "highpass", filterFreq: 2500, gain: 0.12 });
}

/** Reload: a couple of magazine/cylinder clicks spread over the start of the reload. */
export function playReload(weaponId: WeaponId): void {
  const ac = getContext();
  if (!ac) return;
  const clicks = weaponId === "kar98" ? [0, 0.18, 0.42] : [0, 0.14];
  for (const when of clicks) {
    noiseBurst(ac, { duration: 0.035, filterType: "bandpass", filterFreq: 3200, gain: 0.14, when });
  }
}

/** Grenade throw: a short airy whoosh as it leaves the hand. */
export function playGrenadeThrow(): void {
  const ac = getContext();
  if (!ac) return;
  noiseBurst(ac, { duration: 0.18, filterType: "bandpass", filterFreq: 700, gain: 0.14 });
  tone(ac, { frequency: 320, endFrequency: 140, duration: 0.16, gain: 0.08, type: "triangle" });
}

/**
 * Grenade detonation: a deep low boom (sub sweep) under a broadband noise crack,
 * with a short tail. `volume` scales 0..1 — remote blasts pass distance-attenuated values.
 */
export function playExplosion(volume = 1): void {
  const ac = getContext();
  if (!ac || volume <= 0.01) return;
  tone(ac, { frequency: 120, endFrequency: 32, duration: 0.5, gain: 0.5 * volume });
  noiseBurst(ac, { duration: 0.35, filterType: "lowpass", filterFreq: 1400, gain: 0.45 * volume });
  noiseBurst(ac, { duration: 0.12, filterType: "highpass", filterFreq: 2600, gain: 0.2 * volume }); // initial crack
}

/** Confirmation blip when one of your shots lands (paired with the visual hitmarker). */
export function playHitmarker(): void {
  const ac = getContext();
  if (!ac) return;
  tone(ac, { frequency: 1400, endFrequency: 900, duration: 0.05, gain: 0.12, type: "square" });
}

/** Brighter two-tone ping for a headshot — a clear step above the body hitmarker. */
export function playHeadshotMarker(): void {
  const ac = getContext();
  if (!ac) return;
  tone(ac, { frequency: 1800, endFrequency: 1300, duration: 0.05, gain: 0.13, type: "square" });
  tone(ac, { frequency: 2400, duration: 0.06, gain: 0.1, type: "square", when: 0.05 });
}

/** Meaty two-tone confirm when one of your shots is the lethal blow — a clear step above the hitmarker. */
export function playKillConfirm(): void {
  const ac = getContext();
  if (!ac) return;
  tone(ac, { frequency: 660, endFrequency: 990, duration: 0.09, gain: 0.17, type: "square" });
  tone(ac, { frequency: 990, endFrequency: 1320, duration: 0.11, gain: 0.13, type: "square", when: 0.05 });
  noiseBurst(ac, { duration: 0.05, filterType: "highpass", filterFreq: 3200, gain: 0.1 });
}

/** Rising arpeggio for a killstreak milestone — longer and higher the bigger the streak. */
export function playKillstreak(streak: number): void {
  const ac = getContext();
  if (!ac) return;
  const steps = Math.min(5, Math.max(2, streak));
  for (let i = 0; i < steps; i++) {
    tone(ac, { frequency: 523 * Math.pow(2, i / 4), duration: 0.13, gain: 0.12, type: "triangle", when: i * 0.07 });
  }
}

/** Low thud when you take damage. */
export function playDamageTaken(): void {
  const ac = getContext();
  if (!ac) return;
  tone(ac, { frequency: 95, endFrequency: 50, duration: 0.16, gain: 0.4 });
  noiseBurst(ac, { duration: 0.1, filterType: "lowpass", filterFreq: 300, gain: 0.18 });
}

/** Soft ground contact — one per stride while running. */
export function playFootstep(volume = 1): void {
  const ac = getContext();
  if (!ac || volume <= 0.01) return;
  noiseBurst(ac, { duration: 0.06, filterType: "lowpass", filterFreq: 520, gain: 0.11 * volume });
  tone(ac, { frequency: 88, endFrequency: 54, duration: 0.05, gain: 0.05 * volume });
}

/** Crisp tick for menu/button presses. */
export function playUiClick(): void {
  const ac = getContext();
  if (!ac) return;
  noiseBurst(ac, { duration: 0.02, filterType: "highpass", filterFreq: 2200, gain: 0.08 });
  tone(ac, { frequency: 660, duration: 0.03, gain: 0.05, type: "square" });
}

export type StingerKind = "buy" | "action" | "win" | "loss" | "draw";

/** Short arpeggios that punctuate round-phase changes — bright for a win, falling for a loss. */
const STINGERS: Record<StingerKind, { notes: number[]; type: OscillatorType; gain: number }> = {
  buy: { notes: [330, 440], type: "triangle", gain: 0.13 },
  action: { notes: [523, 659, 784], type: "square", gain: 0.15 },
  win: { notes: [523, 659, 784, 1047], type: "triangle", gain: 0.17 },
  loss: { notes: [392, 311, 233], type: "sawtooth", gain: 0.15 },
  draw: { notes: [440, 415], type: "triangle", gain: 0.13 },
};

export function playPhaseStinger(kind: StingerKind): void {
  const ac = getContext();
  if (!ac) return;
  const stinger = STINGERS[kind];
  stinger.notes.forEach((freq, i) =>
    tone(ac, { frequency: freq, duration: 0.17, gain: stinger.gain, type: stinger.type, when: i * 0.11 }),
  );
}

// --- Ambience bed: a persistent industrial drone (sub sine + filtered saw +
// airy noise), faded in while in a match and out on leave. The nodes live here
// so the caller only flips it on/off. ---
let ambienceNodes: { osc: OscillatorNode; sub: OscillatorNode; noise: AudioBufferSourceNode; gain: GainNode } | null =
  null;

export function startAmbience(): void {
  const ac = getContext();
  if (!ac || ambienceNodes) return;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05 * MASTER_GAIN, ac.currentTime + 2);
  gain.connect(ac.destination);

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 55;
  const oscFilter = ac.createBiquadFilter();
  oscFilter.type = "lowpass";
  oscFilter.frequency.value = 170;
  osc.connect(oscFilter).connect(gain);

  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 32;
  const subGain = ac.createGain();
  subGain.gain.value = 0.55;
  sub.connect(subGain).connect(gain);

  const noise = ac.createBufferSource();
  noise.buffer = getNoiseBuffer(ac);
  noise.loop = true;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 420;
  noiseFilter.Q.value = 0.6;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0.22;
  noise.connect(noiseFilter).connect(noiseGain).connect(gain);

  osc.start();
  sub.start();
  noise.start();
  ambienceNodes = { osc, sub, noise, gain };
}

export function stopAmbience(): void {
  if (!ctx || !ambienceNodes) return;
  const { osc, sub, noise, gain } = ambienceNodes;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.stop(t + 0.7);
  sub.stop(t + 0.7);
  noise.stop(t + 0.7);
  ambienceNodes = null;
}

// --- Low-HP heartbeat: a self-managed double-thud loop, started when the local
// player is critical and stopped when healed, dead, or the round resets. ---
let lowHpTimer: ReturnType<typeof setInterval> | null = null;

function heartbeat(): void {
  const ac = getContext();
  if (!ac) return;
  tone(ac, { frequency: 70, endFrequency: 45, duration: 0.12, gain: 0.22 });
  tone(ac, { frequency: 64, endFrequency: 42, duration: 0.12, gain: 0.15, when: 0.22 });
}

export function setLowHealthPulse(active: boolean): void {
  if (active && lowHpTimer === null) {
    heartbeat();
    lowHpTimer = setInterval(heartbeat, 950);
  } else if (!active && lowHpTimer !== null) {
    clearInterval(lowHpTimer);
    lowHpTimer = null;
  }
}
