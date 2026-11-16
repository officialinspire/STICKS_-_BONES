import { describe, expect, it } from 'vitest';
import { createMatchConfig } from '../engine/config';
import { applyCommand, createMatch, rulesOf } from '../engine/match';
import { seedRng } from '../engine/rng';
import { randomCommand } from '../engine/simulate';
import type { HandResult } from '../engine/state';
import type { ModeId } from '../engine/types';
import { COUSINS_HOUSE_RULES_V1 } from '../engine/rules/presets';
import { explainResult, handLine } from './explain';

function results(mode: ModeId, seed: string, max = 60): HandResult[] {
  const cfg = createMatchConfig({ mode });
  if (!cfg.ok) throw new Error('cfg');
  const c = createMatch(cfg.config, seed);
  if (!c.ok) throw new Error('create');
  let s = c.state;
  let p = seedRng(seed);
  for (let i = 0; i < 20000 && s.history.length < max && s.phase !== 'match-over'; i++) {
    const r = randomCommand(s, p);
    p = r.policy;
    if (!r.command) break;
    const a = applyCommand(s, r.command);
    if (!a.ok) throw new Error(a.error.code);
    s = a.state;
  }
  return [...s.history];
}

const name = (s: number) => ['You', 'Cousin', 'Luz', 'Tío Rafa'][s]!;
const team = (t: number) => ['You & Luz', 'Cousin & Tío Rafa'][t]!;

describe('results arithmetic', () => {
  it('always lands on exactly the engine’s points, for every mode and outcome', () => {
    let checked = 0;
    const kinds = new Set<string>();
    for (const mode of ['draw2', 'block2', 'partnership4'] as const)
      for (let g = 0; g < 8; g++)
        for (const r of results(mode, `explain-${mode}-${g}`)) {
          const rules = COUSINS_HOUSE_RULES_V1.modes[mode];
          const e = explainResult(r, rules, name, team);
          expect(e.value, `${mode} hand ${r.handNumber}`).toBe(r.points);
          expect(e.points.endsWith(`= ${r.points}`)).toBe(true);
          // Each seat line sums to the engine's seat total.
          e.hands.forEach((line, s) => expect(line.endsWith(`= ${r.seatTotals[s]}`)).toBe(true));
          kinds.add(`${mode}:${r.end.kind}:${r.winnerTeam === null ? 'tie' : 'win'}`);
          checked++;
        }
    expect(checked).toBeGreaterThan(150);
    expect([...kinds]).toEqual(expect.arrayContaining(['draw2:out:win', 'block2:blocked:win', 'partnership4:out:win']));
  });

  it('spells out each preset’s rule in words', () => {
    const base = { handNumber: 1, opener: 0 as const, scoresAfter: [0, 0] };
    const draw = explainResult({ ...base, end: { kind: 'blocked' }, finalHands: [['t11', 't20'], ['t64', 't21']], seatTotals: [4, 13], teamTotals: [4, 13], winnerTeam: 0, winnerSeat: 0, points: 17 }, COUSINS_HOUSE_RULES_V1.modes.draw2, name, team);
    expect(draw.decision).toBe('Blocked: You 4 vs Cousin 13 — fewer pips wins.');
    expect(draw.points).toBe('Every pip left: 4 + 13 = 17');
    const block = explainResult({ ...base, end: { kind: 'blocked' }, finalHands: [['t11', 't20'], ['t64', 't21']], seatTotals: [4, 13], teamTotals: [4, 13], winnerTeam: 0, winnerSeat: 0, points: 9 }, COUSINS_HOUSE_RULES_V1.modes.block2, name, team);
    expect(block.points).toBe('Opponent’s pips minus own: 13 − 4 = 9');
    const tie = explainResult({ ...base, end: { kind: 'blocked' }, finalHands: [['t66'], ['t65', 't10']], seatTotals: [12, 12], teamTotals: [12, 12], winnerTeam: null, winnerSeat: null, points: 0 }, COUSINS_HOUSE_RULES_V1.modes.draw2, name, team);
    expect(tie.decision).toBe('Blocked and tied: You 12 vs Cousin 12.');
    expect(tie.value).toBe(0);
  });

  it('shows zero-pip remnants and empty hands plainly', () => {
    expect(handLine('Cousin', ['t00'])).toBe('Cousin: 0|0 (0) = 0');
    expect(handLine('You', [])).toBe('You: no tiles left = 0');
    expect(handLine('Luz', ['t64', 't00'])).toBe('Luz: 6|4 (10) + 0|0 (0) = 10');
    void rulesOf;
  });
});
