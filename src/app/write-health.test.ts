import { describe, expect, it } from 'vitest';
import { WriteHealth, type RecordName } from './write-health';

const rig = () => {
  const seen: (readonly RecordName[])[] = [];
  const h = new WriteHealth((f) => seen.push(f));
  return { h, seen, last: () => seen.at(-1) ?? [] };
};

describe('per-record write health', () => {
  it("one record's success never hides another's failure", () => {
    const { h, last } = rig();
    h.report('story', false, () => false);
    expect(last()).toEqual(['story']);
    h.report('save', true, () => true); // Quick Play saved fine…
    expect(last()).toEqual(['story']); // …the Story is still unsaved
    expect(h.has('story')).toBe(true);
  });

  it('clears a record only when that record is written, and the warning only when all are', () => {
    const { h, last } = rig();
    h.report('settings', false, () => false);
    h.report('stats', false, () => false);
    expect(last()).toEqual(['settings', 'stats']);
    h.report('settings', true, () => true);
    expect(last()).toEqual(['stats']);
    h.report('stats', true, () => true);
    expect(last()).toEqual([]);
  });

  it('retries write the latest value; a later failure replaces the retry', () => {
    const { h } = rig();
    const writes: string[] = [];
    let storageOk = false;
    h.report('story', false, () => (writes.push('v1'), storageOk));
    h.report('story', false, () => (writes.push('v2'), storageOk));
    expect(h.retryAll()).toBe(false);
    expect(writes).toEqual(['v2']); // never the older v1
    storageOk = true;
    expect(h.retryAll()).toBe(true);
    expect(h.failing).toEqual([]);
  });

  it('a successful write elsewhere retries what failed earlier (once, no recursion)', () => {
    const { h, last } = rig();
    let calls = 0;
    h.report('achievements', false, () => (++calls, true));
    h.report('settings', true, () => true);
    expect(calls).toBe(1);
    expect(last()).toEqual([]);
  });

  it('a record removed on purpose drops its pending retry (no resurrected save)', () => {
    const { h } = rig();
    let wrote = false;
    h.report('save', false, () => (wrote = true));
    h.resolve('save');
    expect(h.retryAll()).toBe(true);
    expect(wrote).toBe(false);
  });

  it('a throwing retry counts as a failure, not a crash', () => {
    const { h } = rig();
    h.report('stats', false, () => {
      throw new Error('QuotaExceeded');
    });
    expect(h.retryAll()).toBe(false);
    expect(h.failing).toEqual(['stats']);
  });
});
