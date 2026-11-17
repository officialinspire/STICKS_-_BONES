import { describe, expect, it } from 'vitest';
import { loopBounds, seamJump } from './loop';

/** A smooth "bed" with decoder-style digital silence at both edges. */
function padded(lead: number, body: number, tail: number): Float32Array {
  const a = new Float32Array(lead + body + tail);
  for (let i = 0; i < body; i++) a[lead + i] = 0.3 * Math.sin((2 * Math.PI * i) / body) + 0.05 * Math.sin(i * 0.37);
  a[lead] = 0.002; // the authored loop starts on a real (non-silent) sample
  return a;
}

describe('ambience loop bounds', () => {
  it('skips encoder priming and padding so the wrap joins real audio', () => {
    const c = padded(1105, 44100, 700);
    const b = loopBounds([c, c], 8820);
    expect(b.start).toBe(1105);
    expect(b.end).toBe(1105 + 44100 - 0); // last loud sample is inside the body
    // Both sides of the wrap are real audio, and the join is within a few typical sample steps.
    expect(Math.abs(c[b.end - 1]!)).toBeGreaterThan(1e-4);
    expect(Math.abs(c[b.start]!)).toBeGreaterThan(1e-4);
    expect(seamJump([c], b)).toBeLessThan(6);
  });

  it('keeps a file with no silent edges exactly as authored', () => {
    const c = new Float32Array(1000).map((_, i) => 0.2 * Math.sin(i / 10) + 0.21);
    expect(loopBounds([c], 200)).toEqual({ start: 0, end: 1000 });
  });

  it('never trims deep into a file that is quiet throughout (scan is bounded)', () => {
    const c = new Float32Array(10000);
    const b = loopBounds([c], 500);
    expect(b).toEqual({ start: 0, end: 10000 });
  });
});
