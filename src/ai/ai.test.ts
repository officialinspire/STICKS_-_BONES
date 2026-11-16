import { describe, expect, it } from 'vitest';
import { createMatchConfig } from '../engine/config';
import { createMatch, rulesOf } from '../engine/match';
import { seedRng, shuffle } from '../engine/rng';
import type { MatchState } from '../engine/state';
import { chain, complement, craft } from '../engine/testing/craft';
import type { ModeId, SeatIndex, TileId } from '../engine/types';
import { seatView } from '../engine/view';
import { allowedHolders, inferKnowledge } from './knowledge';
import { buildObservation, OBSERVATION_KEYS, type AiObservation } from './observation';
import { decide, POLICIES } from './policy';
import { sampleWorld } from './sampler';
import { driveMatch, mirroredDuel, type DecisionPoint } from './testing';
import { DIFFICULTIES, type Difficulty } from './types';

const MODES: ModeId[] = ['draw2', 'block2', 'partnership4'];

/** Decision points (with ≥1 legal move) collected from seeded mixed-difficulty games. */
function corpus(mode: ModeId, games: number): DecisionPoint[] {
  const out: DecisionPoint[] = [];
  for (let g = 0; g < games; g++)
    driveMatch({ mode, dealSeed: `corpus-${mode}-${g}`, aiSeed: `corpus-ai-${g}`, sides: g % 2 ? ['normal', 'easy'] : ['easy', 'normal'], maxHands: 3, onDecision: (p) => out.push(p) });
  return out;
}
const CORPUS = Object.fromEntries(MODES.map((m) => [m, corpus(m, 6)])) as Record<ModeId, DecisionPoint[]>;

/** Same public situation, different hidden reality: shuffle every tile the observer can't see. */
function rehide(state: MatchState, observer: SeatIndex, seed: string): MatchState {
  const h = state.hand;
  const hidden = [...h.hands.flatMap((x, s) => (s === observer ? [] : x)), ...h.stock];
  const mixed = shuffle(hidden, seedRng(seed)).items;
  let i = 0;
  const hands = h.hands.map((x, s) => (s === observer ? [...x] : mixed.slice(i, (i += x.length))));
  const stock = mixed.slice(i);
  return { ...state, hand: { ...h, hands, stock } };
}

describe('observation is sanitized', () => {
  it('has exactly the whitelisted keys and never contains hidden tiles, seeds or RNG state', () => {
    for (const mode of MODES)
      for (const p of CORPUS[mode]) {
        expect(Object.keys(p.obs).sort()).toEqual([...OBSERVATION_KEYS].sort());
        const json = JSON.stringify(p.obs);
        const hidden = [...p.state.hand.hands.flatMap((h, s) => (s === p.seat ? [] : h)), ...p.state.hand.stock];
        for (const t of hidden) expect(json, `${mode} leaks ${t}`).not.toContain(`"${t}"`);
        expect(json).not.toContain(JSON.stringify(p.state.rng.s));
        expect(JSON.stringify({ ...p.obs, rules: null })).not.toMatch(/"(seed|rng|stock|hands|boneyard)"/);
        expect(Object.isFrozen(p.obs) && Object.isFrozen(p.obs.hand) && Object.isFrozen(p.obs.history)).toBe(true);
      }
  });

  it('is only built for the seat on turn', () => {
    const p = CORPUS.draw2[0]!;
    const other = ((p.seat + 1) % 2) as SeatIndex;
    expect(() => buildObservation(seatView(p.state, other), rulesOf(p.state))).toThrow();
  });
});

describe('policies cannot use hidden state', () => {
  it('reshuffling every hidden tile changes neither the observation nor any difficulty’s decision', () => {
    let compared = 0;
    for (const mode of MODES)
      for (const p of CORPUS[mode].filter((_, i) => i % 3 === 0)) {
        const alt = rehide(p.state, p.seat, `rehide-${compared}`);
        const altObs = buildObservation(seatView(alt, p.seat), rulesOf(alt));
        expect(altObs).toEqual(p.obs);
        for (const d of DIFFICULTIES) expect(decide(d, altObs, p.rng)).toEqual(decide(d, p.obs, p.rng));
        compared++;
      }
    expect(compared).toBeGreaterThan(60);
  });
});

describe('public inference (used by Normal and Hard)', () => {
  it('is sound: the real hidden hands always satisfy the inferred voids and exclusions', () => {
    let checked = 0;
    for (const mode of MODES)
      for (const p of CORPUS[mode]) {
        const k = inferKnowledge(p.obs);
        expect([...k.unknown].sort()).toEqual([...p.state.hand.hands.flatMap((h, s) => (s === p.seat ? [] : h)), ...p.state.hand.stock].sort());
        for (let s = 0; s < p.obs.seatCount; s++) {
          if (s === p.seat) continue;
          for (const t of p.state.hand.hands[s]!) expect(allowedHolders(k, t), `${mode} seat ${s} really holds ${t}`).toContain(s);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(200);
  });

  it('sampled worlds respect sizes, voids and exclusions, and partition exactly the unknown tiles', () => {
    let relaxed = 0;
    let worlds = 0;
    let withVoids = 0;
    for (const mode of MODES)
      for (const p of CORPUS[mode].filter((_, i) => i % 2 === 0)) {
        const k = inferKnowledge(p.obs);
        if (Object.keys(k.voids).length) withVoids++;
        let rng = seedRng(`sample-${worlds}`);
        for (let w = 0; w < 5; w++) {
          const s = sampleWorld(k, rng);
          rng = s.rng;
          worlds++;
          if (s.relaxed) {
            relaxed++;
            continue;
          }
          const all: TileId[] = [];
          for (const h of k.holders) {
            const got = s.holdings.get(h.id)!;
            expect(got).toHaveLength(h.size);
            all.push(...got);
            if (h.id !== 'stock') for (const t of got) expect(allowedHolders(k, t)).toContain(h.id);
          }
          expect([...all].sort()).toEqual([...k.unknown].sort());
        }
      }
    expect(withVoids).toBeGreaterThan(5);
    expect(relaxed / worlds).toBeLessThan(0.02);
  });

  it('a pass proves a void; the highest-double opening excludes stronger tiles from hands that never drew', () => {
    const p = CORPUS.block2.find((x) => x.obs.history.some((a) => a.kind === 'pass'))!;
    const k = inferKnowledge(p.obs);
    const pass = p.obs.history.find((a) => a.kind === 'pass')!;
    if (pass.kind === 'pass' && pass.endsAtPass) expect(k.voids[pass.seat]).toEqual(expect.arrayContaining([pass.endsAtPass.head, pass.endsAtPass.tail]));
    const opening = CORPUS.block2.find((x) => x.obs.history.length > 0 && x.seat !== x.obs.opener && Object.keys(inferKnowledge(x.obs).excluded).length);
    expect(opening).toBeTruthy();
  });
});

describe('determinism and RNG independence', () => {
  it('same observation + same AI RNG ⇒ same decision, for every difficulty', () => {
    for (const p of CORPUS.partnership4.slice(0, 30)) for (const d of DIFFICULTIES) expect(decide(d, p.obs, p.rng)).toEqual(decide(d, p.obs, p.rng));
  });

  it('AI seeds change AI choices but never the deal', () => {
    const a = driveMatch({ mode: 'draw2', dealSeed: 'same-deal', aiSeed: 'one', sides: ['easy', 'easy'], maxHands: 1 });
    const b = driveMatch({ mode: 'draw2', dealSeed: 'same-deal', aiSeed: 'two', sides: ['easy', 'easy'], maxHands: 1 });
    const cfg = createMatchConfig({ mode: 'draw2' });
    if (!cfg.ok) throw new Error('cfg');
    const dealt = createMatch(cfg.config, 'same-deal');
    if (!dealt.ok) throw new Error('create');
    const firstHand = (s: MatchState) => s.history[0]!.handNumber;
    expect(firstHand(a.state)).toBe(firstHand(b.state));
    expect(a.state.history[0]!.finalHands).not.toEqual(b.state.history[0]!.finalHands);
    // Both matches started from the identical deal.
    for (const r of [a, b]) expect(r.state.history[0]!.opener).toBe(dealt.state.hand.opener);
  });

  it('decisions consume only the AI’s own stream', () => {
    const p = CORPUS.draw2.find((x) => x.obs.legal.length > 2)!;
    const d = decide('easy', p.obs, p.rng);
    expect(d.rng).not.toEqual(p.rng);
    expect(d.rng.contract).toBe(p.rng.contract);
  });
});

describe('legality across seeded matches', () => {
  it('every difficulty pairing completes matches in every mode with only legal commands', () => {
    const pairs: [Difficulty, Difficulty][] = [
      ['easy', 'normal'],
      ['normal', 'hard'],
      ['hard', 'easy'],
    ];
    for (const mode of MODES)
      for (const [i, sides] of pairs.entries()) {
        const r = driveMatch({ mode, dealSeed: `legal-${mode}-${i}`, aiSeed: `legal-ai-${i}`, sides });
        expect(r.state.phase, `${mode} ${sides}`).toBe('match-over');
        expect(r.hands).toBeLessThan(200);
      }
  }, 60000);
});

describe('difficulties behave differently', () => {
  it('pick different moves on a meaningful share of real positions', () => {
    const points = MODES.flatMap((m) => CORPUS[m]).filter((p) => p.obs.legal.length >= 3);
    const pick = (d: Difficulty, p: DecisionPoint) => JSON.stringify(decide(d, p.obs, p.rng).action);
    const differ = (a: Difficulty, b: Difficulty) => points.filter((p) => pick(a, p) !== pick(b, p)).length / points.length;
    expect(points.length).toBeGreaterThan(50);
    expect(differ('easy', 'normal')).toBeGreaterThan(0.25);
    expect(differ('normal', 'hard')).toBeGreaterThan(0.1);
  });

  it('report honest methods', () => {
    const p = CORPUS.partnership4.find((x) => x.obs.legal.length >= 3)!;
    expect(decide('easy', p.obs, p.rng).method).toMatch(/^easy: /);
    expect(decide('normal', p.obs, p.rng).method).toMatch(/heuristic/);
    const hard = decide('hard', p.obs, p.rng);
    expect(hard.method).toMatch(/Monte Carlo over \d+ sampled worlds/);
    expect(hard.stats!.worlds).toBeGreaterThan(0);
  });

  it('get stronger with difficulty (mirrored seats, fixed seeds)', () => {
    for (const mode of MODES) {
      expect(mirroredDuel(mode, 'normal', 'easy', 6, 4, `duel-ne-${mode}`), `${mode} normal vs easy`).toBeGreaterThan(0);
      expect(mirroredDuel(mode, 'hard', 'normal', 6, 4, `duel-hn-${mode}`), `${mode} hard vs normal`).toBeGreaterThan(0);
    }
  }, 120000);

  it('Hard stays cheap enough for a worker (and even the inline fallback)', () => {
    let worst = 0;
    for (const p of CORPUS.partnership4.filter((x) => x.obs.legal.length >= 2).slice(0, 25)) {
      const t0 = performance.now();
      POLICIES.hard(p.obs, p.rng);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(500);
  });
});

describe('Normal uses public evidence; partnership-aware', () => {
  /** A 2-player Block position: ends 5…2, I hold 5|3, 5|4 and 6|6. */
  function blockPosition(): AiObservation {
    const hands = [['t53', 't54', 't66'], ['t10', 't11', 't21', 't31', 't32', 't33', 't61']];
    const line: [string, number, number][] = [
      ['t50', 5, 0],
      ['t40', 0, 4],
      ['t42', 4, 2],
      ['t22', 2, 2],
    ];
    const s = craft({ mode: 'block2', line, hands, turn: 0, opener: 0 });
    return buildObservation(seatView(s, 0), rulesOf(s));
  }

  it('leaves a pip the opponent has publicly passed on', () => {
    const base = blockPosition();
    expect(base.legal.map((m) => m.tile).sort()).toEqual(['t53', 't54']);
    const plain = decide('normal', base, seedRng(0)).action;
    expect(plain).toMatchObject({ tile: 't54' }); // heavier, no evidence
    const withPass: AiObservation = { ...base, history: [...base.history, { kind: 'pass', seat: 1, endsAtPass: { head: 3, tail: 1 } }] };
    expect(decide('normal', withPass, seedRng(0)).action).toMatchObject({ tile: 't53' }); // opponent can't follow a 3
  });

  it('in Partnership, treats a partner’s void and an opponent’s void oppositely', () => {
    const hands = [['t53', 't54', 't66'], ['t22', 't60', 't61', 't65'], ['t21', 't32', 't42', 't63'], ['t10', 't30', 't50', 't52']];
    const s = craft({ mode: 'partnership4', line: chain(complement(...hands), 5), hands, turn: 0, opener: 0 });
    const base = buildObservation(seatView(s, 0), rulesOf(s));
    expect(base.openEnds).toEqual({ head: 5, tail: 1 });
    expect(base.legal.map((m) => m.tile).sort()).toEqual(['t53', 't54']);
    const pass = (seat: SeatIndex): AiObservation => ({ ...base, history: [...base.history, { kind: 'pass', seat, endsAtPass: { head: 4, tail: 4 } }] });
    expect(decide('normal', base, seedRng(0)).action).toMatchObject({ tile: 't54' }); // heavier by default
    expect(decide('normal', pass(2), seedRng(0)).action).toMatchObject({ tile: 't53' }); // partner can't follow a 4
    expect(decide('normal', pass(1), seedRng(0)).action).toMatchObject({ tile: 't54' }); // opponent can't follow a 4: good for us
  });
});
