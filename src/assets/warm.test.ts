import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetWarm, _setWarmDeadline, DEFERRED_ASSETS, essentialAssets, retryWarm, warm, warmState, warmStats } from './warm';

/** Fake Image: decode() resolves/rejects when the test says so. */
const pending: { src: string; ok: (v?: unknown) => void; fail: (e: unknown) => void }[] = [];
let inFlight = 0;
let maxInFlight = 0;
class FakeImage {
  decoding = '';
  #src = '';
  set src(v: string) {
    this.#src = v;
  }
  get src() {
    return this.#src;
  }
  decode() {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise((ok, fail) =>
      pending.push({
        src: this.#src,
        ok: (v) => (inFlight--, ok(v)),
        fail: (e) => (inFlight--, fail(e)),
      }),
    );
  }
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  _resetWarm();
  pending.length = 0;
  inFlight = maxInFlight = 0;
  (globalThis as { Image?: unknown }).Image = FakeImage;
});
afterEach(() => delete (globalThis as { Image?: unknown }).Image);

describe('asset warm-up', () => {
  it('never runs more than the concurrency limit at once, and finishes everything', async () => {
    const all = warm([...essentialAssets(), ...DEFERRED_ASSETS]);
    expect(pending).toHaveLength(2);
    while (pending.length) {
      pending.shift()!.ok();
      await flush();
    }
    expect(await all).toEqual([true, true, true, true, true, true]);
    expect(maxInFlight).toBe(2);
  });

  it('essentials start first; front-queued ids jump ahead of background work', async () => {
    void warm(essentialAssets());
    void warm(DEFERRED_ASSETS);
    expect(pending.map((p) => p.src)).toHaveLength(2);
    expect(warmState('env.neighborhood-patio')).toBe('loading');
    expect(warmState('cousin.anim.slam')).toBe('queued');
    void warm(['cousin.anim.slam'], { front: true });
    pending.shift()!.ok();
    await flush();
    expect(warmState('cousin.anim.slam')).toBe('loading');
  });

  it('a failed image resolves false, frees its slot and is not retried', async () => {
    const r = warm(['fx.sheet', 'tile.atlas', 'table.weathered']);
    pending.shift()!.fail(new Error('404'));
    await flush();
    expect(warmState('fx.sheet')).toBe('failed');
    expect(pending).toHaveLength(2); // the next one started
    pending.splice(0).forEach((p) => p.ok());
    expect(await r).toEqual([false, true, true]);
    void warm(['fx.sheet']);
    expect(pending).toHaveLength(0);
  });

  it('warmWithRetry re-queues a failed image after a backoff and reports each id once', async () => {
    const { warmWithRetry } = await import('./warm');
    const settled: [string, boolean, number][] = [];
    const waits: number[] = [];
    const r = warmWithRetry(['tile.atlas', 'fx.sheet'], { attempts: 3, baseMs: 100, wait: async (ms) => void waits.push(ms), onSettle: (id, ok, n) => settled.push([id, ok, n]) });
    // tile.atlas: fails twice, then loads. fx.sheet: fails every time.
    for (let round = 0; round < 3; round++) {
      await flush();
      const now = pending.splice(0);
      expect(now).toHaveLength(2);
      for (const p of now) {
        if (/double-six/.test(p.src) && round === 2) p.ok();
        else p.fail(new Error('net'));
      }
      await flush();
    }
    expect(await r).toBe(false);
    expect(settled.sort()).toEqual([
      ['fx.sheet', false, 3],
      ['tile.atlas', true, 3],
    ]);
    expect(waits.sort((x, y) => x - y)).toEqual([100, 100, 200, 200]);
    expect(warmState('tile.atlas')).toBe('ready');
  });

  it('repeated requests share one download', async () => {
    const a = warm(['tile.atlas']);
    const b = warm(['tile.atlas'], { front: true });
    expect(pending).toHaveLength(1);
    pending.shift()!.ok();
    expect(await a).toEqual([true]);
    expect(await b).toEqual([true]);
  });
});

describe('deferred set', () => {
  it('skips art the device will not show', async () => {
    const { deferredAssets } = await import('./warm');
    expect(deferredAssets({ reduceMotion: false, wide: true, hostAnimation: true })).toEqual(['tile.atlas', 'table.weathered', 'fx.sheet', 'cousin.anim.slam']);
    expect(deferredAssets({ reduceMotion: false, wide: false, hostAnimation: true })).toEqual(['tile.atlas', 'table.weathered', 'fx.sheet']);
    expect(deferredAssets({ reduceMotion: true, wide: true, hostAnimation: true })).toEqual(['tile.atlas', 'table.weathered']);
    expect(deferredAssets({ reduceMotion: false, wide: true, hostAnimation: false })).toEqual(['tile.atlas', 'table.weathered', 'fx.sheet']);
  });

  describe('deadlines and once-only completion', () => {
    it('a stalled image releases its slot at the deadline; the queue keeps moving', async () => {
      _setWarmDeadline(30);
      const stalled = warm(['tile.atlas']);
      const other = warm(['table.weathered']);
      const third = warm(['fx.sheet']); // waits for a slot
      expect(pending).toHaveLength(2);
      pending[1]!.ok(); // table.weathered loads
      await flush();
      expect(pending).toHaveLength(3); // fx.sheet got the freed slot
      pending[2]!.ok();
      await new Promise((r) => setTimeout(r, 50)); // tile.atlas never answers
      expect(await stalled).toEqual([false]);
      expect(await other).toEqual([true]);
      expect(await third).toEqual([true]);
      expect(warmState('tile.atlas')).toBe('failed');
      expect(warmStats.timeouts).toBe(1);
      // The abandoned decode finally resolves: once only, ignored.
      pending[0]!.ok();
      await flush();
      expect(warmState('tile.atlas')).toBe('failed');
      expect(warmStats.lateIgnored).toBe(1);
    });

    it("an explicit retry fetches again, and the old attempt's late answer can't settle the new one", async () => {
      _setWarmDeadline(10_000);
      const first = warm(['tile.atlas']);
      pending.shift()!.fail(new Error('offline'));
      expect(await first).toEqual([false]);
      expect(warmState('tile.atlas')).toBe('failed');
      expect(await warm(['tile.atlas'])).toEqual([false]); // a plain warm() does not refetch a failure
      const retry = retryWarm(['tile.atlas']);
      expect(pending).toHaveLength(1);
      expect(warmState('tile.atlas')).toBe('loading');
      pending.shift()!.ok();
      expect(await retry).toEqual([true]);
      expect(warmState('tile.atlas')).toBe('ready');
    });

    it('a retry while the old attempt is still stuck: the old completion is dropped, the new one decides', async () => {
      _setWarmDeadline(20);
      void warm(['cousin.anim.slam']);
      await new Promise((r) => setTimeout(r, 30)); // deadline: failed
      const old = pending.shift()!;
      const retry = retryWarm(['cousin.anim.slam']);
      old.fail(new Error('late failure')); // the stuck first attempt fails now
      await flush();
      expect(warmState('cousin.anim.slam')).toBe('loading'); // unaffected
      pending.shift()!.ok();
      expect(await retry).toEqual([true]);
      expect(warmState('cousin.anim.slam')).toBe('ready');
    });
  });
});
