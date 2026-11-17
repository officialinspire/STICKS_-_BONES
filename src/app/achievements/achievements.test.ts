import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../engine/events';
import type { HandResult } from '../../engine/state';
import type { ModeId, Pip, SeatIndex, TileId } from '../../engine/types';
import { emptyStats, recordCompleted } from '../stats';
import type { KeyValueStore } from '../storage';
import { ACHIEVEMENTS, CATEGORIES, progressOf } from './catalog';
import { HandObserver, localMatchFacts, MatchObserver, type Facts } from './facts';
import { ACH_SPEC, applyFacts, applyRetro, emptyProgress, loadProgress, retroCounts, saveProgress, storyAssisted, storyChapter, type AchProgress } from './progress';

// ---- a tiny event DSL (public events only, as the controller forwards them) ---------------
const start = (sizes: number[], stock = 14): GameEvent =>
  ({ type: 'hand-started', handNumber: 1, opener: 0, openingRule: 'highest-double', requirement: { kind: 'any' }, handSizes: sizes, stockCount: stock, stockKind: 'boneyard' }) as unknown as GameEvent;
const play = (seat: number, tile: TileId, head: number, tail: number, handSize: number, playIndex = 1): GameEvent =>
  ({ type: 'tile-played', seat, tile, end: 'tail', placed: { tile, headPip: head as Pip, tailPip: tail as Pip, crosswise: tile[1] === tile[2], seat, playIndex }, openEnds: { head, tail }, handSize }) as unknown as GameEvent;
const draw = (seat: number, stock: number, handSize: number): GameEvent => ({ type: 'tile-drawn', seat, tile: null, playable: null, stockCount: stock, handSize }) as unknown as GameEvent;
const pass = (seat: number): GameEvent => ({ type: 'passed', seat, consecutivePasses: 1 }) as unknown as GameEvent;
function result(o: { win: boolean; out?: number | null; points?: number; seatTotals?: number[]; finalHands?: TileId[][]; seats?: number }): HandResult {
  const seats = o.seats ?? 2;
  return {
    handNumber: 1,
    opener: 0,
    end: o.out === null ? { kind: 'blocked' } : { kind: 'out', seat: (o.out ?? (o.win ? 0 : 1)) as SeatIndex },
    finalHands: o.finalHands ?? Array.from({ length: seats }, () => []),
    seatTotals: o.seatTotals ?? Array.from({ length: seats }, () => 0),
    teamTotals: [0, 0],
    winnerTeam: o.win ? 0 : 1,
    winnerSeat: o.win ? 0 : 1,
    points: o.points ?? 10,
    scoresAfter: [0, 0],
  } as unknown as HandResult;
}
const SEATS: Record<ModeId, number> = { draw2: 2, block2: 2, partnership4: 4 };

class H {
  p: AchProgress = emptyProgress();
  fresh = new Set<string>();
  #t = 1;
  #k = 0;
  facts(f: Facts, key?: string) {
    const r = applyFacts(this.p, f, this.#t++, key);
    this.p = r.progress;
    r.fresh.forEach((i) => this.fresh.add(i));
  }
  /** One hand from seat 0. `observed` primes the observer as a fresh deal (or pass a start event). */
  hand(mode: ModeId, events: GameEvent[], res?: HandResult, observed = true) {
    const seatCount = SEATS[mode];
    const teams = seatCount === 2 ? [[0], [1]] : [[0, 2], [1, 3]];
    const o = new HandObserver({ mode, me: 0, teams: teams as SeatIndex[][], seatCount });
    if (observed && !events.some((e) => e.type === 'hand-started')) o.prime(Array.from({ length: seatCount }, () => 7));
    for (const e of events) this.facts(o.feed([e]));
    if (res) this.facts(o.resolve(res), `hand:${this.#k++}`);
  }
  /** A plain hand won by going out with a 2|1 (no doubles, no draws, no passes). */
  win(mode: ModeId, points = 10, n = 1) {
    for (let i = 0; i < n; i++) this.hand(mode, [play(0, 't21', 2, 1, 0)], result({ win: true, points, seats: SEATS[mode] }));
  }
  match(mode: ModeId, o: { won: boolean; difficulty?: string; target?: number; scores?: number[]; history?: number[][]; observed?: boolean }) {
    const m = new MatchObserver(o.observed ?? true);
    for (const s of o.history ?? []) m.hand(s, 0);
    this.facts(m.won({ mode, difficulty: o.difficulty ?? 'normal', target: o.target ?? (mode === 'partnership4' ? 200 : 100), myTeam: 0, winnerTeam: o.won ? 0 : 1, scores: o.scores ?? [100, 30] }), `match:${this.#k++}`);
  }
  story(scene: string, outcome: 'win' | 'loss' | 'tie' | 'none', caseKey = 'case:1') {
    const r = storyChapter(this.p, scene as never, outcome, caseKey, this.#t++);
    this.p = r.progress;
    r.fresh.forEach((i) => this.fresh.add(i));
  }
  fullCase(outcome: (ch: number) => 'win' | 'loss' | 'tie', caseKey = 'case:1') {
    this.story('prologue', 'none', caseKey);
    for (let c = 1; c <= 7; c++) this.story(`chapter-${c}`, outcome(c), caseKey);
    this.story('epilogue', 'none', caseKey);
  }
  note(k: string) {
    this.facts({ [k]: 1 }, `note:${k}`);
  }
}

const FIX: Record<string, (h: H) => void> = {
  // learning
  'learn-first-tile': (h) => h.hand('block2', [play(0, 't21', 2, 1, 6)]),
  'learn-first-draw': (h) => h.hand('draw2', [draw(0, 13, 8)]),
  'learn-first-pass': (h) => h.hand('block2', [pass(0)]),
  'learn-both-ends': (h) => h.hand('block2', [play(1, 't53', 5, 3, 6, 0), play(0, 't53', 3, 5, 6)]),
  'learn-open': (h) => h.hand('block2', [play(0, 't21', 2, 1, 6, 0)]),
  'learn-double': (h) => h.hand('block2', [play(0, 't44', 4, 4, 6)]),
  'learn-hand': (h) => h.hand('block2', [], result({ win: false })),
  'learn-hand-won': (h) => h.win('block2'),
  'learn-match': (h) => h.match('draw2', { won: false }),
  'learn-match-won': (h) => h.match('draw2', { won: true }),
  // draw
  'draw-win-easy': (h) => h.match('draw2', { won: true, difficulty: 'easy' }),
  'draw-win-normal': (h) => h.match('draw2', { won: true, difficulty: 'normal' }),
  'draw-win-hard': (h) => h.match('draw2', { won: true, difficulty: 'hard' }),
  'draw-domino': (h) => h.win('draw2'),
  'draw-no-draw': (h) => h.hand('draw2', [start([7, 7]), play(0, 't21', 2, 1, 0)], result({ win: true })),
  'draw-deep-dig': (h) => h.hand('draw2', [start([7, 7]), draw(0, 13, 8), draw(0, 12, 9), draw(0, 11, 10), draw(0, 10, 11), draw(0, 9, 12), play(0, 't21', 2, 1, 0)], result({ win: true })),
  'draw-last-tile': (h) => h.hand('draw2', [draw(0, 0, 9)]),
  'draw-dry-win': (h) => h.hand('draw2', [start([7, 7], 1), draw(1, 0, 8), play(0, 't21', 2, 1, 0)], result({ win: true })),
  'draw-fifty': (h) => h.win('draw2', 50),
  'draw-tranque': (h) => h.hand('draw2', [play(0, 't21', 2, 1, 3)], result({ win: true, out: null })),
  'draw-200': (h) => h.match('draw2', { won: true, target: 200, scores: [200, 50] }),
  'draw-shutout': (h) => h.match('draw2', { won: true, scores: [100, 0] }),
  'draw-comeback': (h) => h.match('draw2', { won: true, history: [[0, 40], [120, 40]], scores: [120, 40] }),
  'draw-ten-hands': (h) => h.win('draw2', 10, 10),
  // block
  'block-win-easy': (h) => h.match('block2', { won: true, difficulty: 'easy' }),
  'block-win-normal': (h) => h.match('block2', { won: true, difficulty: 'normal' }),
  'block-win-hard': (h) => h.match('block2', { won: true, difficulty: 'hard' }),
  'block-domino': (h) => h.win('block2'),
  'block-tranque': (h) => h.hand('block2', [play(0, 't21', 2, 1, 3)], result({ win: true, out: null })),
  'block-no-pass': (h) => h.hand('block2', [start([7, 7]), play(0, 't21', 2, 1, 0)], result({ win: true })),
  'block-forced3': (h) => h.hand('block2', [start([7, 7]), play(0, 't21', 2, 1, 6), pass(1), play(0, 't11', 1, 1, 5), pass(1), play(0, 't10', 0, 1, 4), pass(1)]),
  'block-forty': (h) => h.win('block2', 40),
  'block-200': (h) => h.match('block2', { won: true, target: 200, scores: [210, 50] }),
  'block-shutout': (h) => h.match('block2', { won: true, scores: [100, 0] }),
  'block-comeback': (h) => h.match('block2', { won: true, history: [[0, 45], [110, 45]], scores: [110, 45] }),
  'block-ten-hands': (h) => h.win('block2', 10, 10),
  // partnership
  'p4-win-easy': (h) => h.match('partnership4', { won: true, difficulty: 'easy' }),
  'p4-win-normal': (h) => h.match('partnership4', { won: true, difficulty: 'normal' }),
  'p4-win-hard': (h) => h.match('partnership4', { won: true, difficulty: 'hard' }),
  'p4-self-out': (h) => h.win('partnership4'),
  'p4-partner-out': (h) => h.hand('partnership4', [play(2, 't21', 2, 1, 0)], result({ win: true, out: 2, seats: 4 })),
  'p4-tranque': (h) => h.hand('partnership4', [play(0, 't21', 2, 1, 3)], result({ win: true, out: null, seats: 4 })),
  'p4-pass-win': (h) => h.hand('partnership4', [start([7, 7, 7, 7]), pass(0), play(2, 't21', 2, 1, 0)], result({ win: true, out: 2, seats: 4 })),
  'p4-both-pass': (h) => h.hand('partnership4', [play(0, 't21', 2, 1, 6), pass(1), play(2, 't11', 1, 1, 6), pass(3)]),
  'p4-shutout': (h) => h.match('partnership4', { won: true, scores: [200, 0] }),
  'p4-comeback': (h) => h.match('partnership4', { won: true, history: [[0, 50], [210, 50]], scores: [210, 50] }),
  'p4-sixty': (h) => h.win('partnership4', 60),
  'p4-ten-hands': (h) => h.win('partnership4', 10, 10),
  'p4-local-partners': (h) => h.facts(localMatchFacts({ mode: 'partnership4', humansArePartners: true, humansWon: true }), 'local:1'),
  'p4-lead-66': (h) => h.hand('partnership4', [play(0, 't66', 6, 6, 6, 0)]),
  // tactical
  'tac-capicua': (h) => h.hand('block2', [start([7, 7]), play(1, 't52', 2, 5, 6, 0), play(0, 't52', 2, 5, 0)], result({ win: true })),
  'tac-out-double': (h) => h.hand('block2', [start([7, 7]), play(1, 't41', 4, 1, 6, 0), play(0, 't44', 4, 1, 0)], result({ win: true })),
  'tac-four-doubles': (h) => h.hand('block2', [start([7, 7]), play(0, 't11', 1, 1, 6, 0), play(0, 't22', 1, 1, 5), play(0, 't33', 1, 1, 4), play(0, 't44', 1, 1, 3)]),
  'tac-same-ends': (h) => h.hand('block2', [play(1, 't41', 4, 1, 6, 0), play(0, 't14', 4, 4, 6)]),
  'tac-self-block': (h) => h.hand('block2', [start([7, 7]), play(1, 't31', 3, 1, 3), play(0, 't13', 3, 3, 3)], result({ win: true, out: null })),
  'tac-low-tranque': (h) => h.hand('block2', [play(0, 't21', 2, 1, 2)], result({ win: true, out: null, seatTotals: [5, 20] })),
  'tac-fast-out': (h) => h.hand('block2', [start([1, 7]), play(0, 't21', 2, 1, 0, 0)], result({ win: true })),
  'tac-66-win': (h) => h.hand('block2', [start([7, 7]), play(0, 't66', 6, 6, 6, 0)], result({ win: true, out: null })),
  'tac-win-2pass': (h) => h.hand('block2', [start([7, 7]), pass(0), pass(0), play(0, 't21', 2, 1, 0)], result({ win: true })),
  'tac-forced5': (h) => h.hand('block2', [start([7, 7]), ...[0, 1, 2, 3, 4].flatMap((i) => [play(0, 't21', 2, 1, 6 - i), pass(1)])]),
  'tac-close-suit': (h) => h.hand('block2', [start([7, 7]), play(1, 't66', 6, 6, 6, 0), play(1, 't65', 5, 6, 5), play(1, 't64', 5, 4, 4), play(1, 't63', 3, 4, 3), play(1, 't62', 3, 2, 2), play(1, 't61', 1, 2, 1), play(0, 't60', 0, 2, 6)]),
  'tac-clean-win': (h) => h.hand('block2', [start([7, 7]), play(0, 't21', 2, 1, 0)], result({ win: true })),
  'tac-heavy': (h) => h.hand('block2', [start([7, 7]), play(0, 't66', 6, 6, 6, 0), play(0, 't65', 5, 6, 5)]),
  'tac-double-run': (h) => h.hand('block2', [play(0, 't44', 4, 4, 6), play(1, 't41', 1, 4, 6), play(0, 't11', 1, 4, 5)]),
  'tac-more-tiles': (h) => h.hand('block2', [play(0, 't21', 2, 1, 3)], result({ win: true, out: null, finalHands: [['t00', 't10', 't20'], ['t66', 't55']] })),
  'tac-close-call': (h) => h.hand('block2', [start([7, 7]), play(1, 't53', 5, 3, 1, 0), play(0, 't35', 5, 5, 0)], result({ win: true })),
  // milestones
  'ms-matches-5': (h) => [1, 2, 3, 4, 5].forEach(() => h.match('block2', { won: true })),
  'ms-matches-15': (h) => Array.from({ length: 15 }).forEach(() => h.match('draw2', { won: true })),
  'ms-finished-10': (h) => Array.from({ length: 10 }).forEach(() => h.match('draw2', { won: false })),
  'ms-hands-25': (h) => h.win('block2', 10, 25),
  'ms-hands-50': (h) => h.win('draw2', 10, 50),
  'ms-points-500': (h) => h.win('draw2', 100, 5),
  'ms-points-2000': (h) => h.win('partnership4', 100, 20),
  'ms-tiles-250': (h) => h.hand('block2', Array.from({ length: 250 }, () => play(1, 't21', 2, 1, 6)).map((e) => ({ ...e, seat: 0 }) as GameEvent)),
  'ms-dominoes-20': (h) => h.win('block2', 10, 20),
  'ms-tranques-10': (h) => Array.from({ length: 10 }).forEach(() => h.hand('block2', [play(0, 't21', 2, 1, 2)], result({ win: true, out: null }))),
  'ms-doubles-50': (h) => h.hand('block2', Array.from({ length: 50 }, () => play(0, 't33', 3, 3, 6))),
  'ms-all-modes': (h) => (['draw2', 'block2', 'partnership4'] as ModeId[]).forEach((m) => h.match(m, { won: true })),
  // story
  'story-prologue': (h) => h.story('prologue', 'none'),
  'story-ch1': (h) => h.story('chapter-1', 'loss'),
  'story-ch2': (h) => h.story('chapter-2', 'win'),
  'story-ch3': (h) => h.story('chapter-3', 'tie'),
  'story-ch4': (h) => h.story('chapter-4', 'win'),
  'story-ch5': (h) => h.story('chapter-5', 'loss'),
  'story-ch6': (h) => h.story('chapter-6', 'win'),
  'story-ch7': (h) => h.story('chapter-7', 'loss'),
  'story-epilogue': (h) => h.story('epilogue', 'none'),
  'story-wins-3': (h) => ['chapter-1', 'chapter-2', 'chapter-4'].forEach((c) => h.story(c, 'win')),
  'story-wins-7': (h) => h.fullCase(() => 'win'),
  'story-partner': (h) => h.story('chapter-3', 'win'),
  'story-loss': (h) => h.story('chapter-2', 'loss'),
  'story-no-skip': (h) => h.fullCase((c) => (c % 2 ? 'win' : 'loss')),
  // exploration
  'ex-rules': (h) => h.note('explore.rules'),
  'ex-stats': (h) => h.note('explore.stats'),
  'ex-settings': (h) => h.note('explore.settings'),
  'ex-sort': (h) => h.note('explore.sort'),
  'ex-zoom': (h) => h.note('explore.zoom'),
  'ex-transcript': (h) => h.note('explore.transcript'),
  'ex-local': (h) => h.facts(localMatchFacts({ mode: 'draw2', humansArePartners: false, humansWon: false }), 'local:1'),
  'ex-local-all': (h) => (['draw2', 'block2', 'partnership4'] as ModeId[]).forEach((m, i) => h.facts(localMatchFacts({ mode: m, humansArePartners: false, humansWon: true }), `local:${i}`)),
};

describe('achievement catalog', () => {
  it('has exactly 100 distinct achievements across the eight categories', () => {
    expect(ACHIEVEMENTS).toHaveLength(100);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(100);
    expect(new Set(ACHIEVEMENTS.map((a) => a.title)).size).toBe(100);
    // No two achievements share the same condition (no duplicate filler).
    expect(new Set(ACHIEVEMENTS.map((a) => `${a.counter ?? a.all!.join('+')}≥${a.target}`)).size).toBe(100);
    for (const c of CATEGORIES) expect(ACHIEVEMENTS.filter((a) => a.category === c.id).length, c.id).toBeGreaterThanOrEqual(8);
    for (const a of ACHIEVEMENTS) {
      expect(a.target, a.id).toBeGreaterThanOrEqual(1);
      expect(a.target, `${a.id}: no excessive grind`).toBeLessThanOrEqual(2000);
      expect(a.how.length, a.id).toBeGreaterThan(10);
      expect(Boolean(a.counter) !== Boolean(a.all), a.id).toBe(true);
    }
  });
  it('is documented: every id and its how-to-earn appear in docs/ACHIEVEMENTS.md', () => {
    const doc = readFileSync(new URL('../../../docs/ACHIEVEMENTS.md', import.meta.url), 'utf8');
    for (const a of ACHIEVEMENTS) expect(doc, a.id).toContain(`| \`${a.id}\` | ${a.title} | ${a.how} | ${a.target} |`);
  });
  it('has a deterministic fixture for every achievement', () => {
    expect(Object.keys(FIX).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });
});

describe('every achievement is obtainable from its fixture', () => {
  for (const a of ACHIEVEMENTS) {
    it(a.id, () => {
      const h = new H();
      FIX[a.id]!(h);
      expect([...h.fresh], `${a.id} (${a.how})`).toContain(a.id);
      expect(progressOf(a, h.p.counts)).toBe(a.target);
    });
  }
});

describe('scope, dedupe and privacy', () => {
  it('a hand resumed mid-way counts its result but no whole-hand tactics', () => {
    const h = new H();
    h.hand('block2', [play(0, 't21', 2, 1, 0)], result({ win: true }), false);
    expect(h.fresh.has('learn-hand-won')).toBe(true);
    for (const id of ['tac-clean-win', 'block-no-pass', 'tac-capicua', 'tac-fast-out']) expect(h.fresh.has(id), id).toBe(false);
  });
  it('the same hand, match, chapter or note key never applies twice (reload, re-sent events)', () => {
    let p = emptyProgress();
    for (let i = 0; i < 3; i++) p = applyFacts(p, { handsWon: 1, points: 40 }, 1, 'm1:h1').progress;
    expect(p.counts).toEqual({ handsWon: 1, points: 40 });
    for (let i = 0; i < 3; i++) p = storyChapter(p, 'chapter-1', 'win', 'case:9', 2).progress;
    expect(p.counts['story.chapter-1']).toBe(1);
    expect(p.cases['case:9']!.wins).toBe(1);
  });
  it('a case started before tracking, or with a skipped scene, never earns whole-case awards', () => {
    const h = new H();
    for (let c = 1; c <= 7; c++) h.story(`chapter-${c}`, 'win', 'case:old');
    h.story('epilogue', 'none', 'case:old');
    expect(h.fresh.has('story-wins-7')).toBe(false);
    expect(h.fresh.has('story-no-skip')).toBe(false);
    expect(h.fresh.has('story-wins-3')).toBe(true);
    const k = new H();
    k.story('prologue', 'none', 'case:2');
    k.p = storyAssisted(k.p, 'case:2');
    for (let c = 1; c <= 7; c++) k.story(`chapter-${c}`, 'loss', 'case:2');
    k.story('epilogue', 'none', 'case:2');
    expect(k.fresh.has('story-no-skip')).toBe(false);
    expect(k.fresh.has('story-epilogue')).toBe(true);
  });
  it('a comeback needs the whole match in one sitting', () => {
    const h = new H();
    h.match('draw2', { won: true, history: [[0, 60], [120, 60]], scores: [120, 60], observed: false });
    expect(h.fresh.has('draw-comeback')).toBe(false);
  });
  it('two players on one device earn only shared-match achievements', () => {
    const f = localMatchFacts({ mode: 'block2', humansArePartners: false, humansWon: true });
    expect(Object.keys(f).sort()).toEqual(['local.block2', 'local.finished']);
  });
  it('facts never need a hidden tile: redacted opponent draws and passes are enough', () => {
    const o = new HandObserver({ mode: 'draw2', me: 0, teams: [[0], [1]], seatCount: 2 });
    o.prime([7, 7]);
    const f = o.feed([draw(1, 13, 8), play(1, 't21', 2, 1, 7, 0)]);
    expect(f).toEqual({});
  });
});

describe('persistence', () => {
  const mem = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };
  it('round-trips through the versioned envelope', () => {
    const s = mem();
    const p = applyFacts(emptyProgress(), { tiles: 3 }, 5, 'k').progress;
    expect(saveProgress(s, p)).toBe(true);
    const raw = JSON.parse(s.data.get(ACH_SPEC.key)!);
    expect(raw.format).toBe('sticks-and-bones/achievements');
    expect(raw.version).toBe(1);
    expect(loadProgress(s).progress).toEqual(p);
  });
  it('migrates a version-0 record (ids only) and drops unknown ids', () => {
    const s = mem();
    s.setItem(ACH_SPEC.key, JSON.stringify({ unlocked: ['learn-first-tile', 'not-a-real-id'] }));
    const r = loadProgress(s);
    expect(r.status).toBe('migrated');
    expect(Object.keys(r.progress.unlocked)).toEqual(['learn-first-tile']);
  });
  it('quarantines a corrupt record instead of crashing', () => {
    const s = mem();
    s.setItem(ACH_SPEC.key, '{"format":"sticks-and-bones/achievements","version":1,"data":{"counts":"x"}}');
    expect(loadProgress(s).status).toBe('corrupt');
    expect(s.data.has(`${ACH_SPEC.key}.quarantine`)).toBe(true);
  });
  it('reports a refused write honestly', () => {
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
    expect(saveProgress(full, emptyProgress())).toBe(false);
  });
  it('retroactive awards use only what the records prove, once', () => {
    let st = emptyStats();
    st = recordCompleted(st, { matchId: 'a', mode: 'block2', opponent: 'ai', difficulty: 'hard', player1Won: true, humansArePartners: false });
    st = recordCompleted(st, { matchId: 'b', mode: 'draw2', opponent: 'ai', difficulty: 'easy', player1Won: false, humansArePartners: false });
    st = recordCompleted(st, { matchId: 'c', mode: 'partnership4', opponent: 'local', difficulty: 'normal', player1Won: true, humansArePartners: true });
    const r = applyRetro(emptyProgress(), retroCounts(st, ['prologue', 'chapter-1']), 7);
    expect(r.fresh.sort()).toEqual(['block-win-hard', 'ex-local', 'learn-match', 'learn-match-won', 'p4-local-partners', 'story-ch1', 'story-prologue'].sort());
    expect(Object.values(r.progress.unlocked).every((u) => u.r === 1)).toBe(true);
    // Nothing hand-level is claimed from statistics.
    expect(r.progress.counts.handsWon).toBeUndefined();
    // Running it again changes nothing.
    expect(applyRetro(r.progress, retroCounts(st, ['prologue', 'chapter-1']), 8).progress).toBe(r.progress);
  });
});
