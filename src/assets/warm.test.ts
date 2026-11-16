import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetWarm, DEFERRED_ASSETS, ESSENTIAL_ASSETS, warm, warmState } from './warm';

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
    const all = warm([...ESSENTIAL_ASSETS, ...DEFERRED_ASSETS]);
    expect(pending).toHaveLength(2);
    while (pending.length) {
      pending.shift()!.ok();
      await flush();
    }
    expect(await all).toEqual([true, true, true, true, true, true]);
    expect(maxInFlight).toBe(2);
  });

  it('essentials start first; front-queued ids jump ahead of background work', async () => {
    void warm(ESSENTIAL_ASSETS);
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
});
