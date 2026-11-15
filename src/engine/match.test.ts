import { describe, expect, it } from 'vitest';
import type { Command } from './commands';
import { createMatchConfig } from './config';
import { redactEventsForSeat, type GameEvent } from './events';
import { checkInvariants } from './invariants';
import { applyCommand, availableAction, createMatch, createMatchWithDeal, legalMoves } from './match';
import { selectOpener } from './opening';
import { seedRng } from './rng';
import { COUSINS_HOUSE_RULES_V1 } from './rules/presets';
import type { HandResult, MatchState } from './state';
import { chain, complement, craft } from './testing/craft';
import { CANONICAL_TILE_IDS } from './tiles';
import type { ModeId, SeatIndex, TileId } from './types';
import { seatView } from './view';

const RULES = COUSINS_HOUSE_RULES_V1.modes;

function config(mode: ModeId, targetScore?: 100 | 200) {
  const c = createMatchConfig({ mode, ...(targetScore ? { targetScore } : {}) });
  if (!c.ok) throw new Error('config');
  return c.config;
}

/** Apply a command that must succeed. `cmd` omits seq; the current seq is filled in. */
function ok(state: MatchState, cmd: Record<string, unknown>): { state: MatchState; events: readonly GameEvent[] } {
  const r = applyCommand(state, { ...cmd, seq: state.seq });
  if (!r.ok) throw new Error(`expected success, got ${r.error.code}: ${r.error.message}`);
  expect(checkInvariants(r.state)).toEqual([]);
  return r;
}

/** Apply a command that must be rejected with `code`; the state must come back untouched. */
function rejects(state: MatchState, cmd: Record<string, unknown>, code: string) {
  const r = applyCommand(state, { seq: state.seq, ...cmd });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe(code);
  expect(r.state).toBe(state);
}

const play = (seat: number, tile: string, end: 'head' | 'tail' = 'tail') => ({ type: 'play', seat, tile, end });
const pass = (seat: number) => ({ type: 'pass', seat });
const drawCmd = (seat: number) => ({ type: 'draw', seat });
const RESOLVE = { type: 'resolve-hand' };
const NEXT = { type: 'start-next-hand' };

// A line whose two open ends are both 0 and which holds all seven 0-tiles,
// so nobody can ever play on it (126 pips remain off the line).
const ZERO_LOCK: [string, number, number][] = [
  ['t20', 0, 2],
  ['t21', 2, 1],
  ['t10', 1, 0],
  ['t00', 0, 0],
  ['t30', 0, 3],
  ['t43', 3, 4],
  ['t40', 4, 0],
  ['t50', 0, 5],
  ['t65', 5, 6],
  ['t60', 6, 0],
];
const TIE_A = ['t11', 't22', 't31', 't32', 't44', 't53', 't55', 't64', 't66']; // 63 pips
const PARTNER_OUT = (() => {
  const hands = [['t55', 't44'], ['t33', 't22', 't11'], ['t65'], ['t00', 't50']];
  return { hands, line: chain(complement(...hands), 6) }; // head end shows 6
})();
const TIE_B = ['t33', 't41', 't42', 't51', 't52', 't54', 't61', 't62', 't63']; // 63 pips

describe('deal and conservation', () => {
  it('deals unique tiles across hands and stock for every mode; same seed → same deal', () => {
    for (const mode of ['draw2', 'block2', 'partnership4'] as const) {
      const a = createMatch(config(mode), 'deal-check');
      const b = createMatch(config(mode), 'deal-check');
      const c = createMatch(config(mode), 'deal-check-2');
      if (!a.ok || !b.ok || !c.ok) throw new Error('create');
      const zones = [...a.state.hand.hands.flat(), ...a.state.hand.stock];
      expect(new Set(zones).size).toBe(28);
      expect([...zones].sort()).toEqual([...CANONICAL_TILE_IDS].sort());
      expect(a.state.hand.stock).toHaveLength(RULES[mode].stock.size);
      expect(a.state).toEqual(b.state);
      expect(a.state.hand.hands).not.toEqual(c.state.hand.hands);
      expect(checkInvariants(a.state)).toEqual([]);
    }
  });

  it('rejects invalid configs, seeds and explicit deals', () => {
    expect(createMatch({ mode: 'draw2' }, 1).ok).toBe(false);
    expect(createMatch(config('draw2'), -5).ok).toBe(false);
    const short = { hands: [CANONICAL_TILE_IDS.slice(0, 7), CANONICAL_TILE_IDS.slice(7, 14)], stock: CANONICAL_TILE_IDS.slice(14, 27) };
    expect(createMatchWithDeal(config('draw2'), short).ok).toBe(false);
    const dup = { hands: [CANONICAL_TILE_IDS.slice(0, 7), CANONICAL_TILE_IDS.slice(0, 7)], stock: CANONICAL_TILE_IDS.slice(14, 28) };
    expect(createMatchWithDeal(config('draw2'), dup).ok).toBe(false);
  });
});

describe('opening', () => {
  it('draw: highest dealt double opens and must be led', () => {
    const hands = [
      ['t55', 't50', 't51', 't52', 't53', 't54', 't40'],
      ['t66', 't60', 't61', 't62', 't63', 't64', 't65'],
    ] as TileId[][];
    const stock = CANONICAL_TILE_IDS.filter((t) => !hands.flat().includes(t));
    const r = createMatchWithDeal(config('draw2'), { hands, stock });
    if (!r.ok) throw new Error(r.errors.join());
    const s = r.state;
    expect(s.hand.opener).toBe(1);
    expect(s.hand.requirement).toEqual({ kind: 'tile', tile: 't66' });
    expect(r.events[0]).toMatchObject({ type: 'hand-started', opener: 1, requirement: { kind: 'tile', tile: 't66' } });
    expect(legalMoves(s).map((m) => m.tile)).toEqual(['t66']);
    rejects(s, play(1, 't65'), 'must-lead-required-tile');
    rejects(s, play(0, 't55'), 'not-your-turn');
    expect(ok(s, play(1, 't66')).state.hand.turn).toBe(0);
  });

  it('draw: with no dealt doubles the heaviest tile opens, ties by higher end (6-3 beats 5-4)', () => {
    const hands = [
      ['t63', 't62', 't61', 't60', 't52', 't51', 't50'],
      ['t54', 't53', 't43', 't42', 't41', 't40', 't32'],
    ] as TileId[][];
    const stock = CANONICAL_TILE_IDS.filter((t) => !hands.flat().includes(t));
    expect(stock.filter((t) => t[1] === t[2])).toHaveLength(7);
    const r = createMatchWithDeal(config('draw2'), { hands, stock });
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.state.hand.opener).toBe(0);
    expect(r.state.hand.requirement).toEqual({ kind: 'tile', tile: 't63' });
  });

  it('block uses the same first-hand selection', () => {
    const hands = [
      ['t65', 't64', 't63', 't62', 't61', 't60', 't54'],
      ['t11', 't53', 't43', 't42', 't41', 't40', 't32'],
    ] as TileId[][];
    const stock = CANONICAL_TILE_IDS.filter((t) => !hands.flat().includes(t));
    const r = createMatchWithDeal(config('block2'), { hands, stock });
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.state.hand.opener).toBe(1);
    expect(r.state.hand.requirement).toEqual({ kind: 'tile', tile: 't11' });
  });

  it('partnership: the double-six holder leads it', () => {
    for (let i = 0; i < 20; i++) {
      const r = createMatch(config('partnership4'), `p4-open-${i}`);
      if (!r.ok) throw new Error('create');
      const holder = r.state.hand.hands.findIndex((h) => h.includes('t66'));
      expect(r.state.hand.opener).toBe(holder);
      expect(r.state.hand.turn).toBe(holder);
      expect(r.state.hand.requirement).toEqual({ kind: 'tile', tile: 't66' });
    }
  });

  const result = (over: Partial<HandResult>): HandResult => ({
    handNumber: 1,
    opener: 0,
    end: { kind: 'blocked' },
    finalHands: [],
    seatTotals: [0, 0, 0, 0],
    teamTotals: [0, 0],
    winnerTeam: 0,
    winnerSeat: 0,
    points: 0,
    scoresAfter: [0, 0],
    ...over,
  });
  const someHands = [['t66'], ['t55'], ['t44'], ['t33']] as TileId[][];

  it('later hands: draw → previous winner (any tile); draw tie → initial selection', () => {
    expect(selectOpener(RULES.draw2, someHands.slice(0, 2), { result: result({ end: { kind: 'out', seat: 1 }, winnerTeam: 1, winnerSeat: 1 }), opener: 0 })).toEqual({
      seat: 1,
      requirement: { kind: 'any' },
      rule: 'previous-winner',
    });
    expect(selectOpener(RULES.draw2, [['t44'], ['t55']], { result: result({ winnerTeam: null, winnerSeat: null }), opener: 1 })).toEqual({
      seat: 1,
      requirement: { kind: 'tile', tile: 't55' },
      rule: 'highest-double-else-heaviest',
    });
  });

  it('later hands: block rotates from the previous opener regardless of outcome', () => {
    for (const r of [result({ end: { kind: 'out', seat: 0 } }), result({ winnerTeam: 1, winnerSeat: 1 }), result({ winnerTeam: null, winnerSeat: null })]) {
      expect(selectOpener(RULES.block2, someHands.slice(0, 2), { result: r, opener: 0 }).seat).toBe(1);
      expect(selectOpener(RULES.block2, someHands.slice(0, 2), { result: r, opener: 1 }).seat).toBe(0);
    }
  });

  it('later hands: partnership out → that seat; block → lowest winning member with turn-order tie-break; tie → double-six', () => {
    const out = result({ end: { kind: 'out', seat: 2 }, winnerTeam: 0, winnerSeat: 2 });
    expect(selectOpener(RULES.partnership4, someHands, { result: out, opener: 1 })).toMatchObject({ seat: 2, requirement: { kind: 'any' } });
    const blockLow = result({ winnerTeam: 1, seatTotals: [10, 9, 10, 4] });
    expect(selectOpener(RULES.partnership4, someHands, { result: blockLow, opener: 0 }).seat).toBe(3);
    const blockTied = result({ winnerTeam: 0, seatTotals: [6, 40, 6, 40] });
    expect(selectOpener(RULES.partnership4, someHands, { result: blockTied, opener: 3 }).seat).toBe(0);
    expect(selectOpener(RULES.partnership4, someHands, { result: blockTied, opener: 1 }).seat).toBe(2);
    expect(selectOpener(RULES.partnership4, someHands, { result: blockTied, opener: 2 }).seat).toBe(2);
    const tie = result({ winnerTeam: null, winnerSeat: null });
    expect(selectOpener(RULES.partnership4, someHands, { result: tie, opener: 3 })).toEqual({
      seat: 0,
      requirement: { kind: 'tile', tile: 't66' },
      rule: 'double-six-holder',
    });
  });
});

describe('placement through commands', () => {
  it('offers both ends for a tile that fits both, and either end is playable', () => {
    const s = craft({
      mode: 'partnership4',
      line: [
        ['t31', 3, 1],
        ['t51', 1, 5],
      ],
      hands: [
        ['t53', 't22', 't33', 't44', 't66', 't65'],
        ['t64', 't63', 't62', 't61', 't60', 't55', 't54'],
        ['t52', 't50', 't43', 't42', 't41', 't40', 't32'],
        ['t30', 't21', 't20', 't11', 't10', 't00'],
      ],
      turn: 0,
    });
    const moves = legalMoves(s).filter((m) => m.tile === 't53');
    expect(moves.map((m) => m.end)).toEqual(['head', 'tail']);
    const head = ok(s, play(0, 't53', 'head'));
    const tail = ok(s, play(0, 't53', 'tail'));
    expect(head.state.hand.line.tiles[0]).toMatchObject({ tile: 't53', headPip: 5, tailPip: 3 });
    expect(tail.state.hand.line.tiles[2]).toMatchObject({ tile: 't53', headPip: 5, tailPip: 3 });
    expect(head.events[0]).toMatchObject({ type: 'tile-played', openEnds: { head: 5, tail: 5 } });
    expect(tail.events[0]).toMatchObject({ type: 'tile-played', openEnds: { head: 3, tail: 3 } });
  });

  it('pass counter resets after a play; turn order is counterclockwise', () => {
    const s0 = craft({
      mode: 'partnership4',
      line: [['t66', 6, 6]],
      hands: [
        ['t50', 't51', 't52', 't53', 't54', 't55'],
        ['t40', 't41', 't42', 't43', 't44', 't30', 't31'],
        ['t32', 't33', 't20', 't21', 't22', 't10', 't11'],
        ['t65', 't64', 't63', 't62', 't61', 't60', 't00'],
      ],
      turn: 1,
      opener: 0,
    });
    let s = ok(s0, pass(1)).state;
    expect(s.hand.consecutivePasses).toBe(1);
    s = ok(s, pass(2)).state;
    expect(s.hand.consecutivePasses).toBe(2);
    expect(s.hand.turn).toBe(3);
    s = ok(s, play(3, 't65', 'tail')).state;
    expect(s.hand.consecutivePasses).toBe(0);
    expect(s.hand.turn).toBe(0);
  });
});

describe('draw mode: forced draw and exhausted boneyard', () => {
  const base = () =>
    craft({
      mode: 'draw2',
      line: [['t66', 6, 6]],
      hands: [
        ['t55', 't54', 't53', 't52', 't51', 't50', 't44'],
        ['t65', 't64', 't63', 't62', 't60', 't43'],
      ],
      stock: ['t21', 't30', 't61'],
      turn: 0,
      opener: 1,
    });

  it('must draw until a playable tile arrives, then must play it that turn', () => {
    let s = base();
    expect(availableAction(s)).toEqual({ kind: 'draw', seat: 0 });
    rejects(s, pass(0), 'must-draw');
    rejects(s, play(0, 't55'), 'illegal-placement');
    rejects(s, drawCmd(1), 'not-your-turn');
    let r = ok(s, drawCmd(0));
    expect(r.events).toEqual([{ type: 'tile-drawn', seat: 0, tile: 't21', playable: false, stockCount: 13, handSize: 8 }]);
    s = r.state;
    expect(s.hand.turn).toBe(0);
    s = ok(s, drawCmd(0)).state;
    r = ok(s, drawCmd(0));
    expect(r.events[0]).toMatchObject({ tile: 't61', playable: true });
    s = r.state;
    expect(s.hand.drawsThisTurn).toBe(3);
    rejects(s, drawCmd(0), 'has-legal-move');
    rejects(s, pass(0), 'has-legal-move');
    s = ok(s, play(0, 't61', 'tail')).state;
    expect(s.hand.turn).toBe(1);
    expect(s.hand.drawsThisTurn).toBe(0);
    expect(s.hand.hands[0]).toHaveLength(9);
  });

  it('cannot draw while holding a legal tile', () => {
    const s = craft({
      mode: 'draw2',
      line: [['t66', 6, 6]],
      hands: [
        ['t61', 't54', 't53', 't52', 't51', 't50', 't44'],
        ['t65', 't64', 't63', 't62', 't60', 't43'],
      ],
      turn: 0,
      opener: 1,
    });
    rejects(s, drawCmd(0), 'has-legal-move');
    rejects(s, pass(0), 'has-legal-move');
  });

  it('exhausted boneyard: pass only once empty; draws never cause a premature block', () => {
    // Seat 0 holds nothing playable and every boneyard tile is unplayable for it.
    const hands = [TIE_A.slice(0, 5), TIE_B.slice(0, 5)];
    let s = craft({ mode: 'draw2', line: ZERO_LOCK, hands, turn: 0, opener: 1 });
    const boneyard = s.hand.stock.length;
    expect(boneyard).toBe(8);
    for (let i = 0; i < boneyard; i++) {
      rejects(s, pass(0), 'must-draw');
      s = ok(s, drawCmd(0)).state;
      expect(s.phase).toBe('playing');
      expect(s.hand.consecutivePasses).toBe(0);
    }
    rejects(s, drawCmd(0), 'boneyard-empty');
    expect(availableAction(s)).toEqual({ kind: 'pass', seat: 0 });
    s = ok(s, pass(0)).state;
    expect(s.phase).toBe('playing');
    const r = ok(s, pass(1));
    expect(r.state.phase).toBe('hand-ended');
    expect(r.events.at(-1)).toEqual({ type: 'hand-ended', end: { kind: 'blocked' } });
  });

  it('draw is not available in block or partnership', () => {
    const s = craft({ mode: 'block2', line: [['t00', 0, 0]], hands: [['t43', 't44', 't51', 't52', 't53', 't54'], ['t55', 't61', 't62', 't63', 't64', 't65', 't66']], stock: ['t10', 't20', 't30', 't40', 't50', 't60'], turn: 1, opener: 0 });
    rejects(s, drawCmd(1), 'no-draw-in-mode');
    expect(availableAction(s)).toEqual({ kind: 'pass', seat: 1 });
  });
});

describe('command validation', () => {
  const s = craft({
    mode: 'draw2',
    line: [
      ['t63', 6, 3],
      ['t31', 3, 1],
    ],
    hands: [
      ['t61', 't54', 't53', 't52', 't51', 't50', 't44'],
      ['t65', 't64', 't62', 't60', 't43', 't11'],
    ],
    turn: 0,
    opener: 1,
  });
  it.each([
    ['wrong seat', play(1, 't65', 'head'), 'not-your-turn'],
    ['seat out of range', play(5, 't61'), 'invalid-seat'],
    ['non-canonical tile', play(0, 't16'), 'invalid-tile'],
    ['reused tile already on the line', play(0, 't31'), 'tile-already-played'],
    ["opponent's tile", play(0, 't65', 'head'), 'tile-not-in-hand'],
    ['illegal match', play(0, 't54', 'head'), 'illegal-placement'],
    ['wrong end for a matching tile', play(0, 't51', 'head'), 'illegal-placement'],
    ['unknown end', { type: 'play', seat: 0, tile: 't61', end: 'middle' }, 'invalid-end'],
    ['premature draw', drawCmd(0), 'has-legal-move'],
    ['premature pass', pass(0), 'has-legal-move'],
    ['resolve mid-hand', RESOLVE, 'hand-not-ended'],
    ['next hand mid-hand', NEXT, 'hand-not-resolved'],
    ['stale seq', { ...play(0, 't61', 'head'), seq: 99 }, 'stale-command'],
    ['malformed', { type: 'teleport', seat: 0 }, 'malformed-command'],
  ])('%s', (_l, cmd, code) => rejects(s, cmd, code));

  it('rejects non-objects and missing seq', () => {
    expect(applyCommand(s, null).ok).toBe(false);
    expect(applyCommand(s, { type: 'pass', seat: 0 }).ok).toBe(false);
  });

  it('a replayed (stale) command after success is rejected', () => {
    const cmd = { ...play(0, 't61', 'head'), seq: s.seq } as Command;
    const first = applyCommand(s, cmd);
    expect(first.ok).toBe(true);
    const again = applyCommand(first.state, cmd);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('stale-command');
  });

  it('does not mutate the input state', () => {
    const snapshot = JSON.stringify(s);
    ok(s, play(0, 't61', 'head'));
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('out, block, scoring and resolution', () => {
  it('draw out: winner scores all pips left (opponent hand)', () => {
    const s = craft({ mode: 'draw2', line: [['t66', 6, 6]], hands: [['t61'], ['t55', 't44', 't20']], turn: 0, opener: 1 });
    let r = ok(s, play(0, 't61', 'tail'));
    expect(r.state.phase).toBe('hand-ended');
    expect(r.events.at(-1)).toEqual({ type: 'hand-ended', end: { kind: 'out', seat: 0 } });
    rejects(r.state, play(1, 't55'), 'hand-not-in-progress');
    rejects(r.state, NEXT, 'hand-not-resolved');
    r = ok(r.state, RESOLVE);
    const res = r.state.hand.result!;
    expect(res).toMatchObject({ seatTotals: [0, 20], winnerTeam: 0, winnerSeat: 0, points: 20, scoresAfter: [20, 0] });
    expect(res.finalHands).toEqual([[], ['t55', 't44', 't20']]);
    expect(r.state.scores).toEqual([20, 0]);
    expect(r.state.phase).toBe('hand-resolved');
  });

  it('draw block: lower pip holder wins and scores all remaining pips including their own', () => {
    let s = craft({ mode: 'draw2', line: ZERO_LOCK, hands: [['t11', 't22', 't31'], CANONICAL_TILE_IDS.filter((t) => !['t11', 't22', 't31'].includes(t) && !ZERO_LOCK.some(([z]) => z === t))], turn: 0, opener: 1, targetScore: 200 });
    s = ok(ok(s, pass(0)).state, pass(1)).state;
    const r = ok(s, RESOLVE);
    expect(r.state.hand.result).toMatchObject({ seatTotals: [10, 116], winnerTeam: 0, winnerSeat: 0, points: 126 });
    const next = ok(r.state, NEXT);
    expect(next.state.hand).toMatchObject({ number: 2, opener: 0, turn: 0, requirement: { kind: 'any' }, openingRule: 'previous-winner' });
    expect(next.state.hand.line.tiles).toHaveLength(0);
    expect(next.state.hand.hands.every((h) => h.length === 7)).toBe(true);
  });

  it('draw blocked tie: zero points; next hand uses the initial opening selection', () => {
    let s = craft({ mode: 'draw2', line: ZERO_LOCK, hands: [TIE_A, TIE_B], turn: 1, opener: 0, scores: [40, 30] });
    s = ok(ok(s, pass(1)).state, pass(0)).state;
    const r = ok(s, RESOLVE);
    expect(r.state.hand.result).toMatchObject({ seatTotals: [63, 63], winnerTeam: null, winnerSeat: null, points: 0 });
    expect(r.state.scores).toEqual([40, 30]);
    const next = ok(r.state, NEXT).state;
    expect(next.hand.openingRule).toBe('highest-double-else-heaviest');
    expect(next.hand.requirement.kind).toBe('tile');
    expect(selectOpener(RULES.draw2, next.hand.hands, null).seat).toBe(next.hand.opener);
  });

  const blockBase = { line: [['t00', 0, 0]] as [string, number, number][], stock: ['t10', 't20', 't30', 't40', 't50', 't60', 't11', 't21', 't22', 't31', 't32', 't33', 't41', 't42'] };

  it('block out: winner scores opponent pips; next opener rotates', () => {
    const line: [string, number, number][] = [
      ['t21', 2, 1],
      ['t11', 1, 1],
      ['t10', 1, 0],
      ['t00', 0, 0],
      ['t40', 0, 4],
      ['t64', 4, 6],
    ];
    const s = craft({ mode: 'block2', line, hands: [['t66'], ['t55', 't54', 't53', 't52', 't51', 't44', 't43']], turn: 0, opener: 1 });
    expect(s.hand.stock).toHaveLength(14);
    let r = ok(s, play(0, 't66', 'tail'));
    r = ok(r.state, RESOLVE);
    expect(r.state.hand.result).toMatchObject({ end: { kind: 'out', seat: 0 }, seatTotals: [0, 55], points: 55 });
    const next = ok(r.state, NEXT).state;
    expect(next.hand).toMatchObject({ opener: 0, requirement: { kind: 'any' }, openingRule: 'rotate-from-previous-opener' });
  });

  it('block block: lower pip holder scores opponent minus own; tie scores zero', () => {
    let s = craft({ mode: 'block2', ...blockBase, hands: [['t43', 't44', 't51', 't52', 't53', 't54'], ['t55', 't61', 't62', 't63', 't64', 't65', 't66']], turn: 1, opener: 0 });
    s = ok(ok(s, pass(1)).state, pass(0)).state;
    const r = ok(s, RESOLVE);
    expect(r.state.hand.result).toMatchObject({ seatTotals: [45, 67], winnerTeam: 0, points: 22 });
    expect(ok(r.state, NEXT).state.hand.opener).toBe(1);

    let t = craft({ mode: 'block2', line: [['t00', 0, 0]], stock: ['t10', 't20', 't30', 't40', 't50', 't60', 't11', 't21', 't22', 't31', 't32', 't33', 't41', 't42'], hands: [['t66', 't51', 't43', 't44', 't52', 't53'], ['t65', 't64', 't63', 't62', 't61', 't55', 't54']], turn: 1, opener: 0 });
    const totals = t.hand.hands.map((h) => h.reduce((a, id) => a + Number(id[1]) + Number(id[2]), 0));
    t = ok(ok(t, pass(1)).state, pass(0)).state;
    const tr = ok(t, RESOLVE).state.hand.result!;
    expect(tr.seatTotals).toEqual(totals);
    if (totals[0] === totals[1]) expect(tr).toMatchObject({ winnerTeam: null, points: 0 });
    else expect(tr.points).toBe(Math.abs(totals[0]! - totals[1]!));
  });

  it('partnership: partner going out wins for the team, scoring all four hands', () => {
    const s = craft({ mode: 'partnership4', ...PARTNER_OUT, turn: 2, opener: 1 });
    let r = ok(s, play(2, 't65', 'head'));
    expect(r.state.hand.end).toEqual({ kind: 'out', seat: 2 });
    r = ok(r.state, RESOLVE);
    expect(r.state.hand.result).toMatchObject({ seatTotals: [18, 12, 0, 5], teamTotals: [18, 17], winnerTeam: 0, winnerSeat: 2, points: 35 });
    expect(r.state.scores).toEqual([35, 0]);
    expect(ok(r.state, NEXT).state.hand).toMatchObject({ opener: 2, requirement: { kind: 'any' }, openingRule: 'seat-that-went-out' });
  });

  it('partnership block: lower team wins all pips; tied teammates resolved from the previous opener', () => {
    const hands = [['t11', 't31'], ['t42', 't44', 't51', 't53', 't62', 't63', 't65'], ['t33'], ['t21', 't22', 't41', 't43', 't52', 't55', 't64']];
    const line = chain(complement(...hands), 0); // every blank is on the line; both ends are 0
    const make = (opener: number) => craft({ mode: 'partnership4', line, hands, turn: 0, opener });
    for (const [opener, expected] of [
      [3, 0],
      [1, 2],
      [0, 0],
      [2, 2],
    ] as const) {
      let s = make(opener);
      for (const seat of [0, 1, 2, 3]) s = ok(s, pass(seat)).state;
      const r = ok(s, RESOLVE).state;
      expect(r.hand.result).toMatchObject({ seatTotals: [6, 56, 6, 46], teamTotals: [12, 102], winnerTeam: 0, points: 114 });
      expect(ok(r, NEXT).state.hand).toMatchObject({ opener: expected, requirement: { kind: 'any' }, openingRule: 'lowest-member-of-winning-team' });
    }
  });

  it('partnership tied team totals: zero, then the double-six holder opens', () => {
    let s = craft({ mode: 'partnership4', line: ZERO_LOCK, hands: [TIE_A.slice(0, 4), TIE_B.slice(0, 4), TIE_A.slice(4), TIE_B.slice(4)], turn: 2, opener: 1 });
    expect(s.hand.hands.map((h) => h.length)).toEqual([4, 4, 5, 5]);
    for (const seat of [2, 3, 0, 1]) s = ok(s, pass(seat)).state;
    const r = ok(s, RESOLVE).state;
    expect(r.hand.result).toMatchObject({ teamTotals: [63, 63], winnerTeam: null, points: 0 });
    const next = ok(r, NEXT).state;
    expect(next.hand.requirement).toEqual({ kind: 'tile', tile: 't66' });
    expect(next.hand.hands[next.hand.opener]).toContain('t66');
  });

  it('resolution happens exactly once: duplicate resolve commands are rejected', () => {
    const s = craft({ mode: 'draw2', line: [['t66', 6, 6]], hands: [['t61'], ['t55', 't44', 't20']], turn: 0, opener: 1 });
    const ended = ok(s, play(0, 't61', 'tail')).state;
    const resolveCmd = { type: 'resolve-hand', seq: ended.seq };
    const once = applyCommand(ended, resolveCmd);
    if (!once.ok) throw new Error('resolve');
    const staleDup = applyCommand(once.state, resolveCmd);
    expect(staleDup.ok || staleDup.error.code).toBe('stale-command');
    rejects(once.state, RESOLVE, 'already-resolved');
    expect(once.state.scores).toEqual([20, 0]);
    expect(once.state.history).toHaveLength(1);
    // Resolving the same ended state twice independently gives the same single score.
    const twin = applyCommand(ended, resolveCmd);
    expect(twin.ok && twin.state.scores).toEqual([20, 0]);
  });
});

describe('match target', () => {
  it('crossing the target ends the match; only the winning side scores', () => {
    const s = craft({ mode: 'draw2', line: [['t66', 6, 6]], hands: [['t61'], ['t55', 't44', 't20']], turn: 0, opener: 1, scores: [95, 99] });
    const ended = ok(s, play(0, 't61', 'tail')).state;
    const r = ok(ended, RESOLVE);
    expect(r.state.phase).toBe('match-over');
    expect(r.state.winnerTeam).toBe(0);
    expect(r.state.scores).toEqual([115, 99]);
    expect(r.events.map((e) => e.type)).toEqual(['hand-resolved', 'match-won']);
    rejects(r.state, NEXT, 'match-over');
    rejects(r.state, RESOLVE, 'match-over');
    expect(availableAction(r.state)).toEqual({ kind: 'none' });
  });

  it('reaching exactly the target wins; falling short continues', () => {
    const exact = craft({ mode: 'draw2', line: [['t66', 6, 6]], hands: [['t61'], ['t55', 't44', 't20']], turn: 0, opener: 1, scores: [80, 0] });
    expect(ok(ok(exact, play(0, 't61', 'tail')).state, RESOLVE).state.phase).toBe('match-over');
    const short = craft({ mode: 'draw2', line: [['t66', 6, 6]], hands: [['t61'], ['t55', 't44', 't20']], turn: 0, opener: 1, scores: [79, 0] });
    const r = ok(ok(short, play(0, 't61', 'tail')).state, RESOLVE).state;
    expect(r.phase).toBe('hand-resolved');
    expect(r.scores).toEqual([99, 0]);
  });

  it('partnership respects a 100 target when chosen', () => {
    const s = craft({ mode: 'partnership4', targetScore: 100, scores: [90, 0], ...PARTNER_OUT, turn: 2, opener: 1 });
    const r = ok(ok(s, play(2, 't65', 'head')).state, RESOLVE).state;
    expect(r).toMatchObject({ phase: 'match-over', winnerTeam: 0, scores: [125, 0] });
  });
});

describe('hidden information', () => {
  it('seat views never contain other hands or the stock; drawn tiles are redacted for others', () => {
    const r = createMatch(config('draw2'), 'secret-check');
    if (!r.ok) throw new Error('create');
    const s = r.state;
    for (const viewer of [0, 1] as SeatIndex[]) {
      const json = JSON.stringify(seatView(s, viewer));
      const hidden = [...s.hand.hands[1 - viewer]!, ...s.hand.stock];
      for (const id of hidden) expect(json).not.toContain(`"${id}"`);
      for (const id of s.hand.hands[viewer]!) expect(json).toContain(`"${id}"`);
    }
    const opener = s.hand.opener;
    expect(seatView(s, opener).requirement).toEqual(s.hand.requirement);
    expect(seatView(s, (1 - opener) as SeatIndex).requirement).toEqual({ kind: 'hidden-tile' });
    expect(redactEventsForSeat(r.events, (1 - opener) as SeatIndex)[0]).toMatchObject({ requirement: { kind: 'hidden-tile' } });
    const ev: GameEvent[] = [{ type: 'tile-drawn', seat: 0, tile: 't21', playable: false, stockCount: 3, handSize: 8 }];
    expect(redactEventsForSeat(ev, 1)[0]).toMatchObject({ tile: null, playable: null });
    expect(redactEventsForSeat(ev, null)[0]).toMatchObject({ tile: null });
    expect(redactEventsForSeat(ev, 0)[0]).toMatchObject({ tile: 't21' });
  });

  it('views report legal moves only to the seat on turn', () => {
    const r = createMatch(config('partnership4'), 'view-moves');
    if (!r.ok) throw new Error('create');
    const turn = r.state.hand.turn;
    expect(seatView(r.state, turn).legalMoves.map((m) => m.tile)).toEqual(['t66']);
    expect(seatView(r.state, ((turn + 1) % 4) as SeatIndex).legalMoves).toEqual([]);
  });
});

describe('rng isolation', () => {
  it('createMatch accepts an RngState seed and continues the contract', () => {
    const a = createMatch(config('block2'), seedRng('x'));
    const b = createMatch(config('block2'), 'x');
    expect(a.ok && b.ok && a.state.hand.hands).toEqual(b.ok && b.state.hand.hands);
  });
});
