import { describe, expect, it } from 'vitest';
import script from './script.json';
import { insertLines, segments } from './chapters';
import { EVIDENCE, evidenceBeat } from './evidence';
import type { Scene } from './parse';
import { newProgress, type StoryProgress } from './progress';
import { reachedTranscript, skipRecap } from './transcript';

const scenes = (script as { scenes: Scene[] }).scenes;
const sceneOf = (id: string) => scenes.find((s) => s.id === id)!;
const at = (o: Partial<StoryProgress>): StoryProgress => ({ ...newProgress(1), ...o });
// Verbatim reference: every spoken line in the script, including the lines inside each outcome insert.
const allText = new Set(scenes.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'insert' ? insertLines(b).map((l) => l.text ?? '') : [b.text ?? '']))));

describe('reached-only transcript', () => {
  it('stops at the saved beat: nothing later in the scene, nothing from later scenes', () => {
    const t = reachedTranscript(scenes, at({ sceneId: 'chapter-2', part: 'pre', index: 3, completed: ['prologue', 'chapter-1'], outcomes: { 'chapter-1': 'win' } }));
    const ch2 = t.filter((e) => e.scene === 'chapter-2');
    const pre = segments(sceneOf('chapter-2')).pre.slice(0, 4);
    expect(ch2.length).toBeLessThanOrEqual(4);
    for (const e of ch2) if (e.kind === 'line') expect(pre.some((b) => b.text === e.text)).toBe(true);
    const later = segments(sceneOf('chapter-2')).pre.slice(4).filter((b) => b.kind === 'line').map((b) => b.text);
    expect(ch2.some((e) => e.kind === 'line' && later.includes(e.text))).toBe(false);
    expect(t.some((e) => e.scene === 'chapter-3')).toBe(false);
  });

  it('is verbatim and shows each hand’s ACTUAL result with only its insert', () => {
    const t = reachedTranscript(scenes, at({ sceneId: 'chapter-2', part: 'pre', index: 0, completed: ['prologue', 'chapter-1'], outcomes: { 'chapter-1': 'tie' } }));
    for (const e of t) if (e.kind === 'line') expect(allText.has(e.text)).toBe(true);
    expect(t.filter((e) => e.kind === 'result')).toEqual([{ scene: 'chapter-1', kind: 'result', outcome: 'tie', assisted: false }]);
    const seg = segments(sceneOf('chapter-1'));
    const said = new Set(t.filter((e) => e.kind === 'line').map((e) => (e as { text: string }).text));
    for (const b of insertLines(seg.inserts.tie!)) if (b.kind === 'line') expect(said.has(b.text!)).toBe(true);
    for (const b of insertLines(seg.inserts.win!)) if (b.kind === 'line') expect(said.has(b.text!)).toBe(false);
  });

  it('marks assisted hands, and says (never guesses) when a result was recorded before outcomes were kept', () => {
    const t = reachedTranscript(scenes, at({ sceneId: 'chapter-3', part: 'pre', index: 0, completed: ['prologue', 'chapter-1', 'chapter-2'], outcomes: { 'chapter-2': 'loss' }, assisted: ['chapter-2'] }));
    const results = t.filter((e) => e.kind === 'result');
    expect(results).toEqual([
      { scene: 'chapter-1', kind: 'result', outcome: null, assisted: false },
      { scene: 'chapter-2', kind: 'result', outcome: 'loss', assisted: true },
    ]);
    // Chapter 1's insert is unknown, so none of its three inserts appears.
    const seg = segments(sceneOf('chapter-1'));
    const said = new Set(t.filter((e) => e.kind === 'line').map((e) => (e as { text: string }).text));
    for (const o of ['win', 'loss', 'tie'] as const) for (const b of insertLines(seg.inserts[o]!)) if (b.kind === 'line') expect(said.has(b.text!)).toBe(false);
  });

  it('mid-hand and mid-continuation: the hand line appears only once the result exists', () => {
    expect(reachedTranscript(scenes, at({ sceneId: 'chapter-1', part: 'hand', index: 0, completed: ['prologue'] })).some((e) => e.kind === 'result')).toBe(false);
    const t = reachedTranscript(scenes, at({ sceneId: 'chapter-1', part: 'post', index: 0, outcome: 'win', completed: ['prologue', 'chapter-1'], outcomes: { 'chapter-1': 'win' } }));
    expect(t.at(-1)).toMatchObject({ kind: 'line', text: insertLines(segments(sceneOf('chapter-1')).inserts.win!)[0]!.text });
    expect(reachedTranscript(scenes, null)).toEqual([]);
  });
});

describe('recap after Skip', () => {
  it('lists only the evidence inside the skipped range — never later beats, the other part or another scene', () => {
    const sc = sceneOf('chapter-5');
    const items = EVIDENCE.filter((e) => e.scene === 'chapter-5' && e.part === 'pre');
    const beats = items.map((e) => evidenceBeat(sc, e, null)!);
    expect(skipRecap(sc, 'pre', -1, null)).toHaveLength(items.length); // skipping from the start covers them all
    expect(skipRecap(sc, 'pre', Math.max(...beats), null)).toEqual([]); // skipping after them reveals none
    const mid = Math.min(...beats);
    expect(skipRecap(sc, 'pre', mid, null)).toHaveLength(beats.filter((b) => b > mid).length);
    expect(skipRecap(sc, 'post', -1, 'win')).toEqual([]); // Chapter 5 has no post-hand evidence
    expect(skipRecap(sceneOf('chapter-2'), 'pre', -1, null)).toEqual([]); // Chapter 2's only item is after its hand
    expect(skipRecap(sceneOf('chapter-2'), 'post', -1, 'loss')).toHaveLength(1);
  });
});
