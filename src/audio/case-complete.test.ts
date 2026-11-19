import { describe, expect, it } from 'vitest';
import ownerAudio from '../assets/owner-audio.json';
import { CUE_LOOPS } from './case-complete';

describe('cue loop points', () => {
  it('mirror the builder record exactly (src/assets/owner-audio.json cues[].loop), never invented', () => {
    const recorded = Object.fromEntries((ownerAudio.cues as { id: string; loop?: { start: number; end: number; auditioned: boolean } }[]).filter((c) => c.loop).map((c) => [c.id, c.loop]));
    expect(CUE_LOOPS).toEqual(recorded);
  });
});
