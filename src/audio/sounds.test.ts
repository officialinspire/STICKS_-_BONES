import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACCENT_SAMPLES, RESULT_CUE_SAMPLE } from './manager';
import { ALL_SAMPLES, MOTIF, sampleUrl, samplesFor, VARIANTS } from './sounds';
import owner from '../assets/owner-audio.json';

describe('the sound bank the game asks for', () => {
  it('every variant, motif knock and result cue has a file in the build', () => {
    const wanted = [...Object.values(VARIANTS).flat(), ...MOTIF.knocks, MOTIF.beyond, ...Object.values(RESULT_CUE_SAMPLE)];
    for (const id of wanted) expect(sampleUrl(id), id).toBeTruthy();
  });

  it('every shipped sample is mapped to something the game plays, and every sound id has a caller', () => {
    const mapped = new Set([...Object.values(VARIANTS).flat(), ...MOTIF.knocks, MOTIF.beyond, ...Object.values(RESULT_CUE_SAMPLE), ...Object.values(ACCENT_SAMPLES).flat()]);
    expect(ALL_SAMPLES.filter((id) => !mapped.has(id))).toEqual([]); // nothing ships that never sounds
    // UI sounds come from the click handler in main.ts (select / back / confirm); table sounds from table.ts.
    const callers = ['src/main.ts', 'src/ui/table.ts'].map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const id of Object.keys(VARIANTS)) expect(new RegExp(`'${id}'`).test(callers), `no caller plays '${id}'`).toBe(true);
    for (const id of ['tile-slide-1', 'tile-slide-2', 'tile-slide-3']) expect(ALL_SAMPLES).not.toContain(id); // retired: never triggered
  });

  it("the slam and the shuffle/deal are the owner's recordings; the retired stand-ins are gone", () => {
    expect(VARIANTS.slam).toEqual(['tile-slam-owner-1', 'tile-slam-owner-2']);
    expect(VARIANTS.shuffle).toEqual(['tile-drop-owner-1']);
    for (const id of [...VARIANTS.slam, ...VARIANTS.shuffle]) expect(owner.sfx.some((e) => e.id === id), id).toBe(true);
    for (const id of ['tile-slap-1', 'tile-slap-2', 'tile-shuffle-1']) expect(ALL_SAMPLES).not.toContain(id);
  });

  it('the result cues are decoded with the table sounds (never at startup) and are never part of the UI group', () => {
    expect(samplesFor('table')).toEqual(expect.arrayContaining(['result-win', 'result-other', 'tile-slam-owner-1', 'tile-drop-owner-1']));
    expect(samplesFor('ui').some((id) => id.startsWith('result-'))).toBe(false);
  });

  it('the cues are 1.5–2.5 s, ≤ −1 dBTP and near −18 LUFS; the trimmed clips lost their trailing silence', () => {
    for (const c of owner.cues) {
      expect(c.durationSec, c.id).toBeGreaterThanOrEqual(1.5);
      expect(c.durationSec, c.id).toBeLessThanOrEqual(2.5);
      expect(c.truePeakDbtp!, c.id).toBeLessThanOrEqual(-1);
      expect(Math.abs(c.integratedLufs! + 18), c.id).toBeLessThanOrEqual(0.5);
      expect(c.cut.decaySec, c.id).toBeLessThanOrEqual(1.0);
    }
    const tails = Object.fromEntries(owner.sfx.map((e) => [e.id, e.boundaries.tailRemovedSec]));
    expect(tails['tile-slam-owner-1']).toBeGreaterThan(5);
    expect(tails['tile-slam-owner-2']).toBeGreaterThan(6);
    expect(tails['tile-drop-owner-1']).toBeGreaterThan(4.5);
    for (const e of owner.sfx) {
      expect(e.durationSec, e.id).toBeLessThan(1);
      expect(e.samplePeakDbfs, e.id).toBeCloseTo(-3, 0);
    }
  });

  it('every upload is catalogued once; the two Stinger (Alt) copies are recorded as one recording', () => {
    expect(owner.originals).toHaveLength(13);
    const dup = owner.originals.find((o) => o.role === 'duplicate')!;
    const of = owner.originals.find((o) => o.file === dup.duplicateOf)!;
    expect(dup.decodedPcmSha256).toBe(of.decodedPcmSha256);
    expect(owner.music.map((m) => m.source)).toEqual(['assets/audio/originals/Promenade After Dark.mp3', 'assets/audio/originals/The Lit Threshold (Alt).mp3']);
  });
});
