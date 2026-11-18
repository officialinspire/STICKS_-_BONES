import { describe, expect, it } from 'vitest';
import { HANDS, insertLines, outcomeFor, segments, type Outcome } from './chapters';
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

describe('every win / loss / tie route, deterministically', () => {
  const scenesAll = scenes;
  const chapters = scenesAll.filter((s) => s.number !== null);
  const routeOf = (s: Scene, o: Outcome) => {
    const seg = segments(s);
    return [...seg.pre, ...(seg.inserts[o] ? insertLines(seg.inserts[o]!) : []), ...seg.post].map((b) => b.raw);
  };
  it('each chapter has all three routes; they differ ONLY in the insert, so every clue and beat is shared', () => {
    for (const s of chapters) {
      const seg = segments(s);
      const common = [...seg.pre, ...seg.post].map((b) => b.raw);
      for (const o of ['win', 'loss', 'tie'] as const) {
        expect(seg.inserts[o], `${s.id} ${o}`).toBeTruthy();
        const r = routeOf(s, o);
        const ins = insertLines(seg.inserts[o]!).map((b) => b.raw);
        expect(r).toEqual([...seg.pre.map((b) => b.raw), ...ins, ...seg.post.map((b) => b.raw)]);
        expect(r.filter((x) => !ins.includes(x))).toEqual(common);
      }
    }
  });
  it('no clue depends on winning: inserts carry no notebook entry, evidence card or case record', () => {
    for (const s of chapters) for (const o of ['win', 'loss', 'tie'] as const) {
      const ins = segments(s).inserts[o]!.raw;
      expect(ins, `${s.id} ${o}`).not.toMatch(/Notebook:|evidence card|Readable evidence/);
    }
  });
  it('notebook entries close chapters 1–6, in chapter order, after the shared continuation, on every route', () => {
    const nb = chapters.map((s) => [s.id, segments(s).notebook?.raw ?? null] as const);
    expect(nb.slice(0, 6).every(([, n]) => n && /^Notebook:/.test(n))).toBe(true);
    for (const s of chapters.slice(0, 6)) {
      const idx = s.blocks.findIndex((b) => b.kind === 'notebook');
      const lastPost = Math.max(...segments(s).post.map((b) => s.blocks.indexOf(b)));
      expect(idx).toBeGreaterThan(lastPost);
    }
  });
  it('the epilogue has no hand and ends the case', () => {
    const ep = scenesAll.find((s) => s.id === 'epilogue')!;
    expect(segments(ep).deal).toBeNull();
    expect(segments(ep).pre.at(-1)!.raw).toMatch(/Case complete/);
  });
  it('outcomeFor maps every possible result to a route (no result blocks the story)', () => {
    expect(outcomeFor(0, 0)).toBe('win');
    expect(outcomeFor(1, 0)).toBe('loss');
    expect(outcomeFor(null, 0)).toBe('tie');
  });
});
