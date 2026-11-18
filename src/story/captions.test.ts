import { describe, expect, it } from 'vitest';
import { NOTE_BLOCKS, OMIT, playerCaption } from './captions';
import script from './script.json';
import type { Scene } from './parse';

const scenes = script.scenes as unknown as Scene[];
const directions = scenes.flatMap((s) => s.blocks.filter((b) => b.kind === 'direction').map((b) => b.raw));
const all = scenes.flatMap((s) => s.blocks.map((b) => b.raw)).join('\n');

describe('player captions omit only the listed implementation notes', () => {
  it('every note block and omitted fragment exists verbatim in the approved script', () => {
    for (const n of NOTE_BLOCKS) expect(directions).toContain(n);
    for (const f of OMIT) expect(all.includes(f)).toBe(true);
  });
  it('a caption is the bracket text with only listed fragments removed (a verbatim subsequence, never reworded)', () => {
    for (const d of directions) {
      const c = playerCaption(d);
      if (c === null) {
        expect(NOTE_BLOCKS).toContain(d);
        continue;
      }
      let rebuilt = d.slice(1, -1);
      for (const f of OMIT) rebuilt = rebuilt.split(f).join('');
      expect(c).toBe(rebuilt);
      expect(c.length).toBeGreaterThan(0);
    }
  });
  it('no player-facing caption mentions the Virginia past, production terms, or the script structure', () => {
    for (const d of directions) {
      const c = playerCaption(d) ?? '';
      expect(c).not.toMatch(/Virginia|Common continuation|rendered|portraits|off-camera|Captions identify|credits|sequel|text-presence/);
    }
  });
  it('the only on-screen mention of Virginia is Roberto’s own scripted line (Chapter 6), unchanged', () => {
    const lines = scenes.flatMap((s) => s.blocks.filter((b) => b.kind === 'line' && /Virginia/.test(b.raw)).map((b) => `${s.id}: ${b.raw}`));
    expect(lines).toEqual(['chapter-6: COUSIN: “I left Virginia because I was tired of rooms I couldn\'t make better.”']);
  });
  it('the three writer’s-note brackets become silent beats, and examples read as staging', () => {
    for (const n of NOTE_BLOCKS) expect(playerCaption(n)).toBeNull();
    expect(playerCaption('[Common continuation. Rafa draws the steel housing on a napkin.]')).toBe('Rafa draws the steel housing on a napkin.');
    expect(playerCaption('[The water goes still. Cut to title, then credits. Case complete. No compulsory sequel chapter.]')).toBe('The water goes still. Case complete.');
    expect(playerCaption('[Water. A narrow line of warm light lies across dark stone, as though a door has been left open somewhere out of view. Three measured knocks.]')).toBe('Water. A narrow line of warm light lies across dark stone, as though a door has been left open somewhere out of view. Three measured knocks.');
  });
});
