/**
 * Seeded full-match simulations for every mode with an INDEPENDENT oracle:
 * scoring and next-opener rules are re-derived here straight from
 * docs/RULES.md (not from the presets), then compared to the engine.
 * Every failure message carries the mode, config and seeds needed to replay.
 */
import { describe, expect, it } from 'vitest';
import { createMatchConfig, type MatchConfig } from './config';
import { checkInvariants } from './invariants';
import { applyCommand, createMatch } from './match';
import { seedRng, type RngState } from './rng';
import { restoreMatch, serializeMatch } from './serialize';
import { randomCommand, simulateMatch, SimulationError } from './simulate';
import type { HandResult, MatchState } from './state';
import type { ModeId, SeatIndex, TileId } from './types';

const SEEDS_PER_CONFIG = Number(process.env.SIM_SEEDS ?? 120);
const MAX_COMMANDS = 20_000;
const MAX_HANDS = 400;

const pips = (id: TileId) => Number(id[1]) + Number(id[2]);
const total = (h: readonly TileId[]) => h.reduce((a, t) => a + pips(t), 0);

function strongest(hands: readonly (readonly TileId[])[]): { seat: number; tile: TileId } {
  let best: { seat: number; tile: TileId; key: number[] } | null = null;
  hands.forEach((h, seat) =>
    h.forEach((tile) => {
      const hi = Number(tile[1]);
      const lo = Number(tile[2]);
      const key = hi === lo ? [1, hi, 0] : [0, hi + lo, hi];
      if (!best || key[0]! > best.key[0]! || (key[0] === best.key[0] && (key[1]! > best.key[1]! || (key[1] === best.key[1] && key[2]! > best.key[2]!))))
        best = { seat, tile, key };
    }),
  );
  return best!;
}

/** Oracle: expected { winnerTeam, points } for a finished hand (RULES.md). */
function oracleScore(mode: ModeId, r: HandResult): { winnerTeam: number | null; points: number } {
  const t = r.finalHands.map(total);
  if (mode === 'partnership4') {
    const teams = [t[0]! + t[2]!, t[1]! + t[3]!];
    const all = teams[0]! + teams[1]!;
    if (r.end.kind === 'out') return { winnerTeam: r.end.seat % 2, points: all };
    if (teams[0] === teams[1]) return { winnerTeam: null, points: 0 };
    return { winnerTeam: teams[0]! < teams[1]! ? 0 : 1, points: all };
  }
  const [a, b] = [t[0]!, t[1]!];
  if (r.end.kind === 'out') {
    const w = r.end.seat;
    return { winnerTeam: w, points: mode === 'draw2' ? a + b : w === 0 ? b : a };
  }
  if (a === b) return { winnerTeam: null, points: 0 };
  const w = a < b ? 0 : 1;
  return { winnerTeam: w, points: mode === 'draw2' ? a + b : Math.abs(a - b) };
}

/** Oracle: expected opener and required tile for a new hand (RULES.md). */
function oracleOpener(
  mode: ModeId,
  hands: readonly (readonly TileId[])[],
  prev: { result: HandResult; opener: number } | null,
): { seat: number; tile: TileId | null } {
  const sixSix = () => ({ seat: hands.findIndex((h) => h.includes('t66')), tile: 't66' as TileId });
  if (!prev) return mode === 'partnership4' ? sixSix() : strongest(hands);
  const r = prev.result;
  if (mode === 'block2') return { seat: (prev.opener + 1) % 2, tile: null };
  if (mode === 'draw2') {
    if (r.winnerTeam === null) return strongest(hands);
    return { seat: r.winnerTeam, tile: null };
  }
  if (r.end.kind === 'out') return { seat: r.end.seat, tile: null };
  if (r.winnerTeam === null) return sixSix();
  const t = r.finalHands.map(total);
  const order = [0, 1, 2, 3].map((i) => (prev.opener + i) % 4).filter((s) => s % 2 === r.winnerTeam);
  const min = Math.min(...order.map((s) => t[s]!));
  return { seat: order.find((s) => t[s] === min)!, tile: null };
}

interface Run {
  state: MatchState;
  commands: number;
}

/** Drive one match with the random policy, checking the oracle at every hand boundary. */
function runChecked(config: MatchConfig, dealSeed: string, policySeed: string): Run {
  const tag = `[mode=${config.mode} humans=${config.seats.filter((s) => s.controller.kind === 'human').map((s) => s.seat)} target=${config.targetScore} dealSeed=${dealSeed} policySeed=${policySeed}]`;
  const created = createMatch(config, dealSeed);
  if (!created.ok) throw new Error(`${tag} create failed`);
  let state = created.state;
  let policy: RngState = seedRng(policySeed);
  let commands = 0;
  const check = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`${tag} ${msg}`);
  };
  const checkOpener = (prev: { result: HandResult; opener: number } | null) => {
    const exp = oracleOpener(config.mode, state.hand.hands, prev);
    check(state.hand.opener === exp.seat, `hand ${state.hand.number}: opener ${state.hand.opener}, expected ${exp.seat}`);
    const req = state.hand.requirement;
    check(exp.tile === null ? req.kind === 'any' : req.kind === 'tile' && req.tile === exp.tile, `hand ${state.hand.number}: requirement ${JSON.stringify(req)}, expected ${exp.tile}`);
  };
  checkOpener(null);
  for (;;) {
    const pick = randomCommand(state, policy);
    policy = pick.policy;
    if (!pick.command) break;
    const before = state;
    const r = applyCommand(state, pick.command);
    if (!r.ok) throw new Error(`${tag} rejected legal command ${JSON.stringify(pick.command)}: ${r.error.code}`);
    state = r.state;
    commands++;
    const problems = checkInvariants(state);
    check(problems.length === 0, `invariants after ${JSON.stringify(pick.command)}: ${problems.join('; ')}`);
    if (pick.command.type === 'draw') check(state.phase === 'playing', 'a draw ended the hand');
    if (pick.command.type === 'resolve-hand') {
      const res = state.hand.result!;
      const exp = oracleScore(config.mode, res);
      check(res.winnerTeam === exp.winnerTeam && res.points === exp.points, `hand ${res.handNumber} scored ${res.winnerTeam}/${res.points}, oracle ${exp.winnerTeam}/${exp.points}`);
      check(state.history.length === before.history.length + 1, 'history did not grow by exactly one');
      check(JSON.stringify(res.finalHands) === JSON.stringify(before.hand.hands), 'final hands differ from hands at hand end');
    }
    if (pick.command.type === 'start-next-hand') checkOpener({ result: before.hand.result!, opener: before.hand.opener });
    check(commands <= MAX_COMMANDS, `exceeded ${MAX_COMMANDS} commands`);
    check(state.hand.number <= MAX_HANDS, `exceeded ${MAX_HANDS} hands`);
  }
  check(state.phase === 'match-over', `ended in phase ${state.phase}`);
  check(state.scores[state.winnerTeam!]! >= config.targetScore, 'winner below target');
  check(state.scores.filter((s) => s >= config.targetScore).length === 1, 'more than one side at target');
  const sum = state.history.reduce((a, h) => a + h.points, 0);
  check(sum === state.scores.reduce((a, b) => a + b, 0), 'scores do not equal the sum of hand points');
  return { state, commands };
}

const CONFIGS: { mode: ModeId; humanSeats: SeatIndex[]; targetScore?: 100 | 200 }[] = [
  { mode: 'draw2', humanSeats: [0] },
  { mode: 'draw2', humanSeats: [0, 1], targetScore: 200 },
  { mode: 'block2', humanSeats: [0] },
  { mode: 'block2', humanSeats: [1, 0], targetScore: 200 },
  { mode: 'partnership4', humanSeats: [0] },
  { mode: 'partnership4', humanSeats: [0, 2], targetScore: 100 },
  { mode: 'partnership4', humanSeats: [0, 1] },
];

describe('seeded full-match simulations', () => {
  for (const c of CONFIGS) {
    const cfg = createMatchConfig(c);
    if (!cfg.ok) throw new Error('config');
    it(`${c.mode} humans=${c.humanSeats.join('+')} target=${cfg.config.targetScore}: ${SEEDS_PER_CONFIG} matches finish legally and match the oracle`, () => {
      let hands = 0;
      let outs = 0;
      let blocks = 0;
      let ties = 0;
      for (let i = 0; i < SEEDS_PER_CONFIG; i++) {
        const { state } = runChecked(cfg.config, `${c.mode}-${c.humanSeats.join('')}-${i}`, `policy-${i}`);
        hands += state.history.length;
        for (const h of state.history) {
          if (h.end.kind === 'out') outs++;
          else if (h.winnerTeam === null) ties++;
          else blocks++;
        }
      }
      // Coverage sanity: the simulated population exercised every outcome kind.
      expect(outs).toBeGreaterThan(0);
      expect(blocks).toBeGreaterThan(0);
      expect(hands).toBeGreaterThanOrEqual(SEEDS_PER_CONFIG);
      if (c.mode !== 'draw2') expect(ties).toBeGreaterThan(0);
    });
  }

  it('the packaged simulator also completes every mode and reports seeds on failure', () => {
    for (const mode of ['draw2', 'block2', 'partnership4'] as const) {
      const cfg = createMatchConfig({ mode });
      if (!cfg.ok) throw new Error('config');
      const r = simulateMatch({ config: cfg.config, dealSeed: `pkg-${mode}`, policySeed: 3 });
      expect(r.state.phase).toBe('match-over');
      expect(r.commands).toBeLessThan(MAX_COMMANDS);
    }
    const cfg = createMatchConfig({ mode: 'block2' });
    if (!cfg.ok) throw new Error('config');
    try {
      simulateMatch({ config: cfg.config, dealSeed: 'tiny-cap', policySeed: 9, maxCommands: 5 });
      throw new Error('should have hit the cap');
    } catch (e) {
      expect(e).toBeInstanceOf(SimulationError);
      expect((e as Error).message).toContain('dealSeed="tiny-cap"');
      expect((e as Error).message).toContain('policySeed=9');
    }
  });
});

describe('determinism, purity and save/restore', () => {
  const cfg = (() => {
    const c = createMatchConfig({ mode: 'partnership4', humanSeats: [0, 2] });
    if (!c.ok) throw new Error('config');
    return c.config;
  })();

  it('the same seeds replay to an identical match', () => {
    const a = simulateMatch({ config: cfg, dealSeed: 'replay', policySeed: 'p' });
    const b = simulateMatch({ config: cfg, dealSeed: 'replay', policySeed: 'p' });
    expect(serializeMatch(a.state)).toBe(serializeMatch(b.state));
  });

  it('save → JSON → restore mid-hand continues identically to an uninterrupted run', () => {
    for (const mode of ['draw2', 'block2', 'partnership4'] as const) {
      const c = createMatchConfig({ mode });
      if (!c.ok) throw new Error('config');
      const full = simulateMatch({ config: c.config, dealSeed: `save-${mode}`, policySeed: 'q' });
      for (const at of [1, 17, 63]) {
        const half = simulateMatch({ config: c.config, dealSeed: `save-${mode}`, policySeed: 'q', stopAfter: at });
        const json = serializeMatch(half.state);
        const policyJson = JSON.stringify(half.policy);
        const restored = restoreMatch(json);
        if (!restored.ok) throw new Error(restored.errors.join('; '));
        expect(restored.state).toEqual(half.state);
        const rest = simulateMatch({ config: c.config, dealSeed: `save-${mode}`, policySeed: 'q', from: { state: restored.state, policy: JSON.parse(policyJson) } });
        expect(serializeMatch(rest.state)).toBe(serializeMatch(full.state));
      }
    }
  });

  it('restore rejects tampered or malformed saves', () => {
    const s = simulateMatch({ config: cfg, dealSeed: 'tamper', policySeed: 1, stopAfter: 9 }).state;
    const dupTile = JSON.parse(serializeMatch(s));
    dupTile.hand.hands[0][0] = dupTile.hand.hands[1][0];
    expect(restoreMatch(dupTile).ok).toBe(false);
    const badScore = JSON.parse(serializeMatch(s));
    badScore.scores = [-3, 0];
    expect(restoreMatch(badScore).ok).toBe(false);
    const badPreset = JSON.parse(serializeMatch(s));
    badPreset.config.rules.presetVersion = 99;
    expect(restoreMatch(badPreset).ok).toBe(false);
    expect(restoreMatch('{not json').ok).toBe(false);
    expect(restoreMatch(42).ok).toBe(false);
  });

  it('commands never mutate state (deep-frozen inputs survive a full match)', () => {
    const deepFreeze = <T>(o: T): T => {
      if (o && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o);
        for (const v of Object.values(o)) deepFreeze(v);
      }
      return o;
    };
    const created = createMatch(cfg, 'frozen');
    if (!created.ok) throw new Error('create');
    let state = deepFreeze(created.state);
    let policy = seedRng('frozen-policy');
    for (let i = 0; i < 5000; i++) {
      const pick = randomCommand(state, policy);
      policy = pick.policy;
      if (!pick.command) break;
      const r = applyCommand(state, pick.command);
      expect(r.ok).toBe(true);
      state = deepFreeze(r.state);
    }
    expect(state.phase).toBe('match-over');
  });
});
