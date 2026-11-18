import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, chaptersReady, classify, clearOwnCaches, consumeUpdateResume, describeOffline, describeStorage, eraseLocalData, fullButton, jobFrom, LOCAL_PREFIX, OFFLINE_RECORD_SPEC, setUpdateResume, type CacheStatus, type FullJob, type GroupStatus, type OfflineState, type PwaView } from './pwa';
import { readRecord } from './storage';

const TOTAL = 20 * 1_048_576;
const g = (cached: number, total: number, bytes: number, totalBytes: number): GroupStatus => ({ cached, total, bytes, totalBytes });
/** Shell + core saved (Quick Play ready, 1.6 MB), story and media not yet. */
const status = (o: Partial<CacheStatus> = {}): CacheStatus => ({
  build: 'x',
  busy: false,
  progress: null,
  last: { error: null, missing: 0, corrupt: 0, failed: 0 },
  totalBytes: TOTAL,
  totalFiles: 92,
  shell: g(11, 11, 500_000, 500_000),
  core: g(30, 30, 1_177_721, 1_177_721),
  story: g(0, 30, 0, 4_000_000),
  media: g(0, 21, 0, 15_293_159),
  have: [],
  good: 41,
  goodBytes: 1_677_721,
  verifiedBuild: null,
  verified: false,
  damaged: 0,
  retained: 0,
  storage: null,
  ...o,
});

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
  const full = (o: Partial<PwaView> = {}) => ({ offline: { kind: 'ready', status: status() } as OfflineState, status: status(), full: { kind: 'idle' } as FullJob, evicted: false, ...o });
  it('says "Full game ready offline" only when the worker reports this build verified', () => {
    expect(describeOffline(full({ status: status({ verified: true, good: 92, goodBytes: TOTAL }) }))).toEqual({ text: 'Full game ready offline (20.0 MB on this device).', ready: true });
    // Every file present but not re-hashed yet (no marker): not claimed.
    const unverified = describeOffline(full({ status: status({ good: 92, goodBytes: TOTAL, verified: false }) }));
    expect(unverified.ready).toBe(false);
    expect(unverified.text).not.toMatch(/Full game ready/);
    // Verified but a download/verify pass is running (e.g. Repair): progress, not the claim.
    expect(describeOffline(full({ status: status({ verified: true }), full: { kind: 'running', progress: { phase: 'verify', done: 40, total: 92, bytesDone: 0, bytesTotal: 0 } } })).text).toBe('Checking the saved files… 40 of 92');
  });
  it('reports progress, interruption, quota, missing, corrupt, offline, Data Saver and unavailable storage honestly', () => {
    expect(describeOffline(full({ full: { kind: 'running', progress: { phase: 'download', done: 3, total: 92, bytesDone: 1_048_576, bytesTotal: TOTAL } } })).text).toBe('Saving the full game for offline play… 1.0 MB of 20.0 MB');
    expect(describeOffline(full({ full: { kind: 'interrupted', progress: { done: 3, total: 92, bytesDone: 1_048_576, bytesTotal: TOTAL } } })).text).toMatch(/^Quick Play is ready offline\. The full-game download stopped at 1\.0 MB of 20\.0 MB\. It continues by itself while you’re online, or tap Retry\.$/);
    expect(describeOffline(full({ full: { kind: 'quota', needed: 15 * 1_048_576, available: 1_048_576 } })).text).toMatch(/needs 15\.0 MB more, about 1\.0 MB is free\. Free up space, then Retry\./);
    expect(describeOffline(full({ full: { kind: 'missing', count: 1 } })).text).toMatch(/1 file couldn’t be downloaded from the server; everything else is saved/);
    expect(describeOffline(full({ full: { kind: 'corrupt', count: 2 } })).text).toMatch(/2 files arrived damaged and were discarded\. Retry downloads them again/);
    expect(describeOffline(full({ full: { kind: 'waiting' } })).text).toMatch(/The rest of the game \(18\.4 MB\) saves when you’re next online/);
    expect(describeOffline(full({ full: { kind: 'save-data' } })).text).toMatch(/Data Saver is on/);
    expect(describeOffline(full({ offline: { kind: 'unavailable', reason: 'private browsing or blocked site data' } })).text).toMatch(/isn’t storing offline files right now \(private browsing/);
    expect(describeOffline(full({ offline: { kind: 'unsupported' } })).ready).toBe(false);
  });
  it('says when the browser cleared or removed verified files, and that old media stays usable after an update', () => {
    expect(describeOffline(full({ evicted: true, status: status({ good: 0, goodBytes: 0 }) })).text).toMatch(/^The browser cleared this game’s offline files/);
    expect(describeOffline(full({ status: status({ damaged: 3 }) })).text).toMatch(/^3 offline files were removed by the browser\./);
    expect(describeOffline(full({ status: status({ retained: 4 }) })).text).toMatch(/previous version’s music and art stay usable until the new files are checked/);
  });
  it('storage line: our own bytes, the browser’s free estimate, and whether it may clear them', () => {
    expect(describeStorage(status(), { free: 500 * 1_048_576, persisted: false })).toBe('This game keeps 1.6 MB of 20.0 MB on this device. About 500.0 MB free for this site. If the device runs low on space the browser may clear them; they download again while you’re online.');
    expect(describeStorage(status(), { free: null, persisted: true })).toMatch(/keeps these files until you clear them/);
    expect(describeStorage(null, { free: null, persisted: null })).toBe('');
  });
  it('button: Download first, Retry only after a failed run, none once verified', () => {
    expect(fullButton({ status: status({ good: 0, goodBytes: 0 }), full: { kind: 'idle' } })).toEqual({ label: 'Download the full game (20.0 MB)', disabled: false });
    expect(fullButton({ status: status(), full: { kind: 'save-data' } })).toEqual({ label: 'Download the full game (18.4 MB left)', disabled: false });
    expect(fullButton({ status: status(), full: { kind: 'interrupted', progress: null } })).toEqual({ label: 'Retry (18.4 MB left)', disabled: false });
    expect(fullButton({ status: status(), full: { kind: 'running', progress: { done: 1, total: 2, bytesDone: 1, bytesTotal: 2 } } })).toEqual({ label: 'Saving…', disabled: true });
    expect(fullButton({ status: status({ verified: true }), full: { kind: 'verified' } })).toBeNull();
  });
  it('maps the worker’s final report to the job outcome', () => {
    expect(jobFrom(status({ verified: true }), null)).toEqual({ kind: 'verified' });
    expect(jobFrom(status({ last: { error: 'quota', missing: 0, corrupt: 0, failed: 0 } }), 5)).toEqual({ kind: 'quota', needed: TOTAL - 1_677_721, available: 5 });
    expect(jobFrom(status({ last: { error: 'missing', missing: 2, corrupt: 0, failed: 0 } }), null)).toEqual({ kind: 'missing', count: 2 });
    expect(jobFrom(status({ last: { error: 'network', missing: 0, corrupt: 0, failed: 3 } }), null).kind).toBe('interrupted');
    expect(jobFrom(status({ storage: 'SecurityError' }), null).kind).toBe('unavailable');
  });
  it('Quick Play readiness comes from the shell and core files', () => {
    expect(classify(status()).kind).toBe('ready');
    expect(classify(status({ core: g(24, 30, 900_000, 1_168_179) })).kind).toBe('partial');
    expect(classify(status({ shell: g(3, 11, 1, 500_000), busy: true })).kind).toBe('installing');
    expect(classify(status({ storage: 'SecurityError' })).kind).toBe('unavailable');
  });
});

describe('offline record', () => {
  it('migrates the retired v1 story/audio choices to “no verified build recorded”', () => {
    const m = new Map<string, string>([['sticks-and-bones.offline', JSON.stringify({ format: 'sticks-and-bones/offline', version: 1, data: { story: true, audio: true } })]]);
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(readRecord(store, OFFLINE_RECORD_SPEC)).toEqual({ status: 'migrated', value: { verifiedBuild: null } });
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
