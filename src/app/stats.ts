/**
 * Modest local statistics (this device only; no accounts). Achievements are separate (src/app/achievements).
 * Completed matches are recorded once per match id; matches that are thrown
 * away before finishing count as ABANDONED — never as losses.
 */
import type { Difficulty } from '../ai/types';
import type { ModeId } from '../engine/types';
import { readRecord, removeRecord, writeRecord, type KeyValueStore, type ReadStatus, type RecordSpec } from './storage';

export interface WinLoss {
  readonly wins: number;
  readonly losses: number;
}

export interface Stats {
  /** Solo matches against the computer, by mode and difficulty. */
  readonly solo: Readonly<Record<ModeId, Readonly<Record<Difficulty, WinLoss>>>>;
  /** Two players on one device: completed matches by mode, and partnership results when both humans were partners. */
  readonly local: Readonly<Record<ModeId, { readonly completed: number }>>;
  readonly localPartners: WinLoss;
  /** Started, then discarded or restarted before the end. */
  readonly abandoned: Readonly<Record<ModeId, number>>;
  /** Recently recorded match ids (prevents double counting after a reload). */
  readonly recorded: readonly string[];
}

const MODES: ModeId[] = ['draw2', 'block2', 'partnership4'];
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const zeroWL = (): WinLoss => ({ wins: 0, losses: 0 });

export function emptyStats(): Stats {
  return {
    solo: Object.fromEntries(MODES.map((m) => [m, Object.fromEntries(DIFFS.map((d) => [d, zeroWL()]))])) as Stats['solo'],
    local: Object.fromEntries(MODES.map((m) => [m, { completed: 0 }])) as Stats['local'],
    localPartners: zeroWL(),
    abandoned: Object.fromEntries(MODES.map((m) => [m, 0])) as Stats['abandoned'],
    recorded: [],
  };
}

const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

function validate(data: unknown): Stats | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<Stats>;
  const out = emptyStats() as { -readonly [K in keyof Stats]: Stats[K] };
  const wl = (x: unknown): WinLoss | null => {
    const o = x as Partial<WinLoss> | undefined;
    const w = n(o?.wins);
    const l = n(o?.losses);
    return w === null || l === null ? null : { wins: w, losses: l };
  };
  for (const m of MODES) {
    for (const df of DIFFS) {
      const v = wl(d.solo?.[m]?.[df]);
      if (!v) return null;
      (out.solo[m] as Record<Difficulty, WinLoss>)[df] = v;
    }
    const c = n(d.local?.[m]?.completed);
    const a = n(d.abandoned?.[m]);
    if (c === null || a === null) return null;
    (out.local as Record<ModeId, { completed: number }>)[m] = { completed: c };
    (out.abandoned as Record<ModeId, number>)[m] = a;
  }
  const lp = wl(d.localPartners);
  if (!lp || !Array.isArray(d.recorded) || !d.recorded.every((x) => typeof x === 'string')) return null;
  out.localPartners = lp;
  out.recorded = d.recorded.slice(-100);
  return out;
}

export const STATS_SPEC: RecordSpec<Stats> = { key: 'sticks-and-bones.stats', format: 'sticks-and-bones/stats', version: 1, validate };

export interface CompletedMatch {
  readonly matchId: string;
  readonly mode: ModeId;
  readonly opponent: 'ai' | 'local';
  readonly difficulty: Difficulty;
  /** Did the side containing human Player 1 win? */
  readonly player1Won: boolean;
  /** Two humans on the same side (Partnership, across). */
  readonly humansArePartners: boolean;
}

/** Pure: add a completed match unless that match id was already recorded. */
export function recordCompleted(s: Stats, m: CompletedMatch): Stats {
  if (s.recorded.includes(m.matchId)) return s;
  const recorded = [...s.recorded, m.matchId].slice(-100);
  if (m.opponent === 'ai') {
    const cur = s.solo[m.mode][m.difficulty];
    const next = m.player1Won ? { wins: cur.wins + 1, losses: cur.losses } : { wins: cur.wins, losses: cur.losses + 1 };
    return { ...s, recorded, solo: { ...s.solo, [m.mode]: { ...s.solo[m.mode], [m.difficulty]: next } } };
  }
  const local = { ...s.local, [m.mode]: { completed: s.local[m.mode].completed + 1 } };
  const localPartners = m.humansArePartners
    ? m.player1Won
      ? { ...s.localPartners, wins: s.localPartners.wins + 1 }
      : { ...s.localPartners, losses: s.localPartners.losses + 1 }
    : s.localPartners;
  return { ...s, recorded, local, localPartners };
}

/** Pure: a match given up before its end (separate from losses; once per id). */
export function recordAbandoned(s: Stats, matchId: string, mode: ModeId): Stats {
  if (s.recorded.includes(matchId)) return s;
  return { ...s, recorded: [...s.recorded, matchId].slice(-100), abandoned: { ...s.abandoned, [mode]: s.abandoned[mode] + 1 } };
}

export function loadStats(store: KeyValueStore | null): { stats: Stats; status: ReadStatus } {
  const r = readRecord(store, STATS_SPEC);
  return { stats: r.value ?? emptyStats(), status: r.status };
}

/** True when stored; false when storage refused (the caller reports it and may retry). */
export function saveStats(store: KeyValueStore | null, s: Stats): boolean {
  return writeRecord(store, STATS_SPEC, s);
}

export function resetStats(store: KeyValueStore | null): Stats {
  removeRecord(store, STATS_SPEC.key);
  return emptyStats();
}

export function totals(s: Stats): { completed: number; wins: number; losses: number; abandoned: number } {
  let wins = 0;
  let losses = 0;
  for (const m of MODES)
    for (const d of DIFFS) {
      wins += s.solo[m][d].wins;
      losses += s.solo[m][d].losses;
    }
  const localCompleted = MODES.reduce((a, m) => a + s.local[m].completed, 0);
  return { completed: wins + losses + localCompleted, wins, losses, abandoned: MODES.reduce((a, m) => a + s.abandoned[m], 0) };
}
