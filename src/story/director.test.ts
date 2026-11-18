import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../app/session';
import { DEFAULT_TIMINGS, REDUCED_TIMINGS, SceneDirector, type DirectorState, type StageView } from './director';

function harness(opts: { prepare?: () => Promise<boolean>; reduced?: boolean } = {}) {
  let now = 0;
  const q: { fn: () => void; at: number; id: number }[] = [];
  let id = 0;
  const sched: Scheduler = {
    set: (fn, ms) => (q.push({ fn, at: now + ms, id: ++id }), id),
    clear: (h) => {
      const i = q.findIndex((x) => x.id === h);
      if (i >= 0) q.splice(i, 1);
    },
  };
  /** Advance the fake clock, running due timers in order. */
  const tick = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      q.sort((a, b) => a.at - b.at);
      const next = q[0];
      if (!next || next.at > end) break;
      q.shift();
      now = next.at;
      next.fn();
      await Promise.resolve();
    }
    now = end;
    await Promise.resolve();
  };
  const log: string[] = [];
  const states: DirectorState[] = [];
  const view: StageView<string> = {
    prepare: opts.prepare ?? (async () => true),
    curtain: (to, ms) => log.push(`curtain:${to}:${ms}`),
    establishing: () => log.push('establish'),
    showBeat: (b, i, ms) => log.push(`beat:${i}:${b}:${ms}`),
    finishReveal: () => log.push('finish'),
    setState: (s) => states.push(s),
  };
  const events: string[] = [];
  const d = new SceneDirector<string>(
    view,
    { textOf: (b) => b, onEnd: () => events.push('end'), onHandStart: () => events.push('hand'), onExit: () => events.push('exit'), now: () => now },
    sched,
    opts.reduced ? REDUCED_TIMINGS : DEFAULT_TIMINGS,
  );
  return { d, log, events, states, tick, pending: () => q.length };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const beats = ['First line of the scene.', 'Second.', 'Third and last.'];

describe('SceneDirector', () => {
  it('walks preparing → entering → presenting, then reveal-first input semantics', async () => {
    const h = harness();
    void h.d.load(beats);
    expect(h.d.state).toBe('preparing');
    await flush();
    expect(h.d.state).toBe('entering');
    h.d.advance(); // ignored during the entrance (not queued)
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    expect(h.d.state).toBe('presenting');
    expect(h.d.revealing).toBe(true);
    h.d.advance(); // first input finishes the reveal
    expect(h.log.at(-1)).toBe('finish');
    expect(h.d.index).toBe(0);
    await h.tick(DEFAULT_TIMINGS.minBeatMs);
    h.d.advance(); // next input advances exactly one beat
    expect(h.d.index).toBe(1);
  });

  it('rapid tapping never skips more than one beat per settled tap', async () => {
    const h = harness();
    void h.d.load(beats);
    await flush();
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    for (let i = 0; i < 20; i++) h.d.advance(); // a burst within the same instant
    expect(h.d.index).toBeLessThanOrEqual(1);
    expect(h.events).not.toContain('end');
  });

  it('enterHand happens once; a second start (double tap) is refused; leaveHand returns to presenting', async () => {
    const h = harness();
    void h.d.load(beats, 2);
    await flush();
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    expect(h.d.enterHand()).toBe(true);
    expect(h.d.enterHand()).toBe(false);
    h.d.advance();
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    expect(h.d.state).toBe('in-hand');
    expect(h.events.filter((e) => e === 'hand')).toHaveLength(1);
    h.d.leaveHand(['Insert line.']);
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    expect(h.d.state).toBe('presenting');
    expect(h.log.at(-1)).toMatch(/^beat:0:Insert line\./);
  });

  it('cancel (reset/navigation/new scene) invalidates every pending callback', async () => {
    const h = harness();
    void h.d.load(beats);
    await flush();
    h.d.cancel();
    await h.tick(5000);
    expect(h.d.state).toBe('idle');
    expect(h.log.some((l) => l.startsWith('beat:'))).toBe(false);
    expect(h.d.stats.staleDropped).toBeGreaterThanOrEqual(0);
    // A new scene during the old one's preload: the old preload result is ignored.
    let resolveOld!: (v: boolean) => void;
    const h2 = harness({ prepare: () => new Promise<boolean>((r) => (resolveOld = r)) });
    void h2.d.load(['old']);
    const second = h2.d.load(['new scene']);
    resolveOld(true);
    await second;
    await flush();
    await h2.tick(DEFAULT_TIMINGS.sceneFadeMs * 2);
    expect(h2.log.filter((l) => l.startsWith('beat:'))).toEqual([`beat:0:new scene:${Math.round((9 / 70) * 1000)}`]);
  });

  it('missing images never block: preparing times out to the fallback and continues', async () => {
    const h = harness({ prepare: () => new Promise<boolean>(() => undefined) });
    void h.d.load(beats);
    await flush();
    await h.tick(DEFAULT_TIMINGS.prepareTimeoutMs);
    await flush();
    expect(h.d.state).toBe('entering');
    expect(h.d.stats.prepareTimeouts).toBe(1);
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    expect(h.d.state).toBe('presenting');
  });

  it('settle() (backgrounding / skip during a transition) completes it at once — no permanent blocker', async () => {
    for (const phase of ['entering', 'entering-hand', 'leaving-hand', 'exiting'] as const) {
      const h = harness();
      void h.d.load(beats);
      await flush();
      if (phase !== 'entering') {
        await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
        h.d.enterHand();
        if (phase !== 'entering-hand') {
          await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
          if (phase === 'leaving-hand') h.d.leaveHand(['x']);
          else h.d.exit();
        }
      }
      expect(h.d.state, phase).toBe(phase);
      h.d.settle();
      const settled = h.d.state;
      expect(['presenting', 'in-hand', 'idle'], phase).toContain(settled);
      const before = [...h.events];
      await h.tick(5000); // the cancelled transition timer must not fire a second completion
      expect(h.d.state, `${phase}: state stable after settle`).toBe(settled);
      expect(h.events, `${phase}: no duplicate hand start / exit`).toEqual(before);
    }
  });

  it('skip during the entrance lands at the end without double-firing', async () => {
    const h = harness();
    void h.d.load(beats);
    await flush();
    h.d.skipToEnd();
    expect(h.d.state).toBe('presenting');
    expect(h.events).toEqual(['end']);
    await h.tick(5000);
    expect(h.events).toEqual(['end']);
  });

  it('reduced motion: simple short fades, no reveal, no establishing move', async () => {
    const h = harness({ reduced: true });
    void h.d.load(beats);
    await flush();
    await h.tick(REDUCED_TIMINGS.sceneFadeMs);
    expect(h.log).toContain(`curtain:open:${REDUCED_TIMINGS.sceneFadeMs}`);
    expect(h.log).not.toContain('establish');
    expect(h.d.revealing).toBe(false);
    expect(h.log.at(-1)).toBe('beat:0:First line of the scene.:0');
  });

  it('back() steps one beat without transitions; exit fades then leaves once', async () => {
    const h = harness();
    void h.d.load(beats, 2);
    await flush();
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    h.d.back();
    expect(h.d.index).toBe(1);
    h.d.exit();
    h.d.exit();
    await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
    expect(h.events.filter((e) => e === 'exit')).toHaveLength(1);
    expect(h.d.state).toBe('idle');
  });

  describe('reveal timers belong to their own beat', () => {
    // Long enough that each line reveals for the full revealMaxMs (900 ms at 70 cps).
    const long = ['A'.repeat(200), 'B'.repeat(200), 'C'.repeat(200), 'D'.repeat(200)];
    const enter = async () => {
      const h = harness();
      void h.d.load(long);
      await flush();
      await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
      expect(h.d.state).toBe('presenting');
      expect(h.d.revealing).toBe(true);
      return h;
    };

    it("an early-finished line's old timer never ends the NEXT line's reveal", async () => {
      const h = await enter();
      await h.tick(100);
      h.d.advance(); // finish line A's reveal early
      expect(h.d.revealing).toBe(false);
      await h.tick(DEFAULT_TIMINGS.minBeatMs);
      h.d.advance(); // advance to line B: it starts revealing (900 ms)
      expect(h.d.index).toBe(1);
      expect(h.d.revealing).toBe(true);
      // Line A's original 900 ms would have fired here (it started 280 ms earlier).
      await h.tick(DEFAULT_TIMINGS.revealMaxMs - 280 + 10);
      expect(h.d.revealing).toBe(true); // still B's reveal
      h.d.advance(); // so the next tap finishes B, it does not skip to C
      expect(h.d.index).toBe(1);
      expect(h.log.at(-1)).toBe('finish');
      await h.tick(DEFAULT_TIMINGS.revealMaxMs);
      expect(h.d.stats.staleReveals).toBe(0); // A's timer was cleared, not merely ignored
    });

    it('Back, Skip and settle retire the reveal in flight', async () => {
      const h = await enter();
      await h.tick(100);
      h.d.advance();
      await h.tick(DEFAULT_TIMINGS.minBeatMs);
      h.d.advance(); // B revealing
      await h.tick(50);
      h.d.back(); // back to A: shown complete (settled)
      expect(h.d.index).toBe(0);
      expect(h.d.revealing).toBe(false);
      await h.tick(DEFAULT_TIMINGS.revealMaxMs * 2);
      expect(h.d.revealing).toBe(false);
      await h.tick(DEFAULT_TIMINGS.minBeatMs);
      h.d.advance(); // B again: a fresh reveal that no earlier timer can end
      expect(h.d.index).toBe(1);
      expect(h.d.revealing).toBe(true);
      h.d.settle();
      expect(h.d.revealing).toBe(false);
      await h.tick(DEFAULT_TIMINGS.minBeatMs);
      h.d.advance(); // C revealing
      expect(h.d.revealing).toBe(true);
      await h.tick(DEFAULT_TIMINGS.revealMaxMs - 10);
      expect(h.d.revealing).toBe(true); // nothing from A or B ended C early
      h.d.skipToEnd();
      expect(h.d.revealing).toBe(false);
      expect(h.events).toContain('end');
      expect(h.pending()).toBe(0); // no reveal timer left behind
    });

    it('cancel and exit leave no reveal timer that could fire into the next scene', async () => {
      const h = await enter();
      h.d.cancel();
      expect(h.d.revealing).toBe(false);
      void h.d.load(long);
      await flush();
      await h.tick(DEFAULT_TIMINGS.sceneFadeMs);
      expect(h.d.revealing).toBe(true);
      await h.tick(DEFAULT_TIMINGS.revealMaxMs - 10);
      expect(h.d.revealing).toBe(true);
      h.d.exit();
      expect(h.d.revealing).toBe(false);
      await h.tick(DEFAULT_TIMINGS.sceneFadeMs + DEFAULT_TIMINGS.revealMaxMs);
      expect(h.events).toContain('exit');
      expect(h.pending()).toBe(0);
    });
  });
});
