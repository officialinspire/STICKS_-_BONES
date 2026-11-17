import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, chaptersReady, clearOwnCaches, consumeUpdateResume, describeAudio, describeOffline, describeStory, eraseLocalData, LOCAL_PREFIX, setUpdateResume, type CacheStatus, type GroupStatus } from './pwa';

const g = (cached: number, total: number, bytes: number, totalBytes: number, o: Partial<GroupStatus> = {}): GroupStatus => ({ cached, total, bytes, totalBytes, error: null, busy: false, ...o });
const status = (o: Partial<CacheStatus> = {}): CacheStatus => ({ build: 'x', shell: g(11, 11, 500_000, 500_000), core: g(30, 30, 1_168_179, 1_168_179), story: g(0, 23, 0, 3_358_300), audio: g(0, 7, 0, 9_591_216), ...o });

describe('PWA isolation', () => {
  it('clearOwnCaches deletes only this app’s caches — never another INSPIRE app’s or a look-alike', async () => {
    const names = new Set([
      `${CACHE_PREFIX}shell:abc`,
      `${CACHE_PREFIX}assets:v1`,
      'inspire:other-app:v1',
      'inspire:sticks-and-bones-fan:v1', // look-alike without the ':' namespace separator
      'workbox-precache-v2',
      'sticks-and-bones', // unnamespaced look-alike
    ]);
    const store = { keys: async () => [...names], delete: async (n: string) => names.delete(n) };
    const removed = await clearOwnCaches(store);
    expect(removed.sort()).toEqual([`${CACHE_PREFIX}assets:v1`, `${CACHE_PREFIX}shell:abc`]);
    expect([...names].sort()).toEqual(['inspire:other-app:v1', 'inspire:sticks-and-bones-fan:v1', 'sticks-and-bones', 'workbox-precache-v2']);
  });

  it('eraseLocalData removes only this app’s keys (saves, settings, stats, quarantines)', () => {
    const data = new Map<string, string>([
      [`${LOCAL_PREFIX}save`, '1'],
      [`${LOCAL_PREFIX}settings`, '1'],
      [`${LOCAL_PREFIX}stats`, '1'],
      [`${LOCAL_PREFIX}save.quarantine`, '1'],
      ['other-app.save', 'keep'],
      ['sticks-and-bones-fan-page', 'keep'],
      ['inspire:sticks-and-bones:shell', 'keep'],
    ]);
    const store = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, removeItem: (k: string) => void data.delete(k) };
    const removed = eraseLocalData(store);
    expect(removed).toHaveLength(4);
    expect([...data.keys()].sort()).toEqual(['inspire:sticks-and-bones:shell', 'other-app.save', 'sticks-and-bones-fan-page']);
    expect(eraseLocalData(null)).toEqual([]);
  });
});

describe('offline status wording', () => {
  it('reports Quick Play ready with the real byte size, partial, quota and unsupported clearly', () => {
    expect(describeOffline({ kind: 'ready', status: status() })).toEqual({ text: 'Quick Play is ready offline (1.6 MB on this device).', ready: true });
    const p = describeOffline({ kind: 'partial', status: status({ core: g(24, 30, 900_000, 1_168_179, { error: 'network' }) }) });
    expect(p.ready).toBe(true);
    expect(p.text).toMatch(/6 of 30 table files still to download.*Repair offline files/);
    expect(describeOffline({ kind: 'quota', status: null }).text).toMatch(/Not enough storage.*still works online/);
    expect(describeOffline({ kind: 'unsupported' }).ready).toBe(false);
    expect(describeOffline({ kind: 'installing', progress: { done: 3, total: 6, bytesDone: 1, bytesTotal: 2 } }).text).toBe('Saving for offline play… 3 of 6 files');
  });
  it('says honestly whether only the app, some chapters or the whole story is ready, with measured sizes', () => {
    expect(describeStory(status(), { kind: 'idle' }, 0, 9)).toMatch(/Only the app is ready offline/);
    expect(describeStory(status(), { kind: 'idle' }, 2, 9)).toMatch(/2 of 9 story scenes are ready offline/);
    expect(describeStory(status({ story: g(23, 23, 3_358_300, 3_358_300) }), { kind: 'idle' }, 9, 9)).toBe('The whole story is ready offline (3.2 MB).');
    expect(describeStory(status(), { kind: 'running', progress: { done: 3, total: 23, bytesDone: 1_048_576, bytesTotal: 3_358_300 } }, 1, 9)).toBe('Downloading the whole story… 1.0 MB of 3.2 MB');
    expect(describeStory(status(), { kind: 'interrupted', progress: { done: 3, total: 23, bytesDone: 1_048_576, bytesTotal: 3_358_300 } }, 1, 9)).toMatch(/interrupted at 1\.0 MB of 3\.2 MB — Retry continues/);
    expect(describeStory(status(), { kind: 'quota', needed: 3_358_300, available: 1_048_576 }, 1, 9)).toMatch(/needs 3\.2 MB, about 1\.0 MB is free/);
    expect(describeStory(null, { kind: 'idle' }, 0, 9)).toMatch(/need a connection/);
  });
  it('discloses the optional audio size separately and reports skipped files', () => {
    expect(describeAudio(status(), { kind: 'idle' })).toMatch(/optional 9\.1 MB extra download/);
    expect(describeAudio(status({ audio: g(7, 7, 9_591_216, 9_591_216) }), { kind: 'idle' })).toMatch(/saved for offline play \(9\.1 MB\)/);
    expect(describeAudio(status(), { kind: 'done', missing: 1 })).toMatch(/1 audio file was unavailable and skipped/);
  });
});

describe('chapter readiness', () => {
  it('a chapter is ready only when every one of its files is saved', () => {
    const files = { 'chapter-1': ['assets/a.webp', 'assets/b.webp'], 'chapter-2': ['assets/c.webp'] };
    expect(chaptersReady(['assets/a.webp', 'assets/b.webp'], files)).toEqual(['chapter-1']);
    expect(chaptersReady(['./assets/c.webp', 'assets/a.webp'], files)).toEqual(['chapter-2']);
    expect(chaptersReady(undefined, files)).toEqual([]);
  });
});

describe('update resume', () => {
  it('is consumed exactly once', () => {
    const m = new Map<string, string>();
    const ss = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    setUpdateResume({ to: 'story' }, ss);
    expect(consumeUpdateResume(ss)).toEqual({ to: 'story' });
    expect(consumeUpdateResume(ss)).toBeNull();
    m.set('sticks-and-bones.update-resume', '{"to":"elsewhere"}');
    expect(consumeUpdateResume(ss)).toBeNull();
  });
});
