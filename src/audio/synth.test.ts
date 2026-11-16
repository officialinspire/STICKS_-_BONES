import { describe, expect, it } from 'vitest';
import { ambienceBuffer } from './synth';

/** Minimal stand-in for an AudioContext's buffer factory. */
const ctx = {
  sampleRate: 8000,
  createBuffer: (_ch: number, len: number, rate: number) => {
    const data = new Float32Array(len);
    return { length: len, sampleRate: rate, getChannelData: () => data } as unknown as AudioBuffer;
  },
} as unknown as BaseAudioContext;

describe('placeholder ambience loop', () => {
  it('is continuous across its loop point by construction (no click)', () => {
    const b = ambienceBuffer(ctx, 3, 0.5);
    const d = b.getChannelData(0);
    const steps: number[] = [];
    for (let i = 1; i < d.length; i++) steps.push(Math.abs(d[i]! - d[i - 1]!));
    const seam = Math.abs(d[0]! - d[d.length - 1]!);
    const typical = [...steps].sort((a, z) => a - z)[Math.floor(steps.length * 0.99)]!;
    expect(seam).toBeLessThanOrEqual(typical);
    expect(Math.max(...d.map(Math.abs))).toBeLessThan(1);
  });
});
