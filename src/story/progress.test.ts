import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../app/save';
import { clearStory, newProgress, readStory, STORY_KEY, writeStory } from './progress';
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
