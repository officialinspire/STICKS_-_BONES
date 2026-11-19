import { describe, expect, it } from 'vitest';
import { buildObservation } from '../../ai/observation';
import { decide } from '../../ai/policy';
import { inlineRunner } from '../../ai/runner';
import { seedRng } from '../../engine/rng';
import type { ModeId } from '../../engine/types';
import { TableController } from '../controller';
import { GameSession, type OpponentKind, type Scheduler } from '../session';
import type { KeyValueStore } from '../storage';
import { AchievementTracker, type TableKind } from './tracker';

function manual() {
  const q: { fn: () => void; id: number }[] = [];
  let id = 0;
  const sched: Scheduler = {
    set: (fn) => (q.push({ fn, id: ++id }), id),
    clear: (h) => {
      const i = q.findIndex((x) => x.id === h);
      if (i >= 0) q.splice(i, 1);
    },
  };
  return { sched, flush: () => q.shift()?.fn(), pending: () => q.length };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

/** Drive a controller like a player would (acting only through it), until the match ends or `stop` says so. */
async function drive(c: TableController, m: ReturnType<typeof manual>, stop: () => boolean = () => false) {
  let rng = seedRng('tracker-human');
  for (let guard = 0; guard < 20000 && c.session.phase !== 'match-over' && !stop(); guard++) {
    const st = c.state;
    if (st.kind === 'covered') c.ready();
    else if (st.kind === 'revealing') c.reveal();
    else if (st.kind === 'human-turn' && c.canAct()) {
      const d = decide('normal', buildObservation(c.view(), c.session.rules), rng);
      rng = d.rng;
      const a = d.action;
      if (a.type === 'play') c.play(a.tile, a.end);
      else if (a.type === 'draw') c.draw();
      else c.pass();
    } else if (st.kind === 'round-results' && c.session.phase === 'hand-resolved') c.nextHand();
    else if (m.pending()) m.flush();
    else await tick();
  }
}

function table(mode: ModeId, opponent: OpponentKind, seed: string) {
  const m = manual();
  const session = new GameSession({ mode, opponent, seed, aiSeed: `${seed}-ai`, difficulty: 'easy' }, { scheduler: m.sched, runner: inlineRunner(), timing: { aiPlay: { easy: 0, normal: 0, hard: 0 }, aiForced: 0, resolve: 0 } });
  return { c: new TableController(session), m };
}

function tracker(store = mem()) {
  const unlocked: string[] = [];
  let failed = 0;
  const t = new AchievementTracker({ store, now: () => 1, onUnlock: (ids) => unlocked.push(...ids), onSaveFailed: () => failed++ });
  return { t, unlocked, store, failed: () => failed };
}

function watch(t: AchievementTracker, c: TableController, kind: TableKind, key: string, restored = false) {
  const v = c.view();
  const fresh = !restored && v.line.tiles.length === 0 ? { sizes: [...v.handSizes] } : null;
  return c.subscribe(t.listener(c, { kind, gameKey: key, restored }, fresh));
}

describe('tracker on real tables (through the TableController)', () => {
  it('a full solo Block match: live counters, hands, the match — and each counted once', async () => {
    const { t, unlocked } = tracker();
    const { c, m } = table('block2', 'ai', 'ach-block-1');
    watch(t, c, 'quick-solo', 'm1');
    await drive(c, m);
    expect(c.session.phase).toBe('match-over');
    const n = t.progress.counts;
    const hands = c.session.debugState().history.length;
    expect(n.hands).toBe(hands);
    expect(n.matches).toBe(1);
    expect(n.tiles).toBeGreaterThan(0);
    expect(unlocked).toContain('learn-first-tile');
    expect(unlocked).toContain('learn-match');
    expect(new Set(unlocked).size).toBe(unlocked.length);
  });

  it('a reload mid-match: the restored table continues, nothing is counted twice', async () => {
    const store = mem();
    const a = tracker(store);
    const { c, m } = table('draw2', 'ai', 'ach-draw-reload');
    watch(a.t, c, 'quick-solo', 'm2');
    await drive(c, m, () => c.session.debugState().history.length >= 1 && c.session.phase === 'playing' && c.session.debugState().hand.line.tiles.length >= 3);
    const before = { ...a.t.progress.counts };
    // "Reload": a new tracker reads the saved record; a new session restores the saved state.
    const b = tracker(store);
    expect(b.t.progress.counts).toEqual(before);
    const m2 = manual();
    const restored = new GameSession({ state: c.session.debugState(), opponent: 'ai', difficulty: 'easy', aiRng: c.session.exportAiRng() }, { scheduler: m2.sched, runner: inlineRunner(), timing: { aiPlay: { easy: 0, normal: 0, hard: 0 }, aiForced: 0, resolve: 0 } });
    const c2 = new TableController(restored, { restored: true });
    c.dispose();
    watch(b.t, c2, 'quick-solo', 'm2', true);
    await drive(c2, m2);
    const hands = restored.debugState().history.length;
    expect(b.t.progress.counts.hands).toBe(hands);
    expect(b.t.progress.counts.matches).toBe(1);
  });

  it('two players on one device: only the finished shared match counts', async () => {
    const { t } = tracker();
    const { c, m } = table('block2', 'local', 'ach-local');
    watch(t, c, 'local', 'm3');
    await drive(c, m);
    expect(Object.keys(t.progress.counts).sort()).toEqual(['local.block2', 'local.finished']);
  });

  it('a story replay or a developer table counts nothing', async () => {
    const { t } = tracker();
    const { c, m } = table('draw2', 'ai', 'ach-none');
    watch(t, c, 'none', 'm4');
    await drive(c, m, () => c.session.debugState().history.length >= 1);
    expect(t.progress.counts).toEqual({});
  });

  it('a story hand finished with AI assistance counts nothing from the assistant’s first move on (once, no duplicates)', async () => {
    const { t } = tracker();
    const { c, m } = table('draw2', 'ai', 'ach-assist');
    watch(t, c, 'story', 'story:1:chapter-1');
    c.session.assist(0); // from the deal: every move of Roberto's is the assistant's
    await drive(c, m, () => c.session.phase === 'hand-resolved');
    expect(c.session.phase).toBe('hand-resolved');
    expect(c.session.assistUsed).toBe(true);
    expect(t.progress.counts).toEqual({});
    // The chapter completes through the Story hook, but an assisted result is never a win.
    t.storyChapter('chapter-1', 'none', false, 'case:1');
    t.storyChapter('chapter-1', 'none', false, 'case:1'); // a repeated call cannot count twice
    expect(t.progress.counts['story.chapter-1']).toBe(1);
    expect(Object.keys(t.progress.counts).filter((k) => /win/i.test(k))).toEqual([]);
  });

  it('story replays never change achievements; a refused save is reported', () => {
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    const r = tracker(full as never);
    r.t.storyChapter('chapter-1', 'win', true, 'replay:chapter-1:1');
    expect(r.t.progress.counts).toEqual({});
    r.t.storyChapter('chapter-1', 'win', false, 'case:1');
    expect(r.t.progress.counts['story.chapter-1']).toBe(1); // kept in memory for a later successful write
    expect(r.failed()).toBe(1);
  });
});
