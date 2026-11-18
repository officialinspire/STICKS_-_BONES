/**
 * Achievement progress: a versioned local record (`sticks-and-bones.achievements`, src/app/storage.ts
 * envelope).
 *
 * - **Counters** only grow by facts (facts.ts). Each fact batch carries a dedupe key, a game/hand/
 *   chapter key that is recorded once, so a reload, a re-sent event or a second tab can't count the
 *   same thing twice.
 * - **Unlocks** are kept with their time and whether they came from earlier records (retroactive).
 * - **Retroactive awards** come only from records that prove them: Quick Play statistics (wins and
 *   completions by mode and difficulty) and Story progress (completed scenes). Counters are raised to
 *   the proven value (max, never added), so running it again changes nothing.
 * - Version 1. Version 0 (a bare object of unlocked ids, never shipped) is accepted by `migrate`, so
 *   the migration path is exercised; anything else unreadable is quarantined by storage.ts as usual.
 */
import type { Difficulty } from '../../ai/types';
import type { ModeId } from '../../engine/types';
import type { Stats } from '../stats';
import { readRecord, writeRecord, type KeyValueStore, type ReadStatus, type RecordSpec } from '../storage';
import type { SceneId } from '../../story/progress';
import { ACHIEVEMENTS, progressOf } from './catalog';
import type { Facts } from './facts';

export interface Unlock {
  /** Unlock time (ms since epoch). */
  readonly t: number;
  /** Earned from earlier records, not live play. */
  readonly r?: 1;
}
export interface CaseLog {
  readonly wins: number;
  readonly assisted: boolean;
  /** First seen after the prologue (started before tracking): whole-case awards can't be proven. */
  readonly partial: boolean;
}
export interface AchProgress {
  readonly counts: Readonly<Record<string, number>>;
  readonly unlocked: Readonly<Record<string, Unlock>>;
  /** Recently applied dedupe keys (bounded). */
  readonly seen: readonly string[];
  /** Per Story case (keyed by the case's start time), bounded to the latest few. */
  readonly cases: Readonly<Record<string, CaseLog>>;
  /** Retroactive awards have been taken from the existing records once. */
  readonly retro: boolean;
}

export const SEEN_MAX = 400;
const CASES_MAX = 4;

export function emptyProgress(): AchProgress {
  return { counts: {}, unlocked: {}, seen: [], cases: {}, retro: false };
}

const IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
const nat = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function validate(d: unknown): AchProgress | null {
  if (typeof d !== 'object' || d === null) return null;
  const x = d as Partial<AchProgress>;
  if (typeof x.counts !== 'object' || x.counts === null || !Object.values(x.counts).every(nat)) return null;
  if (typeof x.unlocked !== 'object' || x.unlocked === null) return null;
  const unlocked: Record<string, Unlock> = {};
  // Unknown ids (a later build's catalog) are dropped, never invented.
  for (const [id, u] of Object.entries(x.unlocked)) if (IDS.has(id) && nat((u as Unlock)?.t)) unlocked[id] = (u as Unlock).r ? { t: (u as Unlock).t, r: 1 } : { t: (u as Unlock).t };
  if (!Array.isArray(x.seen) || !x.seen.every((s) => typeof s === 'string')) return null;
  const cases: Record<string, CaseLog> = {};
  for (const [k, c] of Object.entries(x.cases ?? {})) {
    const cl = c as CaseLog;
    if (nat(cl?.wins) && typeof cl.assisted === 'boolean' && typeof cl.partial === 'boolean') cases[k] = { wins: cl.wins, assisted: cl.assisted, partial: cl.partial };
  }
  return { counts: { ...x.counts }, unlocked, seen: x.seen.slice(-SEEN_MAX), cases, retro: x.retro === true };
}

function migrate(from: number, data: unknown): unknown {
  // v0: { unlocked: string[] } — ids only, no counters. Keep the ids; counters restart from records.
  if (from === 0 && typeof data === 'object' && data !== null && Array.isArray((data as { unlocked?: unknown }).unlocked)) {
    const ids = ((data as { unlocked: unknown[] }).unlocked).filter((i): i is string => typeof i === 'string' && IDS.has(i));
    return { ...emptyProgress(), unlocked: Object.fromEntries(ids.map((i) => [i, { t: 0, r: 1 }])) };
  }
  return null;
}

export const ACH_SPEC: RecordSpec<AchProgress> = { key: 'sticks-and-bones.achievements', format: 'sticks-and-bones/achievements', version: 1, validate, migrate };

export function loadProgress(store: KeyValueStore | null): { progress: AchProgress; status: ReadStatus } {
  const r = readRecord(store, ACH_SPEC);
  return { progress: r.value ?? emptyProgress(), status: r.status };
}
export function saveProgress(store: KeyValueStore | null, p: AchProgress): boolean {
  return writeRecord(store, ACH_SPEC, p);
}

/** Newly unlocked ids (counters already include everything). */
function unlocks(p: AchProgress, now: number, retro: boolean): { progress: AchProgress; fresh: string[] } {
  const fresh: string[] = [];
  const unlocked: Record<string, Unlock> = { ...p.unlocked };
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    if (progressOf(a, p.counts) >= a.target) {
      unlocked[a.id] = retro ? { t: now, r: 1 } : { t: now };
      fresh.push(a.id);
    }
  }
  return { progress: fresh.length ? { ...p, unlocked } : p, fresh };
}

/**
 * Add a batch of facts once. `key` (when given) is remembered: the same key never applies twice.
 * Returns the new progress and the ids it unlocked.
 */
export function applyFacts(p: AchProgress, facts: Facts, now: number, key?: string): { progress: AchProgress; fresh: string[] } {
  if (key !== undefined && p.seen.includes(key)) return { progress: p, fresh: [] };
  const entries = Object.entries(facts).filter(([, n]) => n > 0);
  if (!entries.length && key === undefined) return { progress: p, fresh: [] };
  const counts: Record<string, number> = { ...p.counts };
  for (const [k, n] of entries) counts[k] = (counts[k] ?? 0) + n;
  const seen = key === undefined ? p.seen : [...p.seen, key].slice(-SEEN_MAX);
  return unlocks({ ...p, counts, seen }, now, false);
}

/** Story bookkeeping for one completed chapter in a case (first plays only). */
export function storyChapter(p: AchProgress, scene: SceneId, outcome: 'win' | 'loss' | 'tie' | 'none', caseKey: string, now: number): { progress: AchProgress; fresh: string[] } {
  const key = `story:${caseKey}:${scene}`;
  if (p.seen.includes(key)) return { progress: p, fresh: [] };
  const prev = p.cases[caseKey] ?? { wins: 0, assisted: false, partial: scene !== 'prologue' };
  const log: CaseLog = { ...prev, wins: prev.wins + (outcome === 'win' ? 1 : 0) };
  const keep = Object.entries({ ...p.cases, [caseKey]: log }).slice(-CASES_MAX);
  const facts: Facts = { [`story.${scene}`]: 1 };
  if (outcome === 'loss') facts['story.loss'] = 1;
  if (outcome === 'win' && (scene === 'chapter-3' || scene === 'chapter-7')) facts['story.partnerWin'] = 1;
  if (outcome === 'win' && log.wins === 3) facts['story.wins3'] = 1;
  if (outcome === 'win' && log.wins === 7 && !log.partial) facts['story.wins7'] = 1;
  if (scene === 'epilogue' && !log.assisted && !log.partial) facts['story.noSkip'] = 1;
  return applyFacts({ ...p, cases: Object.fromEntries(keep) }, facts, now, key);
}

/** A scene was skipped in this case (assisted): "Every Word" is no longer possible for it. */
export function storyAssisted(p: AchProgress, caseKey: string): AchProgress {
  const prev = p.cases[caseKey] ?? { wins: 0, assisted: false, partial: true };
  if (prev.assisted) return p;
  return { ...p, cases: Object.fromEntries(Object.entries({ ...p.cases, [caseKey]: { ...prev, assisted: true } }).slice(-CASES_MAX)) };
}

const MODES: ModeId[] = ['draw2', 'block2', 'partnership4'];
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

/** Counters that existing records prove (no hand-level detail exists in them, so none is claimed). */
export function retroCounts(stats: Stats | null, completedScenes: readonly SceneId[]): Facts {
  const f: Facts = {};
  if (stats) {
    let won = 0;
    let played = 0;
    for (const m of MODES) {
      let modeWins = 0;
      for (const d of DIFFS) {
        const wl = stats.solo[m][d];
        if (wl.wins) f[`${m}.win.${d}`] = wl.wins;
        modeWins += wl.wins;
        played += wl.wins + wl.losses;
      }
      if (modeWins) f[`modeWon.${m}`] = modeWins;
      won += modeWins;
      if (stats.local[m].completed) f[`local.${m}`] = stats.local[m].completed;
    }
    const local = MODES.reduce((s, m) => s + stats.local[m].completed, 0);
    if (won) f.matchesWon = won;
    if (played) f.matches = played;
    if (local) f['local.finished'] = local;
    if (stats.localPartners.wins) f['p4.localWin'] = stats.localPartners.wins;
  }
  for (const s of completedScenes) f[`story.${s}`] = 1;
  return f;
}

/** Apply retroactive counters once (max, not add). */
export function applyRetro(p: AchProgress, proven: Facts, now: number): { progress: AchProgress; fresh: string[] } {
  if (p.retro) return { progress: p, fresh: [] };
  const counts: Record<string, number> = { ...p.counts };
  for (const [k, v] of Object.entries(proven)) counts[k] = Math.max(counts[k] ?? 0, v);
  return unlocks({ ...p, counts, retro: true }, now, true);
}
