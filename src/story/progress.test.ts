import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../app/save';
import { clearStory, newProgress, readStory, STORY_KEY, writeStory, type StoryProgress } from './progress';
import { speakerOf } from '../ui/story-ui';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('story progress record', () => {
  it('is separate from Quick Play saves and round-trips', () => {
    expect(STORY_KEY).not.toBe(SAVE_KEY);
    const s = mem();
    const p = { ...newProgress(1), index: 3, completed: ['prologue' as const], textScale: 1.15 as const };
    expect(writeStory(s, p)).toBe(true);
    expect(readStory(s).value).toEqual(p);
    expect(s.m.has(SAVE_KEY)).toBe(false);
    clearStory(s);
    expect(readStory(s).status).toBe('missing');
  });

  it('rejects damaged or unknown data instead of trusting it', () => {
    const s = mem();
    s.setItem(STORY_KEY, JSON.stringify({ format: 'sticks-and-bones/story', version: 1, data: { sceneId: 'chapter-99', index: 0, completed: [], textScale: 1 } }));
    expect(readStory(s).value).toBeNull();
    s.setItem(STORY_KEY, JSON.stringify({ format: 'sticks-and-bones/story', version: 1, data: { sceneId: 'prologue', index: -4, completed: [], textScale: 1 } }));
    expect(readStory(s).value).toBeNull();
  });

  it('migrates v2 to v3: the current outcome is kept, earlier outcomes stay unknown (never guessed), nothing assisted', () => {
    const s = mem();
    s.setItem(STORY_KEY, JSON.stringify({ format: 'sticks-and-bones/story', version: 2, data: { sceneId: 'chapter-3', part: 'post', index: 2, outcome: 'tie', completed: ['prologue', 'chapter-1', 'chapter-2', 'chapter-3'], textScale: 1, startedAt: 5, hand: null } }));
    const r = readStory(s);
    expect(r.status).toBe('migrated');
    expect(r.value).toMatchObject({ sceneId: 'chapter-3', outcome: 'tie', outcomes: { 'chapter-3': 'tie' }, assisted: [] });
    expect(r.value!.outcomes['chapter-1']).toBeUndefined();
    // v3 round-trips the per-scene outcomes and assistance; junk entries are dropped.
    const p: StoryProgress = { ...r.value!, outcomes: { 'chapter-1': 'win', 'chapter-3': 'tie' }, assisted: ['chapter-3'] };
    expect(writeStory(s, p)).toBe(true);
    expect(readStory(s).value).toEqual(p);
    s.setItem(STORY_KEY, JSON.stringify({ format: 'sticks-and-bones/story', version: 3, data: { ...p, outcomes: { 'chapter-1': 'won', 'chapter-99': 'win' }, assisted: ['chapter-3', 'chapter-3', 'nope'] } }));
    expect(readStory(s).value).toMatchObject({ outcomes: {}, assisted: ['chapter-3'] });
  });

  it('reports a refused write (never claims it saved)', () => {
    const full = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    expect(writeStory(full, newProgress(1))).toBe(false);
    expect(writeStory(null, newProgress(1))).toBe(false);
  });
});

describe('speaker labels', () => {
  it('maps script tags to display names and keeps the qualifier', () => {
    expect(speakerOf('COUSIN')).toMatchObject({ label: 'Cousin', qualifier: null });
    expect(speakerOf('COUSIN, narration')).toMatchObject({ label: 'Cousin', qualifier: 'narration' });
    expect(speakerOf('WORKER, text')).toMatchObject({ label: 'Worker', qualifier: 'text' });
  });
});
