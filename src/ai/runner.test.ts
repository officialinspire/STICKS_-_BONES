import { describe, expect, it } from 'vitest';
import { decide } from './policy';
import { createWorkerRunner, fallbackDecision, validDecision, type DecisionRequest, type WorkerLike } from './runner';
import { driveMatch, type DecisionPoint } from './testing';

/** Decision points with at least two legal moves (so a choice is really made). */
const points: DecisionPoint[] = [];
driveMatch({ mode: 'partnership4', dealSeed: 'runner-deal', aiSeed: 'runner-ai', sides: ['normal', 'normal'], maxHands: 2, onDecision: (p) => p.obs.legal.length > 1 && points.push(p) });
const req = (i = 0, difficulty: DecisionRequest['difficulty'] = 'hard'): DecisionRequest => ({ difficulty, obs: points[i]!.obs, rng: points[i]!.rng });

/** A controllable fake worker plus a manual clock. */
function rig(opts: { timeoutMs?: number; maxRestarts?: number; throwOnPost?: () => boolean } = {}) {
  const workers: (WorkerLike & { sent: { id: number; req: DecisionRequest }[]; terminated: boolean })[] = [];
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let now = 0;
  let tid = 0;
  const runner = createWorkerRunner({
    timeoutMs: opts.timeoutMs ?? 1000,
    maxRestarts: opts.maxRestarts ?? 1,
    createWorker: () => {
      const w = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        sent: [] as { id: number; req: DecisionRequest }[],
        terminated: false,
        postMessage(m: unknown) {
          if (opts.throwOnPost?.()) throw new DOMException('could not clone', 'DataCloneError');
          w.sent.push(m as { id: number; req: DecisionRequest });
        },
        terminate() {
          w.terminated = true;
        },
      } as WorkerLike & { sent: { id: number; req: DecisionRequest }[]; terminated: boolean };
      workers.push(w);
      return w;
    },
    setTimer: (fn, ms) => (timers.push({ fn, at: now + ms, id: ++tid }), tid),
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  })!;
  const tick = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
      await Promise.resolve();
    }
    now = end;
    await new Promise((r) => setTimeout(r, 0));
  };
  const reply = (w: WorkerLike, data: unknown) => w.onmessage?.({ data } as MessageEvent);
  return { runner, workers, tick, reply, timers };
}

describe('worker AI runner: every request settles once, safely', () => {
  it('uses a valid worker decision', async () => {
    const r = rig();
    const p = r.runner.decide(req());
    const w = r.workers[0]!;
    const d = decide('normal', points[0]!.obs, points[0]!.rng);
    r.reply(w, { id: w.sent[0]!.id, ok: true, decision: d });
    expect(await p).toEqual(d);
    expect(r.runner.stats!.workerDecisions).toBe(1);
  });

  it('rejects malformed and illegal answers in favour of the observation-only fallback', async () => {
    const r = rig();
    const w = () => r.workers[0]!;
    const p1 = r.runner.decide(req(0));
    r.reply(w(), { id: w().sent[0]!.id, ok: true, decision: { action: { type: 'play', tile: 'bogus', end: 'left' }, rng: points[0]!.rng, method: 'x' } });
    const p2 = r.runner.decide(req(1));
    r.reply(w(), { id: w().sent[1]!.id, ok: true, decision: { action: { type: 'pass' }, rng: { contract: 'nope', s: [1, 2, 3, 4] }, method: 'x' } });
    const p3 = r.runner.decide(req(2));
    r.reply(w(), { id: w().sent[2]!.id, ok: false, error: 'boom' });
    r.reply(w(), 'garbage'); // no id at all
    await r.tick(1);
    for (const [i, p] of [p1, p2, p3].entries()) {
      const d = await p;
      expect(d.method).toMatch(/\(fallback\)$/);
      expect(validDecision(d, points[i]!.obs)).toBe(true);
      expect(d).toEqual(fallbackDecision(req(i)));
    }
    expect(r.runner.stats!.malformed).toBe(4);
  });

  it('a silent worker times out: the fallback answers, the worker is replaced, a late answer is dropped', async () => {
    const r = rig({ timeoutMs: 500 });
    const p = r.runner.decide(req());
    const first = r.workers[0]!;
    await r.tick(499);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await r.tick(2);
    const d = await p;
    expect(d.method).toMatch(/fallback/);
    expect(r.runner.stats!.timeouts).toBe(1);
    expect(first.terminated).toBe(true);
    // The hung worker finally answers: ignored (it is retired, and its request is already settled).
    r.reply(first, { id: first.sent[0]!.id, ok: true, decision: decide('normal', points[0]!.obs, points[0]!.rng) });
    // The next request starts a fresh worker.
    const p2 = r.runner.decide(req(1));
    expect(r.workers).toHaveLength(2);
    const w2 = r.workers[1]!;
    const d2 = decide('normal', points[1]!.obs, points[1]!.rng);
    r.reply(w2, { id: w2.sent[0]!.id, ok: true, decision: d2 });
    r.reply(w2, { id: w2.sent[0]!.id, ok: true, decision: d2 }); // duplicate
    expect(await p2).toEqual(d2);
    expect(r.runner.stats!.lateIgnored).toBe(1);
    expect(r.runner.stats!.restarts).toBe(1);
  });

  it('error and messageerror fail every waiting request over to the fallback; restarts are bounded', async () => {
    const r = rig({ maxRestarts: 1 });
    const a = r.runner.decide(req(0));
    const b = r.runner.decide(req(1));
    r.workers[0]!.onerror?.(new Event('error'));
    await r.tick(1);
    expect((await a).method).toMatch(/fallback/);
    expect((await b).method).toMatch(/fallback/);
    const c = r.runner.decide(req(2)); // restart #1
    expect(r.workers).toHaveLength(2);
    r.workers[1]!.onmessageerror?.({ data: null } as MessageEvent);
    await r.tick(1);
    expect((await c).method).toMatch(/fallback/);
    // Out of restarts: the runner stays on the fallback, no new worker, no hang.
    const d = r.runner.decide(req(3));
    await r.tick(1);
    expect((await d).method).toMatch(/fallback/);
    expect(r.workers).toHaveLength(2);
    expect(r.runner.stats!.workerErrors).toBe(2);
  });

  it('a postMessage failure answers that request with the fallback and keeps the worker', async () => {
    let fail = true;
    const r = rig({ throwOnPost: () => fail });
    const p = r.runner.decide(req());
    await r.tick(1);
    expect((await p).method).toMatch(/fallback/);
    expect(r.runner.stats!.postFailures).toBe(1);
    fail = false;
    const q = r.runner.decide(req(1));
    const w = r.workers[0]!;
    expect(w.terminated).toBe(false);
    const d = decide('normal', points[1]!.obs, points[1]!.rng);
    r.reply(w, { id: w.sent[0]!.id, ok: true, decision: d });
    expect(await q).toEqual(d);
    expect(r.timers).toHaveLength(0); // its timeout was cleared
  });

  it('dispose rejects what is waiting, terminates the worker and refuses new work', async () => {
    const r = rig();
    const p = r.runner.decide(req());
    r.runner.dispose();
    await expect(p).rejects.toThrow(/disposed/);
    expect(r.workers[0]!.terminated).toBe(true);
    await expect(r.runner.decide(req())).rejects.toThrow(/disposed/);
    expect(r.timers).toHaveLength(0);
  });

  it('the fallback is cheap and fair: Hard degrades to the one-ply Normal heuristic on the same observation', () => {
    const d = fallbackDecision(req(0, 'hard'));
    const n = decide('normal', points[0]!.obs, points[0]!.rng);
    expect(d.action).toEqual(n.action);
    expect(d.stats).toBeUndefined(); // no world sampling
    expect(fallbackDecision(req(0, 'easy')).action).toEqual(decide('easy', points[0]!.obs, points[0]!.rng).action);
  });
});
