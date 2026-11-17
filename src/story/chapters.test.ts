import { describe, expect, it } from 'vitest';
import { HANDS, insertLines, outcomeFor, segments } from './chapters';
import type { Scene } from './parse';
import script from './script.json';

const scenes = script.scenes as unknown as Scene[];

describe('chapter hands match the approved script', () => {
  it('each chapter hand mode and named opponents come from its Hand field', () => {
    for (const s of scenes.filter((x) => x.number !== null)) {
      const h = HANDS[s.id]!;
      const hand = s.hand!;
      const word = { draw2: 'Draw', block2: 'Block', partnership4: 'Partnership' }[h.mode];
      expect(hand.startsWith(word), `${s.id}: ${hand}`).toBe(true);
      for (const name of Object.values(h.seatNames).filter((n) => n !== 'Cousin')) {
        expect(hand.includes(name!.replace('Tío ', '')) || hand.includes(name!), `${s.id}: ${name} in "${hand}"`).toBe(true);
      }
    }
  });

  it('segments every chapter into pre / deal / three inserts / post, losing nothing that is shown', () => {
    for (const s of scenes.filter((x) => x.number !== null)) {
      const seg = segments(s);
      expect(seg.deal, s.id).not.toBeNull();
      expect(Object.keys(seg.inserts).sort(), s.id).toEqual(['loss', 'tie', 'win']);
      expect(seg.pre.length, `${s.id} pre`).toBeGreaterThan(0);
      expect(seg.post.length, `${s.id} post`).toBeGreaterThan(0);
      const shown = s.blocks.filter((b) => b.kind === 'line' || b.kind === 'direction');
      expect(seg.pre.length + seg.post.length, `${s.id}: every shown block is in pre or post`).toBe(shown.length);
    }
  });

  it('insert paragraphs split into verbatim spoken lines', () => {
    for (const s of scenes.filter((x) => x.number !== null)) {
      for (const ins of Object.values(segments(s).inserts)) {
        const lines = insertLines(ins!);
        expect(lines.length, ins!.raw).toBeGreaterThan(0);
        for (const l of lines) expect(ins!.raw.includes(l.raw), l.raw).toBe(true);
      }
    }
  });

  it('every result advances: win, loss and blocked tie all have an outcome', () => {
    expect(outcomeFor(0, 0)).toBe('win');
    expect(outcomeFor(1, 0)).toBe('loss');
    expect(outcomeFor(null, 0)).toBe('tie');
  });
});
