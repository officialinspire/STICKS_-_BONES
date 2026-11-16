import { describe, expect, it } from 'vitest';
import { chooseCommand } from '../ai/simple';
import { checkInvariants } from '../engine/invariants';
import { seatView } from '../engine/view';
import type { GameEvent } from '../engine/events';
import { controlStates, sortHand, whyNotPlayable } from './helpers';
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

/** Drive a session to match end acting as the human(s) with the same fair AI heuristic via public intents. */
function playOut(s: GameSession, flush: () => void, pending: () => number, onStep?: () => void): number {
  for (let i = 0; i < 20000; i++) {
    onStep?.();
    const st = s.debugState();
    if (st.phase === 'match-over') return i;
    if (s.handoffPending) {
      s.confirmHandoff();
      continue;
    }
    if (st.phase === 'hand-resolved') {
      expect(s.nextHand()).toBe(true);
      continue;
    }
    if (s.canAct()) {
      const v = s.view();
      const cmd = chooseCommand(v, s.rules.noMove.kind === 'draw-until-playable')!;
      const ok = cmd.type === 'play' ? s.play(cmd.tile, cmd.end) : cmd.type === 'draw' ? s.draw() : s.pass();
      expect(ok).toBe(true);
      continue;
    }
    expect(pending()).toBeGreaterThan(0);
    flush();
  }
  throw new Error('session did not finish');
}

describe('GameSession', () => {
  for (const [mode, opponent] of [
    ['draw2', 'ai'],
    ['block2', 'ai'],
    ['draw2', 'local'],
    ['block2', 'dev-both'],
  ] as [('draw2' | 'block2'), OpponentKind][]) {
    it(`${mode} vs ${opponent}: plays a full match through intents only, with legal states throughout`, () => {
      const { sched, flush, pending } = manualScheduler();
      const s = new GameSession({ mode, opponent, seed: `session-${mode}-${opponent}` }, sched);
      const events: GameEvent[] = [];
      s.subscribe((e) => events.push(...e));
      playOut(s, flush, pending, () => expect(checkInvariants(s.debugState())).toEqual([]));
      expect(s.debugState().phase).toBe('match-over');
      expect(events.some((e) => e.type === 'match-won')).toBe(true);
      // The viewer never receives another seat's drawn tile.
      for (const e of events) if (e.type === 'tile-drawn' && e.tile) expect(s.isHuman(e.seat)).toBe(true);
    });
  }

  it('vs AI: the human is always seat 0 and the AI never acts on the human seat', () => {
    const { sched, flush, pending } = manualScheduler();
    const s = new GameSession({ mode: 'draw2', opponent: 'ai', seed: 'ai-seat' }, sched);
    playOut(s, flush, pending, () => {
      expect(s.viewer).toBe(0);
      const st = s.debugState();
      if (st.phase === 'playing' && st.hand.turn === 0) expect(pending()).toBe(0);
    });
  });

  it('pass-and-play: a handoff screen appears whenever the device must change hands, and at each new hand', () => {
    const { sched, flush, pending } = manualScheduler();
    const s = new GameSession({ mode: 'block2', opponent: 'local', seed: 'handoff' }, sched);
    expect(s.handoffPending).toBe(true);
    expect(s.canAct()).toBe(false);
    let handoffs = 0;
    let lastViewer = s.viewer;
    playOut(s, flush, pending, () => {
      if (s.handoffPending) handoffs++;
      if (s.viewer !== lastViewer) {
        expect(s.handoffPending).toBe(true);
        lastViewer = s.viewer;
      }
    });
    expect(handoffs).toBeGreaterThan(2);
  });

  it('dev-both: no handoff, the viewer follows the turn', () => {
    const { sched } = manualScheduler();
    const s = new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'dev' }, sched);
    expect(s.handoffPending).toBe(false);
    expect(s.viewer).toBe(s.debugState().hand.turn);
    expect(s.canAct()).toBe(true);
  });

  it('rejects out-of-turn intents and reports engine errors without changing state', () => {
    const { sched } = manualScheduler();
    const s = new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'errors' }, sched);
    const before = s.debugState();
    const v = s.view();
    const illegal = v.myHand.find((t) => !v.legalMoves.some((m) => m.tile === t));
    if (illegal) {
      expect(s.play(illegal, 'head')).toBe(false);
      expect(s.lastError?.code).toBe('must-lead-required-tile');
    }
    expect(s.pass()).toBe(false);
    expect(s.lastError?.code).toBe('has-legal-move');
    expect(s.debugState()).toBe(before);
  });

  it('stale AI timers are ignored after dispose', () => {
    const { sched, flush, pending } = manualScheduler();
    const s = new GameSession({ mode: 'draw2', opponent: 'ai', seed: 'dispose' }, sched);
    if (s.debugState().hand.turn === 0) {
      const v = s.view();
      s.play(v.legalMoves[0]!.tile, v.legalMoves[0]!.end);
    }
    const seq = s.debugState().seq;
    expect(pending()).toBe(1);
    s.dispose();
    flush();
    expect(s.debugState().seq).toBe(seq);
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
    const { sched } = manualScheduler();
    const s = new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'controls' }, sched);
    const st = s.debugState();
    const v = seatView(st, st.hand.turn);
    const c = controlStates(v, s.rules, 'Cousin');
    expect(c.draw.enabled || c.pass.enabled).toBe(false);
    expect(c.draw.reason).toMatch(/playable tile/);
    const other = seatView(st, (1 - st.hand.turn) as 0 | 1);
    expect(controlStates(other, s.rules, 'Cousin').pass.reason).toBe('Waiting for Cousin.');
    const illegal = other.myHand[0]!;
    expect(whyNotPlayable(other, illegal)).toBe('It isn’t your turn.');
    if (v.requirement.kind === 'tile') {
      const notReq = v.myHand.find((t) => t !== (v.requirement as { tile: string }).tile);
      if (notReq) expect(whyNotPlayable(v, notReq)).toMatch(/must open with/);
    }
  });
});
