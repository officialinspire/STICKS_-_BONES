import { describe, expect, it } from 'vitest';
import { buildObservation } from '../ai/observation';
import { decide } from '../ai/policy';
import { inlineRunner } from '../ai/runner';
import type { GameEvent } from '../engine/events';
import { seedRng } from '../engine/rng';
import type { ModeId, SeatIndex } from '../engine/types';
import { TableController } from './controller';
import type { ControllerState } from './privacy';
import { GameSession, type Scheduler } from './session';

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
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** The public view must contain no tile from any current hand; a revealed view only its owner's. */
function assertPrivacy(c: TableController, label: string) {
  const st = c.session.debugState();
  const v = c.view();
  const scan = JSON.stringify({ ...v, history: [], result: null }); // past/finished hands are public
  const revealed = c.revealed();
  if (c.privacy) expect(revealed === null || c.state.kind === 'human-turn', `${label}: revealed outside human-turn`).toBe(true);
  st.hand.hands.forEach((hand, seat) => {
    if (seat === revealed) return;
    for (const t of hand) expect(scan, `${label}: ${t} of seat ${seat} visible in state ${c.state.kind}`).not.toContain(`"${t}"`);
  });
  if (revealed === null) {
    expect(v.myHand).toEqual([]);
    expect(v.legalMoves).toEqual([]);
    expect(v.concealed).toBe(true);
  } else {
    expect(v.viewer).toBe(revealed);
    expect([...v.myHand].sort()).toEqual([...st.hand.hands[revealed]!].sort());
  }
}

interface Trace {
  states: ControllerState[];
  events: { events: readonly GameEvent[]; state: ControllerState }[];
}

/** Play `hands` complete hands acting for both humans only through the controller; inject privacy interruptions. */
async function playHands(c: TableController, flush: () => void, pending: () => number, hands: number, label: string): Promise<Trace> {
  const trace: Trace = { states: [c.state], events: [] };
  c.subscribe((events, state) => {
    trace.states.push(state);
    trace.events.push({ events, state });
  });
  let humanRng = seedRng(`humans-${label}`);
  let resolved = 0;
  let step = 0;
  for (let guard = 0; guard < 60000 && resolved < hands; guard++) {
    step++;
    assertPrivacy(c, `${label} step ${step}`);
    const st = c.state;
    if (c.session.debugState().phase === 'match-over') break;
    // Interruptions: tab hide/return and orientation changes every so often.
    if (step % 37 === 0) {
      c.conceal('hidden');
      c.pause('hidden');
      assertPrivacy(c, `${label} paused`);
      c.resume();
      if (c.privacy && c.session.isHuman(c.session.turn) && c.session.phase === 'playing') expect(c.state.kind, `${label}: resume must cover`).toBe('covered');
      continue;
    }
    if (step % 53 === 0) {
      const before = c.state.kind;
      c.conceal('orientation');
      if (before === 'human-turn') expect(c.state.kind, `${label}: orientation change must cover`).toBe('covered');
      continue;
    }
    switch (st.kind) {
      case 'covered':
        c.ready();
        break;
      case 'revealing':
        c.reveal();
        break;
      case 'human-turn': {
        expect(c.session.turn).toBe(st.seat);
        const d = decide('normal', buildObservation(c.view(), c.session.rules), humanRng);
        humanRng = d.rng;
        const a = d.action;
        const ok = a.type === 'play' ? c.play(a.tile, a.end) : a.type === 'draw' ? c.draw() : c.pass();
        expect(ok, `${label}: human action refused`).toBe(true);
        break;
      }
      case 'round-results':
        if (c.session.phase === 'hand-resolved') {
          // Turn order check on the finished hand: every non-draw action passes to the next seat.
          const log = c.session.debugState().hand.log;
          for (let i = 0; i + 1 < log.length; i++) {
            const a = log[i]!;
            const b = log[i + 1]!;
            const expected = a.kind === 'draw' ? a.seat : (a.seat + 1) % c.session.rules.seatCount;
            expect(b.seat, `${label}: turn order broke after ${a.kind} by seat ${a.seat}`).toBe(expected);
          }
          resolved++;
          expect(c.nextHand()).toBe(true);
        } else if (pending()) flush();
        else await tick();
        break;
      default:
        if (pending()) flush();
        else await tick();
    }
  }
  return trace;
}

const CONFIGS: { mode: ModeId; humanSeats: SeatIndex[]; label: string }[] = [
  { mode: 'draw2', humanSeats: [0, 1], label: 'Draw, two humans' },
  { mode: 'block2', humanSeats: [0, 1], label: 'Block, two humans' },
  { mode: 'partnership4', humanSeats: [0, 2], label: 'Partnership, humans as partners' },
  { mode: 'partnership4', humanSeats: [0, 1], label: 'Partnership, Player 2 on the right' },
  { mode: 'partnership4', humanSeats: [0, 3], label: 'Partnership, Player 2 on the left' },
];

describe('shared-device handoff through multiple complete hands', () => {
  for (const cfg of CONFIGS) {
    it(`${cfg.label}: hands only for the revealed human, cover before every human turn, scores and turn order intact`, async () => {
      const { sched, flush, pending } = manualScheduler();
      const s = new GameSession({ mode: cfg.mode, opponent: 'local', humanSeats: cfg.humanSeats, names: ['Ana', 'Ben'], difficulty: 'normal', seed: `share-${cfg.label}`, aiSeed: 'ai' }, { scheduler: sched, runner: inlineRunner() });
      const c = new TableController(s);
      expect(c.privacy).toBe(true);
      expect(s.humanSeats).toEqual(cfg.humanSeats);
      expect(s.seatName(cfg.humanSeats[0]!)).toBe('Ana');
      expect(s.seatName(cfg.humanSeats[1]!)).toBe('Ben');
      const trace = await playHands(c, flush, pending, 3, cfg.label);
      const st = s.debugState();
      expect(st.history.length).toBeGreaterThanOrEqual(st.phase === 'match-over' ? 1 : 3);

      // Every entry into a human turn was preceded by covered → revealing for that same human.
      const seq = trace.states;
      let humanTurns = 0;
      for (let i = 1; i < seq.length; i++) {
        const cur = seq[i]!;
        const prev = seq[i - 1]!;
        if (cur.kind === 'human-turn' && !(prev.kind === 'human-turn' && prev.seat === cur.seat)) {
          humanTurns++;
          expect(prev, `${cfg.label}: human turn opened without the reveal step`).toEqual({ kind: 'revealing', seat: cur.seat });
        }
        if (cur.kind === 'revealing') expect(prev).toMatchObject({ kind: 'covered', seat: cur.seat });
      }
      expect(humanTurns).toBeGreaterThan(6);

      // No event delivered while covered/AI/results names a drawn tile.
      for (const { events, state } of trace.events)
        for (const e of events) if (e.type === 'tile-drawn' && e.tile) expect(state).toMatchObject({ kind: 'human-turn', seat: e.seat });

      // Scores: each hand's points went to the side of the seat credited with the win.
      let expected = s.rules.teams.map(() => 0);
      for (const h of st.history) {
        if (h.winnerTeam !== null) {
          expect(s.rules.teams[h.winnerTeam]).toContain(h.winnerSeat);
          expected = expected.map((v, t) => (t === h.winnerTeam ? v + h.points : v));
        }
        expect(h.scoresAfter).toEqual(expected);
      }
      // Team names follow the chosen seating.
      for (const [t, team] of s.rules.teams.entries()) expect(s.teamName(t)).toBe(team.map((x) => s.seatName(x)).join(' & '));
      c.dispose();
    }, 60000);
  }

  it('AI turns between the two humans show the public table, never the previous human’s hand', async () => {
    const { sched, flush, pending } = manualScheduler();
    const s = new GameSession({ mode: 'partnership4', opponent: 'local', humanSeats: [0, 2], seed: 'between', aiSeed: 'x' }, { scheduler: sched, runner: inlineRunner() });
    const c = new TableController(s);
    const trace = await playHands(c, flush, pending, 1, 'between');
    const aiStates = trace.states.filter((x) => x.kind === 'ai-turn');
    expect(aiStates.length).toBeGreaterThan(4);
    c.dispose();
  });

  it('a restored two-human game opens covered for whoever is on turn', async () => {
    const { sched, flush, pending } = manualScheduler();
    const s = new GameSession({ mode: 'draw2', opponent: 'local', seed: 'restore', aiSeed: 'x' }, { scheduler: sched, runner: inlineRunner() });
    const c = new TableController(s);
    await playHands(c, flush, pending, 1, 'restore-pre');
    const saved = JSON.parse(JSON.stringify(s.debugState()));
    c.dispose();
    const s2 = new GameSession({ state: saved, opponent: 'local' }, { scheduler: manualScheduler().sched });
    const c2 = new TableController(s2, { restored: true });
    if (s2.phase === 'playing') expect(c2.state).toEqual({ kind: 'covered', seat: s2.turn, reason: 'restored' });
    else expect(c2.state.kind).toBe('round-results');
    assertPrivacy(c2, 'restored');
    c2.dispose();
  });

  it('solo play has no cover and keeps the human’s own hand visible during AI turns', async () => {
    const { sched, flush, pending } = manualScheduler();
    const s = new GameSession({ mode: 'partnership4', opponent: 'ai', seed: 'solo', aiSeed: 'x' }, { scheduler: sched, runner: inlineRunner() });
    const c = new TableController(s);
    expect(c.privacy).toBe(false);
    const trace = await playHands(c, flush, pending, 2, 'solo');
    expect(trace.states.some((x) => x.kind === 'covered' || x.kind === 'revealing')).toBe(false);
    c.dispose();
  });

  it('intents from anyone but the revealed human are ignored', () => {
    const { sched } = manualScheduler();
    const s = new GameSession({ mode: 'block2', opponent: 'local', seed: 'intents', aiSeed: 'x' }, { scheduler: sched, runner: inlineRunner() });
    const c = new TableController(s);
    const seq = s.seq;
    expect(c.state.kind).toBe('covered');
    const hand = s.debugState().hand.hands[s.turn]!;
    expect(c.play(hand[0]!, 'head')).toBe(false);
    expect(c.pass()).toBe(false);
    c.ready();
    expect(c.play(hand[0]!, 'head')).toBe(false); // still not revealed
    expect(s.seq).toBe(seq);
    c.dispose();
  });
});
