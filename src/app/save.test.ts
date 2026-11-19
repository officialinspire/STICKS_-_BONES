import { describe, expect, it } from 'vitest';
import { inlineRunner, type AiRunner, type DecisionRequest } from '../ai/runner';
import { decide } from '../ai/policy';
import type { Decision } from '../ai/types';
import { applyCommand } from '../engine/match';
import { craft } from '../engine/testing/craft';
import { TableController } from './controller';
import { readSave, SAVE_KEY, SAVE_SPEC, writeSave } from './save';
import { GameSession, type Scheduler } from './session';
import { DEFAULT_SETTINGS, loadSettingsResult, saveSettings, SETTINGS_KEY } from './settings';
import { emptyStats, loadStats, recordAbandoned, recordCompleted, saveStats, STATS_SPEC, totals } from './stats';
import { quarantineKey, readRecord, type KeyValueStore } from './storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
function manualScheduler() {
  const q: { fn: () => void; id: number }[] = [];
  let id = 0;
  const s: Scheduler = {
    set: (fn) => {
      q.push({ fn, id: ++id });
      return id;
    },
    clear: (h) => {
      const i = q.findIndex((x) => x.id === h);
      if (i >= 0) q.splice(i, 1);
    },
  };
  return { s, flush: () => q.shift()?.fn(), pending: () => q.length };
}
const idle: Scheduler = { set: () => 0, clear: () => {} };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('versioned records: graceful recovery', () => {
  const spec = { key: 'k', format: 'f', version: 2, validate: (d: unknown) => (typeof d === 'number' ? d : null), migrate: (from: number, d: unknown) => (from === 1 ? Number(d) : null) };
  it('missing, ok, migrated, corrupt and newer-version data are all handled without throwing', () => {
    const st = memoryStore();
    expect(readRecord(st, spec)).toEqual({ status: 'missing', value: null });
    st.setItem('k', JSON.stringify({ format: 'f', version: 2, data: 7 }));
    expect(readRecord(st, spec)).toEqual({ status: 'ok', value: 7 });
    st.setItem('k', JSON.stringify({ format: 'f', version: 1, data: '5' }));
    expect(readRecord(st, spec)).toEqual({ status: 'migrated', value: 5 });
    expect(JSON.parse(st.getItem('k')!).version).toBe(2); // rewritten in the current version
    st.setItem('k', '{broken');
    expect(readRecord(st, spec).status).toBe('corrupt');
    expect(st.getItem('k')).toBeNull();
    expect(st.getItem(quarantineKey('k'))).toBe('{broken'); // set aside, not destroyed
    st.setItem('k', JSON.stringify({ format: 'f', version: 9, data: 1 }));
    expect(readRecord(st, spec).status).toBe('incompatible');
    st.setItem('k', JSON.stringify({ format: 'f', version: 2, data: 'not a number' }));
    expect(readRecord(st, spec).status).toBe('corrupt');
    expect(readRecord(null, spec).status).toBe('unavailable');
  });

  it('settings: legacy unversioned object migrates; garbage falls back to defaults', () => {
    const st = memoryStore();
    st.setItem(SETTINGS_KEY, JSON.stringify({ explicitLanguage: false, banter: false }));
    const r = loadSettingsResult(st);
    expect(r.status).toBe('migrated');
    expect(r.settings.explicitLanguage).toBe(false);
    expect(r.settings.audio).toEqual(DEFAULT_SETTINGS.audio);
    saveSettings(st, r.settings);
    expect(loadSettingsResult(st)).toMatchObject({ status: 'ok' });
    st.setItem(SETTINGS_KEY, '[[[');
    expect(loadSettingsResult(st)).toEqual({ settings: DEFAULT_SETTINGS, status: 'corrupt' });
  });

  it('settings v2 → v3: Story text preferences added with defaults; v3 keeps them; bad values fall back', () => {
    const st = memoryStore();
    st.setItem(SETTINGS_KEY, JSON.stringify({ format: 'sticks-and-bones/settings', version: 2, data: { ...DEFAULT_SETTINGS, banter: false, storyTextScale: undefined, instantText: undefined } }));
    const r = loadSettingsResult(st);
    expect(r.status).toBe('migrated');
    expect(r.settings).toMatchObject({ banter: false, storyTextScale: 1, instantText: false });
    saveSettings(st, { ...r.settings, storyTextScale: 1.3, instantText: true });
    expect(JSON.parse(st.getItem(SETTINGS_KEY)!).version).toBe(4);
    expect(loadSettingsResult(st)).toMatchObject({ status: 'ok', settings: { storyTextScale: 1.3, instantText: true } });
    st.setItem(SETTINGS_KEY, JSON.stringify({ format: 'sticks-and-bones/settings', version: 4, data: { storyTextScale: 2, instantText: 'yes' } }));
    expect(loadSettingsResult(st).settings).toMatchObject({ storyTextScale: 1, instantText: false });
  });

  it('settings v3 → v4: table tips start off for anyone who already has settings; new players get them', () => {
    const st = memoryStore();
    expect(loadSettingsResult(st).settings.tableTips).toBe(true); // nothing stored: a new player
    st.setItem(SETTINGS_KEY, JSON.stringify({ format: 'sticks-and-bones/settings', version: 3, data: { ...DEFAULT_SETTINGS, tableTips: undefined, banter: false } }));
    const r = loadSettingsResult(st);
    expect(r.status).toBe('migrated');
    expect(r.settings).toMatchObject({ tableTips: false, banter: false });
    saveSettings(st, { ...r.settings, tableTips: true }); // turned back on in Settings: kept
    expect(loadSettingsResult(st).settings.tableTips).toBe(true);
  });
});

describe('match save v2', () => {
  it('round-trips state, preset reference, AI streams and match id', () => {
    const st = memoryStore();
    const s = new GameSession({ mode: 'partnership4', opponent: 'local', humanSeats: [0, 2], names: ['Ana', 'Ben'], difficulty: 'hard', seed: 'save', aiSeed: 'ai' }, { scheduler: idle });
    expect(writeSave(st, s, 'match-1')).toBe(true);
    const r = readSave(st);
    expect(r.status).toBe('ok');
    const g = r.value!;
    expect(g.matchId).toBe('match-1');
    expect(g.rules).toEqual({ presetId: 'cousins-house-rules', presetVersion: 1 });
    expect(g.state).toEqual(s.debugState());
    expect(g.aiRng).toEqual(s.exportAiRng());
    const c = new TableController(new GameSession({ state: g.state, opponent: g.opponent, difficulty: g.difficulty, aiRng: g.aiRng }, { scheduler: idle }), { restored: true });
    if (c.session.isHuman(c.session.turn)) expect(c.state).toMatchObject({ kind: 'covered', reason: 'restored' });
    expect(c.view().myHand).toEqual([]);
    c.dispose();
  });

  it('migrates a Stage 5 (v1) save and gives it a match id', () => {
    const st = memoryStore();
    const s = new GameSession({ mode: 'draw2', opponent: 'ai', seed: 'v1', aiSeed: 'a' }, { scheduler: idle });
    st.setItem(SAVE_KEY, JSON.stringify({ format: 'sticks-and-bones-save@1', opponent: 'ai', difficulty: 'normal', state: s.debugState(), aiRng: s.exportAiRng() }));
    const r = readSave(st);
    expect(r.status).toBe('migrated');
    expect(r.value!.matchId.length).toBeGreaterThan(8);
    expect(r.value!.state).toEqual(s.debugState());
  });

  it('sets aside tampered, unknown-preset, truncated and finished saves', () => {
    const st = memoryStore();
    const s = new GameSession({ mode: 'draw2', opponent: 'local', seed: 'x', aiSeed: 'y' }, { scheduler: idle });
    writeSave(st, s, 'm');
    const good = st.getItem(SAVE_KEY)!;
    const env = () => JSON.parse(good);
    const dup = env();
    dup.data.state.hand.hands[0][0] = dup.data.state.hand.hands[1][0];
    st.setItem(SAVE_KEY, JSON.stringify(dup));
    expect(readSave(st).status).toBe('corrupt');
    const unknown = env();
    unknown.data.rules = { presetId: 'someone-elses-rules', presetVersion: 3 };
    st.setItem(SAVE_KEY, JSON.stringify(unknown));
    expect(readSave(st).status).toBe('incompatible');
    st.setItem(SAVE_KEY, good.slice(0, good.length / 2)); // truncated write
    expect(readSave(st).status).toBe('corrupt');
    const future = env();
    future.version = 99;
    st.setItem(SAVE_KEY, JSON.stringify(future));
    expect(readSave(st).status).toBe('incompatible');
    expect(writeSave(st, new GameSession({ mode: 'draw2', opponent: 'dev-both', seed: 'x', aiSeed: 'y' }, { scheduler: idle }), 'dev')).toBe(false);
  });
});

describe('restore never scores twice and never replays a stale move', () => {
  /** Ends the hand (seat 0 goes out) and returns the state at hand-ended, before resolution. */
  function endedState() {
    const s0 = craft({ mode: 'draw2', line: [['t66', 6, 6]], hands: [['t61'], ['t55', 't44', 't20']], turn: 0, opener: 1, scores: [40, 10] });
    const r = applyCommand(s0, { type: 'play', seq: s0.seq, seat: 0, tile: 't61', end: 'tail' });
    if (!r.ok) throw new Error('play');
    expect(r.state.phase).toBe('hand-ended');
    return r.state;
  }

  it('saved between hand end and scoring: the restored game scores the hand exactly once', () => {
    const st = memoryStore();
    const sched = manualScheduler();
    const s = new GameSession({ state: endedState(), opponent: 'ai', aiSeed: 'a' }, { scheduler: idle });
    writeSave(st, s, 'ended');
    const g = readSave(st).value!;
    const restored = new GameSession({ state: g.state, opponent: g.opponent, difficulty: g.difficulty, aiRng: g.aiRng }, { scheduler: sched.s });
    while (sched.pending()) sched.flush();
    expect(restored.debugState().phase).toBe('hand-resolved');
    expect(restored.debugState().scores).toEqual([60, 10]); // 40 + 20 once
    expect(restored.debugState().history).toHaveLength(1);
  });

  it('saved after scoring: restore keeps the score and Next hand still works', () => {
    const st = memoryStore();
    const sched = manualScheduler();
    const s = new GameSession({ state: endedState(), opponent: 'ai', aiSeed: 'a' }, { scheduler: sched.s });
    while (sched.pending()) sched.flush();
    expect(s.debugState().phase).toBe('hand-resolved');
    writeSave(st, s, 'resolved');
    const g = readSave(st).value!;
    const sched2 = manualScheduler();
    const restored = new GameSession({ state: g.state, opponent: g.opponent, aiRng: g.aiRng }, { scheduler: sched2.s });
    expect(sched2.pending()).toBe(0); // nothing pending to re-score
    expect(restored.debugState().scores).toEqual([60, 10]);
    const c = new TableController(restored, { restored: true });
    expect(c.state.kind).toBe('round-results');
    expect(c.nextHand()).toBe(true);
    expect(restored.debugState().hand.number).toBe(2);
    expect(restored.debugState().scores).toEqual([60, 10]);
    c.dispose();
  });

  it('saved during AI thinking: the old decision is dropped and the restored AI moves exactly once', async () => {
    const requests: { req: DecisionRequest; resolve: (d: Decision) => void }[] = [];
    const deferred: AiRunner = { kind: 'inline', decide: (req) => new Promise((resolve) => requests.push({ req, resolve })), dispose: () => {} };
    const st = memoryStore();
    let s: GameSession | null = null;
    for (let i = 0; i < 40 && !s; i++) {
      const cand = new GameSession({ mode: 'partnership4', opponent: 'ai', seed: `restore-ai-${i}`, aiSeed: 'z' }, { scheduler: manualScheduler().s, runner: deferred });
      if (!cand.isHuman(cand.turn)) s = cand;
      else cand.dispose();
    }
    if (!s) throw new Error('no AI-first seed');
    expect(s.aiThinking).toBe(true);
    writeSave(st, s, 'ai');
    s.dispose(); // reload: the old page is gone with its pending request
    const g = readSave(st).value!;
    const sched = manualScheduler();
    const restored = new GameSession({ state: g.state, opponent: g.opponent, aiRng: g.aiRng }, { scheduler: sched.s, runner: deferred });
    // Old request resolves late: must not touch anything.
    requests[0]!.resolve(decide('normal', requests[0]!.req.obs, requests[0]!.req.rng));
    await tick();
    expect(restored.debugState().seq).toBe(g.state.seq);
    // The restored session asked once, fresh, and moves once.
    expect(requests).toHaveLength(2);
    requests[1]!.resolve(decide('normal', requests[1]!.req.obs, requests[1]!.req.rng));
    await tick();
    sched.flush();
    expect(restored.debugState().seq).toBe(g.state.seq + 1);
    expect(restored.stats.aiDecisions).toBe(1);
    restored.dispose();
  });

  it('a restored match continues to an identical result as the uninterrupted one', async () => {
    const run = async (interruptAt: number | null) => {
      const st = memoryStore();
      let sched = manualScheduler();
      let s = new GameSession({ mode: 'block2', opponent: 'local', seed: 'identical', aiSeed: 'q' }, { scheduler: sched.s, runner: inlineRunner() });
      let c = new TableController(s);
      for (let i = 0; i < 4000 && s.phase !== 'match-over'; i++) {
        if (interruptAt !== null && i === interruptAt) {
          writeSave(st, s, 'id');
          c.dispose();
          const g = readSave(st).value!;
          sched = manualScheduler();
          s = new GameSession({ state: g.state, opponent: g.opponent, aiRng: g.aiRng }, { scheduler: sched.s, runner: inlineRunner() });
          c = new TableController(s, { restored: true });
        }
        if (c.state.kind === 'covered') c.ready();
        else if (c.state.kind === 'revealing') c.reveal();
        else if (s.phase === 'hand-resolved') c.nextHand();
        else if (c.canAct()) {
          const v = c.view();
          const m = v.legalMoves[0];
          if (m) c.play(m.tile, m.end);
          else c.pass();
        } else if (sched.pending()) sched.flush();
        else await tick();
      }
      const out = s.debugState();
      c.dispose();
      return out;
    };
    const straight = await run(null);
    const resumed = await run(25);
    expect(resumed.scores).toEqual(straight.scores);
    expect(resumed.history).toEqual(straight.history);
  });
});

describe('statistics', () => {
  const base = { mode: 'draw2' as const, opponent: 'ai' as const, difficulty: 'hard' as const, humansArePartners: false };
  it('records each completed match once, by mode and difficulty', () => {
    let s = emptyStats();
    s = recordCompleted(s, { ...base, matchId: 'a', player1Won: true });
    s = recordCompleted(s, { ...base, matchId: 'a', player1Won: true }); // reload replay
    s = recordCompleted(s, { ...base, matchId: 'b', player1Won: false });
    expect(s.solo.draw2.hard).toEqual({ wins: 1, losses: 1 });
    expect(totals(s)).toMatchObject({ completed: 2, wins: 1, losses: 1, abandoned: 0 });
  });

  it('keeps abandoned games separate from losses', () => {
    let s = emptyStats();
    s = recordAbandoned(s, 'x', 'block2');
    s = recordAbandoned(s, 'x', 'block2');
    expect(s.abandoned.block2).toBe(1);
    expect(totals(s)).toMatchObject({ completed: 0, losses: 0, abandoned: 1 });
  });

  it('tracks two-player matches and partnership results', () => {
    let s = emptyStats();
    s = recordCompleted(s, { matchId: 'p', mode: 'partnership4', opponent: 'local', difficulty: 'normal', player1Won: true, humansArePartners: true });
    s = recordCompleted(s, { matchId: 'q', mode: 'partnership4', opponent: 'local', difficulty: 'normal', player1Won: false, humansArePartners: false });
    expect(s.local.partnership4.completed).toBe(2);
    expect(s.localPartners).toEqual({ wins: 1, losses: 0 });
  });

  it('persists, and recovers from damaged data', () => {
    const st = memoryStore();
    saveStats(st, recordAbandoned(emptyStats(), 'z', 'draw2'));
    expect(loadStats(st).stats.abandoned.draw2).toBe(1);
    st.setItem(STATS_SPEC.key, JSON.stringify({ format: STATS_SPEC.format, version: 1, data: { solo: 'nope' } }));
    expect(loadStats(st)).toMatchObject({ status: 'corrupt', stats: emptyStats() });
  });
});
void SAVE_SPEC;
