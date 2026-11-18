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
  let paused = 0;
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
    pause: () => void paused++,
    on: (e, cb) => {
      (handlers[e] ??= []).push(cb);
      return () => (handlers[e] = (handlers[e] ?? []).filter((x) => x !== cb));
    },
    durationSec: () => 8,
  };
  return { port, emit: (e: string) => (handlers[e] ?? []).slice().forEach((h) => h()), released: () => released, paused: () => paused, resolvePlay: () => resolvePlay(), rejectPlay: () => rejectPlay(), listeners: () => Object.values(handlers).flat().length };
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

describe('intro: backgrounding', () => {
  it('suspend pauses the video and stops every timer; resume plays on with fresh timers', async () => {
    const v = video();
    const { c, sc, finished } = setup(v);
    c.start();
    v.emit('playing');
    v.emit('waiting');
    c.suspend();
    expect(v.paused()).toBe(1);
    expect(sc.size()).toBe(0); // no start/stall/max timer can fire while hidden
    v.emit('stalled'); // a background stall arms nothing
    expect(sc.size()).toBe(0);
    c.resume();
    expect(sc.size()).toBe(2); // start + overall
    v.resolvePlay();
    v.emit('playing');
    await tick();
    expect(finished).toEqual([]);
    v.emit('ended');
    expect(finished).toEqual(['ended']);
  });

  it('a refused play() after returning ends the credit once; suspend/resume after the end do nothing', async () => {
    const v = video();
    const { c, finished } = setup(v);
    c.start();
    c.suspend();
    c.resume();
    v.rejectPlay();
    await tick();
    expect(finished).toEqual(['rejected']);
    c.suspend();
    c.resume();
    expect(v.paused()).toBe(1);
    expect(finished).toEqual(['rejected']);
  });
});

/** A port with mute + fade: play() refuses with sound (per test) and the fade resolves when the test says. */
function richVideo(o: { refuseSound?: boolean; refuseMuted?: boolean } = {}) {
  const log: string[] = [];
  let muted = false;
  let endFade: () => void = () => {};
  const handlers: Record<string, (() => void)[]> = {};
  const port: VideoPort = {
    play: () => {
      log.push(muted ? 'play:muted' : 'play');
      return (muted ? o.refuseMuted : o.refuseSound) ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve();
    },
    pause: () => void log.push('pause'),
    release: () => void log.push('release'),
    on: (e, cb) => {
      (handlers[e] ??= []).push(cb);
      return () => (handlers[e] = (handlers[e] ?? []).filter((x) => x !== cb));
    },
    durationSec: () => 5.8,
    mute: () => {
      muted = true;
      log.push('mute');
    },
    fadeOut: (ms) => {
      log.push(`fade:${ms}`);
      return new Promise<void>((r) => (endFade = () => (log.push('faded'), r())));
    },
  };
  return { port, log, endFade: () => endFade(), emit: (e: string) => (handlers[e] ?? []).slice().forEach((h) => h()) };
}

describe('intro: refused sound, soundtrack fade and release before the menu', () => {
  function rich(v: ReturnType<typeof richVideo>, fadeOutMs = 380) {
    const sc = sched();
    const finished: { r: IntroEnd; released: Promise<void> }[] = [];
    let mutedFallback = 0;
    const c = new IntroController({ video: v.port, scheduler: sc.s, fadeOutMs, onFinish: (r, released) => finished.push({ r, released }), onMutedFallback: () => mutedFallback++ });
    return { c, sc, finished, mutedFallback: () => mutedFallback };
  }

  it('a refused play() with sound is retried once muted, and the credit plays on', async () => {
    const v = richVideo({ refuseSound: true });
    const { c, finished, mutedFallback } = rich(v);
    c.start();
    await tick();
    await tick();
    expect(v.log).toEqual(['play', 'mute', 'play:muted']);
    expect(mutedFallback()).toBe(1);
    expect(finished).toEqual([]);
    v.emit('ended');
    expect(finished.map((f) => f.r)).toEqual(['ended']);
  });

  it('refused even muted → the menu, once (no third attempt)', async () => {
    const v = richVideo({ refuseSound: true, refuseMuted: true });
    const { c, finished } = rich(v);
    c.start();
    await tick();
    await tick();
    expect(finished.map((f) => f.r)).toEqual(['rejected']);
    expect(v.log.filter((l) => l.startsWith('play'))).toHaveLength(2);
    expect(v.log.at(-1)).toBe('release'); // nothing to fade: released at once
  });

  it('Skip fades the soundtrack, THEN releases; the menu waits for the release', async () => {
    const v = richVideo();
    const { c, finished } = rich(v);
    c.start();
    await tick();
    c.skip();
    expect(finished.map((f) => f.r)).toEqual(['skip']);
    let released = false;
    void finished[0]!.released.then(() => (released = true));
    await tick();
    expect(v.log.at(-1)).toBe('fade:380');
    expect(released).toBe(false); // still fading: no menu (and no menu music) yet
    v.endFade();
    await tick();
    expect(v.log.slice(-2)).toEqual(['faded', 'release']);
    expect(released).toBe(true);
    c.skip(); // late input after the end: nothing
    expect(finished).toHaveLength(1);
    expect(v.log.filter((l) => l === 'release')).toHaveLength(1);
  });

  it('a fade that never finishes is cut off by its timer: released once, the menu is never held hostage', async () => {
    const v = richVideo();
    const { c, sc, finished } = rich(v);
    c.start();
    await tick();
    c.skip();
    sc.fire((ms) => ms === 380 + 150);
    await tick();
    expect(v.log.at(-1)).toBe('release');
    v.endFade(); // the stuck fade resolves late: no second release
    await tick();
    expect(v.log.filter((l) => l === 'release')).toHaveLength(1);
    let released = false;
    await finished[0]!.released.then(() => (released = true));
    expect(released).toBe(true);
  });

  it('a natural end, a media error or a cancel release at once (no fade over silence or a broken file)', async () => {
    for (const end of ['ended', 'error', 'cancelled'] as const) {
      const v = richVideo();
      const { c } = rich(v);
      c.start();
      await tick();
      if (end === 'cancelled') c.finish('cancelled');
      else v.emit(end);
      expect(v.log.at(-1), end).toBe('release');
      expect(v.log.some((l) => l.startsWith('fade')), end).toBe(false);
    }
  });

  it('backgrounding during a pending play() (AbortError) does not end the credit', async () => {
    let rejectFirst: (e: Error) => void = () => {};
    const v = richVideo();
    const port: VideoPort = { ...v.port, play: () => (v.log.push('play'), v.log.length === 1 ? new Promise<void>((_, rj) => (rejectFirst = rj)) : Promise.resolve()) };
    const sc = sched();
    const finished: IntroEnd[] = [];
    const c = new IntroController({ video: port, scheduler: sc.s, onFinish: (r) => finished.push(r) });
    c.start();
    c.suspend(); // pause() makes the pending play() reject
    rejectFirst(new Error('AbortError'));
    await tick();
    expect(finished).toEqual([]);
    c.resume();
    await tick();
    expect(finished).toEqual([]);
    v.emit('ended');
    expect(finished).toEqual(['ended']);
  });
});
