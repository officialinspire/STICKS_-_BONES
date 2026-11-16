import { describe, expect, it } from 'vitest';
import { IntroController, type IntroEnd, type VideoPort } from './intro';
import type { Scheduler } from './session';

function sched() {
  const q: { fn: () => void; id: number; ms: number }[] = [];
  let id = 0;
  const s: Scheduler = {
    set: (fn, ms) => {
      q.push({ fn, id: ++id, ms });
      return id;
    },
    clear: (h) => {
      const i = q.findIndex((x) => x.id === h);
      if (i >= 0) q.splice(i, 1);
    },
  };
  return { s, fire: (pred: (ms: number) => boolean = () => true) => q.filter((x) => pred(x.ms)).forEach((x) => (q.includes(x) ? (q.splice(q.indexOf(x), 1), x.fn()) : 0)), size: () => q.length };
}

function video(opts: { reject?: boolean } = {}) {
  const handlers: Record<string, (() => void)[]> = {};
  let released = 0;
  let resolvePlay: () => void = () => {};
  let rejectPlay: () => void = () => {};
  const port: VideoPort = {
    play: () =>
      new Promise<void>((res, rej) => {
        resolvePlay = res;
        rejectPlay = rej;
        if (opts.reject) rej(new Error('NotAllowedError'));
      }),
    release: () => void released++,
    on: (e, cb) => {
      (handlers[e] ??= []).push(cb);
      return () => (handlers[e] = (handlers[e] ?? []).filter((x) => x !== cb));
    },
    durationSec: () => 8,
  };
  return { port, emit: (e: string) => (handlers[e] ?? []).slice().forEach((h) => h()), released: () => released, resolvePlay: () => resolvePlay(), rejectPlay: () => rejectPlay(), listeners: () => Object.values(handlers).flat().length };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(v: ReturnType<typeof video> | null) {
  const sc = sched();
  const finished: IntroEnd[] = [];
  const c = new IntroController({ video: v?.port ?? null, scheduler: sc.s, onFinish: (r) => finished.push(r) });
  return { c, sc, finished };
}

describe('intro: one guarded transition', () => {
  it('Skip wins; a late ended/error/timeout is ignored and the video is released once', async () => {
    const v = video();
    const { c, sc, finished } = setup(v);
    c.start();
    v.emit('playing');
    c.skip();
    v.emit('ended');
    v.emit('error');
    sc.fire();
    c.skip();
    await tick();
    expect(finished).toEqual(['skip']);
    expect(v.released()).toBe(1);
    expect(v.listeners()).toBe(0); // no stale callbacks left attached
    expect(sc.size()).toBe(0);
  });

  it('natural end finishes once', () => {
    const v = video();
    const { c, finished } = setup(v);
    c.start();
    v.emit('playing');
    v.emit('ended');
    c.skip();
    expect(finished).toEqual(['ended']);
  });

  it('missing video goes straight to the menu, asynchronously, exactly once', () => {
    const { c, sc, finished } = setup(null);
    c.start();
    c.start();
    expect(finished).toEqual([]);
    sc.fire();
    expect(finished).toEqual(['missing']);
  });

  it('play() rejection (autoplay policy) enters the menu once', async () => {
    const v = video({ reject: true });
    const { c, finished } = setup(v);
    c.start();
    await tick();
    c.skip();
    expect(finished).toEqual(['rejected']);
  });

  it('a media error finishes; Skip afterwards does nothing', () => {
    const v = video();
    const { c, finished } = setup(v);
    c.start();
    v.emit('error');
    c.skip();
    expect(finished).toEqual(['error']);
  });

  it('never starting playing → start timeout; stalling mid-play → stall timeout', () => {
    const a = video();
    const A = setup(a);
    A.c.start();
    A.sc.fire((ms) => ms === 6000);
    expect(A.finished).toEqual(['timeout']);
    const b = video();
    const B = setup(b);
    B.c.start();
    b.emit('playing');
    b.emit('waiting');
    B.sc.fire((ms) => ms === 5000);
    expect(B.finished).toEqual(['timeout']);
  });

  it('recovering from a stall cancels the stall timer', () => {
    const v = video();
    const { c, sc, finished } = setup(v);
    c.start();
    v.emit('playing');
    v.emit('waiting');
    v.emit('playing');
    sc.fire((ms) => ms === 5000 || ms === 6000);
    expect(finished).toEqual([]);
    c.skip();
    expect(finished).toEqual(['skip']);
  });

  it('a race of everything at once still yields one transition', async () => {
    const v = video();
    const { c, sc, finished } = setup(v);
    c.start();
    v.emit('ended');
    v.emit('error');
    c.skip();
    v.rejectPlay();
    sc.fire();
    await tick();
    expect(finished).toHaveLength(1);
    expect(v.released()).toBe(1);
  });
});
