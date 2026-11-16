/**
 * PLACEHOLDER sounds, synthesized in code. No sound effects or ambience have
 * been supplied by the owner; these exist so the audio pipeline (buses, caps,
 * scenes) is real and testable. They are NOT final audio — replace them with
 * approved files when available (see docs/AUDIO.md).
 */
import type { SfxId } from './manager';

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 0x12345678;
  for (let i = 0; i < len; i++) {
    // xorshift noise: deterministic, no Math.random needed
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    d[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buf;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Build a placeholder sound into `out`; returns all source nodes and its length. */
export function synthSfx(ctx: AudioContext, out: AudioNode, id: SfxId): { sources: AudioScheduledSourceNode[]; seconds: number } {
  const t = ctx.currentTime + 0.005;
  const sources: AudioScheduledSourceNode[] = [];
  const thump = (at: number, freq: number, peak: number, decay: number) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, at);
    o.frequency.exponentialRampToValueAtTime(freq, at + 0.04);
    const g = ctx.createGain();
    env(g, at, peak, 0.004, decay);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.05);
    sources.push(o);
  };
  const click = (at: number, centre: number, peak: number, decay: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, decay + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = centre;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    env(g, at, peak, 0.002, decay);
    s.connect(f).connect(g).connect(out);
    s.start(at);
    s.stop(at + decay + 0.05);
    sources.push(s);
  };
  switch (id) {
    case 'place': // tile on wood
      click(t, 2600, 0.5, 0.05);
      thump(t, 140, 0.35, 0.09);
      return { sources, seconds: 0.15 };
    case 'knock': // two knuckle knocks on the table
      thump(t, 190, 0.45, 0.08);
      click(t, 900, 0.25, 0.04);
      thump(t + 0.15, 180, 0.4, 0.08);
      click(t + 0.15, 900, 0.22, 0.04);
      return { sources, seconds: 0.3 };
    case 'draw': // tile slid from the boneyard
      click(t, 1500, 0.18, 0.16);
      return { sources, seconds: 0.22 };
    case 'slam':
      thump(t, 75, 0.7, 0.28);
      click(t, 1800, 0.45, 0.08);
      return { sources, seconds: 0.35 };
    case 'tap':
      click(t, 3200, 0.2, 0.025);
      return { sources, seconds: 0.06 };
  }
}

/**
 * A quiet, seamless "distant patio" bed: low-passed noise in a buffer whose
 * last half-second is blended into its first, so the loop point is continuous
 * by construction (tested in synth.test.ts). Placeholder until real ambience exists.
 */
export function ambienceBuffer(ctx: BaseAudioContext, seconds = 6, blend = 0.5): AudioBuffer {
  const src = noiseBuffer(ctx, seconds + blend).getChannelData(0);
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = Math.floor(ctx.sampleRate * blend);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // One-pole low-pass for a soft, distant texture.
  let y = 0;
  const lp = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    y += 0.04 * (src[i]! - y);
    lp[i] = y * 3;
  }
  for (let i = 0; i < len; i++) d[i] = lp[i]!;
  // Crossfade the tail beyond `len` into the head: sample len-1 → 0 is continuous.
  for (let i = 0; i < b; i++) {
    const k = i / b;
    d[i] = lp[len + i]! * (1 - k) + lp[i]! * k;
  }
  // Normalise to a safe peak (the bed is further attenuated by its gain node).
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]!));
  if (peak > 0) for (let i = 0; i < len; i++) d[i] = (d[i]! / peak) * 0.8;
  return buf;
}
