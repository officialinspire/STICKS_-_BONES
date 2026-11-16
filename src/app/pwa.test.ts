import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, clearOwnCaches, describeOffline, eraseLocalData, LOCAL_PREFIX, type CacheStatus } from './pwa';

const status = (o: Partial<CacheStatus> = {}): CacheStatus => ({ build: 'x', shell: { cached: 7, total: 7 }, assets: { cached: 6, total: 6 }, bytes: 1_668_179, error: null, busy: false, ...o });

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
  it('reports ready with the real byte size, partial, quota and unsupported clearly', () => {
    expect(describeOffline({ kind: 'ready', status: status() })).toEqual({ text: 'Ready to play offline (1.6 MB saved on this device). Music needs a connection.', ready: true });
    const p = describeOffline({ kind: 'partial', status: status({ assets: { cached: 4, total: 6 }, error: 'network' }) });
    expect(p.ready).toBe(true);
    expect(p.text).toMatch(/2 of 6 images still to download.*Repair offline files/);
    expect(describeOffline({ kind: 'quota', status: null }).text).toMatch(/Not enough storage.*still works online/);
    expect(describeOffline({ kind: 'unsupported' }).ready).toBe(false);
    expect(describeOffline({ kind: 'installing', done: 3, total: 6 }).text).toBe('Saving for offline play… 3 of 6 images');
  });
});
