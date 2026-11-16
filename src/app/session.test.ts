import { describe, expect, it } from 'vitest';
import { buildObservation } from '../ai/observation';
import { decide } from '../ai/policy';
import { inlineRunner, type AiRunner, type DecisionRequest } from '../ai/runner';
import type { Decision, Difficulty } from '../ai/types';
import { checkInvariants } from '../engine/invariants';
import { seedRng } from '../engine/rng';
import { seatView } from '../engine/view';
import type { GameEvent } from '../engine/events';
import type { ModeId } from '../engine/types';
import { controlStates, sortHand, whyNotPlayable } from './helpers';
import { TableController } from './controller';
import { GameSession, type OpponentKind, type Scheduler } from './session';

/** Synchronous scheduler: timers run only when flushed. */
function manualScheduler() {
  const queue: { fn: () => void; id: number }[] = [];
  let id = 0;
  const sched: Scheduler = {
    set: (fn) => {
      queue.push({ fn, id: ++id });
      return id;
    },
    clear: (h) => {
      const i = queue.findIndex((q) => q.id === h);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  return { sched, flush: () => queue.shift()?.fn(), pending: () => queue.length };
}

/** A runner whose decisions are released by the test. */
function deferredRunner() {
  const requests: { req: DecisionRequest; resolve: (d: Decision) => void }[] = [];
  const runner: AiRunner = {
    kind: 'inline',
    decide: (req) => new Promise((resolve) => requests.push({ req, resolve })),
    dispose: () => {},
  };
  const answer = (i = requests.length - 1) => {
    const r = requests[i]!;
    r.resolve(decide(r.req.difficulty, r.req.obs, r.req.rng));
  };
  return { runner, requests, answer };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Drive a session to match end, acting for the human(s) with the Normal policy through the controller. */
async function playOut(s: GameSession, flush: () => void, pending: () => number, onStep?: () => void): Promise<number> {
  const c = new TableController(s);
  let humanRng = seedRng('human-stand-in');
  for (let i = 0; i < 40000; i++) {
    onStep?.();
    const st = s.debugState();
    if (st.phase === 'match-over') return i;
    if (c.state.kind === 'covered') {
      c.ready();
      continue;
    }
    if (c.state.kind === 'revealing') {
      c.reveal();
      continue;
    }
    if (st.phase === 'hand-resolved') {
      expect(c.nextHand()).toBe(true);
      continue;
    }
    if (c.canAct()) {
      const d = decide('normal', buildObservation(c.view(), s.rules), humanRng);
      humanRng = d.rng;
      const a = d.action;
      const ok = a.type === 'play' ? c.play(a.tile, a.end) : a.type === 'draw' ? c.draw() : c.pass();
      expect(ok).toBe(true);
      continue;
    }
    if (pending() === 0) await tick(); // let an async AI decision land
    else flush();
  }
  throw new Error('session did not finish');
}

describe('GameSession', () => {
  const cases: [ModeId, OpponentKind, Difficulty][] = [
    ['draw2', 'ai', 'easy'],
    ['block2', 'ai', 'normal'],
    ['partnership4', 'ai', 'hard'],
    ['partnership4', 'ai', 'easy'],
    ['draw2', 'local', 'normal'],
    ['block2', 'dev-both', 'normal'],
  ];
  for (const [mode, opponent, difficulty] of cases) {
    it(`${mode} vs ${opponent} (${difficulty}): a full match through intents only, legal throughout`, async () => {
      const { sched, flush, pending } = manualScheduler();
      const s = new GameSession({ mode, opponent, difficulty, seed: `session-${mode}-${opponent}`, aiSeed: 'ai-1' }, { scheduler: sched, runner: inlineRunner() });
      const events: GameEvent[] = [];
      s.subscribe((e) => events.push(...e));
      await playOut(s, flush, pending, () => expect(checkInvariants(s.debugState())).toEqual([]));
      expect(s.debugState().phase).toBe('match-over');
      expect(events.some((e) => e.type === 'match-won')).toBe(true);
      if (opponent === 'ai') expect(s.stats.aiDecisions).toBeGreaterThan(10);
      expect(s.stats.staleDiscarded).toBe(0);
    }, 30000);
  }

  it('partnership solo: three AI seats, human is seat 0, partner opposite', () => {
    const s = new GameSession({ mode: 'partnership4', opponent: 'ai', seed: 'p4', aiSeed: 'x' }, { scheduler: manualScheduler().sched });
    expect([0, 1, 2, 3].map((x) => s.isHuman(x as 0))).toEqual([true, false, false, false]);
    expect(s.teamName(0)).toBe('You & Luz');
    expect(s.teamName(1)).toBe('Cousin & Tío Rafa');
  });

  it('rejects out-of-turn intents and reports engine errors without changing state', () => {
    const s = new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'errors', aiSeed: 0 }, { scheduler: manualScheduler().sched });
    const before = s.debugState();
    const turn = s.turn;
    const v = s.viewFor(turn);
    const illegal = v.myHand.find((t) => !v.legalMoves.some((m) => m.tile === t));
    if (illegal) {
      expect(s.play(turn, illegal, 'head')).toBe(false);
      expect(s.lastError?.code).toBe('must-lead-required-tile');
    }
    expect(s.pass(turn)).toBe(false);
    expect(s.lastError?.code).toBe('has-legal-move');
    const other = ((turn + 1) % 2) as 0 | 1;
    expect(s.pass(other)).toBe(false); // not their turn: refused before reaching the engine
    expect(s.debugState()).toBe(before);
  });
});

describe('AI turn safety (stale decisions, reset, pause, load)', () => {
  /** A Partnership match with seed chosen so an AI seat leads hand 1 — the AI must act first. */
  function aiFirst(deps: { sched: Scheduler; runner: AiRunner }) {
    for (let i = 0; i < 50; i++) {
      const s = new GameSession({ mode: 'partnership4', opponent: 'ai', difficulty: 'hard', seed: `ai-first-${i}`, aiSeed: 'a' }, { scheduler: deps.sched, runner: deps.runner });
      if (!s.isHuman(s.debugState().hand.turn)) return s;
      s.dispose();
    }
    throw new Error('no seed found');
  }

  it('reset during an AI turn cannot place a ghost tile', async () => {
    const { sched, flush } = manualScheduler();
    const d = deferredRunner();
    const old = aiFirst({ sched, runner: d.runner });
    expect(old.aiThinking).toBe(true);
    const oldState = old.debugState();
    old.dispose(); // what Restart / Menu do
    const fresh = new GameSession({ mode: 'partnership4', opponent: 'ai', seed: 'fresh', aiSeed: 'b' }, { scheduler: sched, runner: d.runner });
    const freshSeq = fresh.debugState().seq;
    d.answer(0); // the old request finally resolves…
    await tick();
    flush(); // …and its thinking delay fires
    expect(old.debugState()).toBe(oldState);
    expect(old.debugState().hand.line.tiles).toHaveLength(0);
    expect(old.stats.staleDiscarded).toBe(1);
    expect(fresh.debugState().seq).toBe(freshSeq);
  });

  it('pause cancels thinking; resume re-asks and moves exactly once', async () => {
    const { sched, flush, pending } = manualScheduler();
    const d = deferredRunner();
    const s = aiFirst({ sched, runner: d.runner });
    const seq = s.debugState().seq;
    s.pause();
    expect(pending()).toBe(0);
    d.answer(d.requests.length - 1);
    await tick();
    expect(s.debugState().seq).toBe(seq);
    expect(s.stats.staleDiscarded).toBe(1);
    s.resume();
    expect(d.requests).toHaveLength(2);
    d.answer(1);
    await tick();
    expect(s.debugState().seq).toBe(seq); // still waiting for the presentation delay
    flush();
    expect(s.debugState().seq).toBe(seq + 1);
    expect(s.debugState().hand.line.tiles).toHaveLength(1);
    // Replaying the delay or the decision cannot move again.
    flush();
    d.requests[1]!.resolve(decide('hard', d.requests[1]!.req.obs, d.requests[1]!.req.rng));
    await tick();
    expect(s.debugState().hand.line.tiles).toHaveLength(1);
    expect(s.stats.aiDecisions).toBe(1);
  });

  it('loading a state during an AI turn discards the outstanding decision', async () => {
    const { sched, flush } = manualScheduler();
    const d = deferredRunner();
    const s = aiFirst({ sched, runner: d.runner });
    const snapshot = s.debugState();
    expect(s.load(snapshot)).toBe(true); // reload the same position
    d.answer(0);
    await tick();
    flush();
    expect(s.stats.staleDiscarded).toBe(1);
    expect(s.debugState().hand.line.tiles).toHaveLength(0);
    // The re-issued request (made by load) is the only one that can act.
    expect(d.requests).toHaveLength(2);
    d.answer(1);
    await tick();
    flush();
    expect(s.debugState().hand.line.tiles).toHaveLength(1);
  });

  it('decisions are computed from the sanitized observation, and the AI RNG is separate from the shuffle', async () => {
    const { sched } = manualScheduler();
    const d = deferredRunner();
    const s = aiFirst({ sched, runner: d.runner });
    const req = d.requests[0]!.req;
    const state = s.debugState();
    const hidden = state.hand.hands.flatMap((h, seat) => (seat === req.obs.seat ? [] : h));
    const json = JSON.stringify(req);
    for (const t of hidden) expect(json).not.toContain(`"${t}"`);
    expect(json).not.toContain(JSON.stringify(state.rng.s));
    expect(req.rng).toEqual(seedRng(`ai:a:${req.obs.seat}`));
  });
});

describe('presentation helpers', () => {
  it('sorts by value, doubles first, or as dealt', () => {
    const hand = ['t21', 't66', 't50', 't33', 't64'] as const;
    expect(sortHand(hand, 'value')).toEqual(['t66', 't64', 't50', 't33', 't21']);
    expect(sortHand(hand, 'doubles')).toEqual(['t66', 't33', 't64', 't50', 't21']);
    expect(sortHand(hand, 'drawn')).toEqual([...hand]);
  });

  it('explains every disabled control', () => {
    const s = new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'controls', aiSeed: 0 }, { scheduler: manualScheduler().sched });
    const st = s.debugState();
    const v = seatView(st, st.hand.turn);
    const c = controlStates(v, s.rules, 'Cousin');
    expect(c.draw.enabled || c.pass.enabled).toBe(false);
    expect(c.draw.reason).toMatch(/playable tile/);
    const other = seatView(st, (1 - st.hand.turn) as 0 | 1);
    expect(controlStates(other, s.rules, 'Cousin').pass.reason).toBe('Waiting for Cousin.');
    expect(whyNotPlayable(other, other.myHand[0]!)).toBe('It isn’t your turn.');
  });
});
