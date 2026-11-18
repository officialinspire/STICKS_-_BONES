import { describe, expect, it } from 'vitest';
import { retryable } from './lazy';

describe('retryable lazy loads', () => {
  it('shares one load while in flight and caches a success', async () => {
    let calls = 0;
    const r = retryable(async () => ++calls);
    const [a, b] = await Promise.all([r.get(), r.get()]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    expect(await r.get()).toBe(1);
    expect(calls).toBe(1);
  });

  it('forgets a rejected load, so Retry really loads again', async () => {
    let calls = 0;
    const r = retryable(async () => {
      calls++;
      if (calls === 1) throw new Error('chunk failed');
      return 'loaded';
    });
    await expect(r.get()).rejects.toThrow('chunk failed');
    await expect(r.get()).resolves.toBe('loaded');
    expect(calls).toBe(2);
  });

  it('a slow failure does not clear a newer successful load', async () => {
    let fail: (e: Error) => void = () => {};
    let n = 0;
    const r = retryable(() => (++n === 1 ? new Promise<string>((_, rj) => (fail = rj)) : Promise.resolve('fresh')));
    const first = r.get();
    r.reset(); // e.g. an explicit retry while the first is still hanging
    await expect(r.get()).resolves.toBe('fresh');
    fail(new Error('late'));
    await expect(first).rejects.toThrow('late');
    await expect(r.get()).resolves.toBe('fresh'); // still cached
    expect(n).toBe(2);
  });
});
