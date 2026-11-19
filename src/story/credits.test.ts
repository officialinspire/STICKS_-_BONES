import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC } from '../assets/audio-manifest';
import fonts from '../assets/fonts/fonts.json';
import ownerAudio from '../assets/owner-audio.json';
import sounds from '../assets/sound-manifest.json';
import { CREDITS } from './credits';

const all = CREDITS.flatMap((p) => p.lines);
const text = JSON.stringify(CREDITS);

describe('end credits come from verified provenance', () => {
  it('names every sound creator in the sound bank with its licence and packs', () => {
    const items = [...sounds.sfx, ...sounds.ambience] as { creator: string; license: string; pack: string }[];
    for (const creator of new Set(items.map((x) => x.creator))) {
      const line = all.find((l) => l.name === creator);
      expect(line, creator).toBeTruthy();
      for (const lic of new Set(items.filter((x) => x.creator === creator).map((x) => x.license))) expect(lic.startsWith('CC0 1.0') && line!.note!.includes('CC0 1.0'), `${creator} ${lic}`).toBe(true);
    }
    for (const pack of new Set(items.filter((x) => x.creator.startsWith('Kenney')).map((x) => x.pack.replace(/^Kenney — /, '')))) expect(text, pack).toContain(pack);
    // Nobody credited for sound who isn't in the bank.
    const soundPage = CREDITS.find((p) => p.title === 'Sound effects')!;
    for (const l of soundPage.lines) expect(items.some((x) => x.creator === l.name), l.name).toBe(true);
  });

  it('lists every music track and result cue by its catalogued title', () => {
    for (const m of MUSIC) expect(text, m.title).toContain(m.title);
    for (const c of ownerAudio.cues) expect(text, c.source).toContain(c.source.split('/').pop()!.replace(/\.mp3$/, ''));
  });

  it('font copyrights and licences are the shipped OFL files, verbatim', () => {
    for (const f of fonts.fonts) {
      const file = f.family.replace(/ /g, '-');
      const first = readFileSync(new URL(`../assets/fonts/${file}-OFL.txt`, import.meta.url), 'utf8').split('\n')[0]!;
      const line = all.find((l) => l.role === f.family);
      expect(line?.name, f.family).toBe(first.replace(/\s*\(https?:[^)]*\)\s*$/, ''));
      expect(f.license).toBe('SIL OFL 1.1');
      expect(line?.note).toBe('SIL Open Font License 1.1');
    }
  });

  it('is short, paginated and plain data', () => {
    expect(CREDITS.length).toBeGreaterThan(1);
    for (const p of CREDITS) expect(p.lines.length, p.title).toBeLessThanOrEqual(4);
    expect(JSON.parse(text)).toEqual(CREDITS);
  });
});
