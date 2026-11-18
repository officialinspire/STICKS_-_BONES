import { describe, expect, it } from 'vitest';
import { playerCaption } from './captions';
import { EVIDENCE, evidenceBeat, reachedEvidence } from './evidence';
import type { Scene } from './parse';
import { newProgress, type StoryProgress } from './progress';
import script from './script.json';

const scenes = script.scenes as unknown as Scene[];
const at = (p: Partial<StoryProgress>): StoryProgress => ({ ...newProgress(1), ...p });

describe('Evidence: approved text, reached milestones only', () => {
  it('every item is anchored to exactly one verbatim stage direction in its scene and part', () => {
    for (const e of EVIDENCE) {
      const scene = scenes.find((s) => s.id === e.scene)!;
      expect(scene.blocks.filter((b) => b.raw === e.at), e.id).toHaveLength(1);
      expect(evidenceBeat(scene, e, 'win'), e.id).not.toBeNull();
      expect(playerCaption(e.at), e.id).toBeTruthy();
    }
  });

  it('shows the on-screen caption verbatim (production notes stripped by the approved list, nothing rewritten)', () => {
    const all = reachedEvidence(scenes, at({ sceneId: 'epilogue', part: 'end', completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7'] }));
    expect(all.map((e) => e.id)).toEqual(EVIDENCE.map((e) => e.id));
    for (const r of all) expect(r.text).toBe(playerCaption(EVIDENCE.find((e) => e.id === r.id)!.at));
    expect(all.find((e) => e.id === 'vale-directive')!.text).toMatch(/^Vale wrote, No staff access/);
    expect(all.some((e) => /not a magical reveal|Common continuation/.test(e.text))).toBe(false);
  });

  it('nothing before it is reached; nothing from a later chapter (no spoilers)', () => {
    expect(reachedEvidence(scenes, null)).toEqual([]);
    expect(reachedEvidence(scenes, at({ sceneId: 'chapter-1', part: 'pre', index: 3 }))).toEqual([]);
    // In Chapter 2 before the hand: its post-hand item is not reached yet.
    expect(reachedEvidence(scenes, at({ sceneId: 'chapter-2', part: 'hand', index: 0 }))).toEqual([]);
  });

  it('within the current scene, an item appears exactly when its beat is reached', () => {
    const ch5 = scenes.find((s) => s.id === 'chapter-5')!;
    const sketch = EVIDENCE.find((e) => e.id === 'sketch-photo')!;
    const beat = evidenceBeat(ch5, sketch, null)!;
    const ids = (index: number) => reachedEvidence(scenes, at({ sceneId: 'chapter-5', part: 'pre', index })).map((e) => e.id);
    expect(ids(beat - 1)).toEqual(['gate-access', 'photo-statement']);
    expect(ids(beat)).toEqual(['gate-access', 'photo-statement', 'sketch-photo']);
  });

  it('post-hand items count the outcome insert lines before them (every route)', () => {
    const ch2 = scenes.find((s) => s.id === 'chapter-2')!;
    const gate = EVIDENCE.find((e) => e.id === 'gate-access')!;
    for (const outcome of ['win', 'loss', 'tie'] as const) {
      const beat = evidenceBeat(ch2, gate, outcome)!;
      const before = reachedEvidence(scenes, at({ sceneId: 'chapter-2', part: 'post', index: beat - 1, outcome }));
      const on = reachedEvidence(scenes, at({ sceneId: 'chapter-2', part: 'post', index: beat, outcome }));
      expect(before, outcome).toEqual([]);
      expect(on.map((e) => e.id), outcome).toEqual(['gate-access']);
    }
  });

  it('a scene the case has moved past shows all of its items, whatever the outcome', () => {
    const ids = reachedEvidence(scenes, at({ sceneId: 'chapter-6', part: 'pre', index: 0, outcome: null })).map((e) => e.id);
    expect(ids).toEqual(['gate-access', 'photo-statement', 'sketch-photo', 'water-record']);
  });
});
