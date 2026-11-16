/**
 * Versioned local match save. Holds the full deterministic match state (which
 * carries the rules preset id + version in its config), the AI RNG streams and
 * the app-level setup — never presentation state, so a restore can't resume a
 * half-finished animation. It is ordinary shared-device convenience: anyone
 * with devtools can read it; it is never sent anywhere, and a resumed
 * two-human game always opens behind the privacy cover.
 *
 * v1 (Stage 5) was an un-enveloped object; it is migrated on read.
 */
import type { Difficulty } from '../ai/types';
import { DIFFICULTIES } from '../ai/types';
import { isRngState, type RngState } from '../engine/rng';
import { getRulesPreset } from '../engine/rules/presets';
import { restoreMatch } from '../engine/serialize';
import type { MatchState } from '../engine/state';
import type { GameSession, OpponentKind } from './session';
import { IncompatibleRecord, readRecord, removeRecord, writeRecord, type KeyValueStore, type ReadResult, type RecordSpec } from './storage';

export type { KeyValueStore } from './storage';

export const SAVE_KEY = 'sticks-and-bones.save';
export const SAVE_FORMAT = 'sticks-and-bones/match';
export const SAVE_VERSION = 2;
const LEGACY_V1_FORMAT = 'sticks-and-bones-save@1';

export interface SavedGame {
  /** Stable id for this match (statistics are recorded once per id). */
  readonly matchId: string;
  readonly savedAt: number;
  readonly opponent: Exclude<OpponentKind, 'dev-both'>;
  readonly difficulty: Difficulty;
  /** Rules preset the state was played under (duplicated from state.config for a quick compatibility check). */
  readonly rules: { readonly presetId: string; readonly presetVersion: number };
  readonly state: MatchState;
  readonly aiRng: readonly RngState[];
}

export function newMatchId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const a = new Uint32Array(4);
  c?.getRandomValues?.(a);
  return [...a].map((n) => n.toString(16).padStart(8, '0')).join('-');
}

function validate(data: unknown): SavedGame | null {
  if (typeof data !== 'object' || data === null) return null;
  const g = data as Partial<SavedGame>;
  if (typeof g.matchId !== 'string' || !g.matchId) return null;
  if (g.opponent !== 'ai' && g.opponent !== 'local') return null;
  if (!DIFFICULTIES.includes(g.difficulty as Difficulty)) return null;
  if (!Array.isArray(g.aiRng) || !g.aiRng.every(isRngState)) return null;
  const r = g.rules;
  if (!r || typeof r.presetId !== 'string' || typeof r.presetVersion !== 'number') return null;
  if (!getRulesPreset(r.presetId, r.presetVersion)) throw new IncompatibleRecord(`unknown rules preset ${r.presetId}@${r.presetVersion}`);
  const restored = restoreMatch(g.state);
  if (!restored.ok) return null;
  const st = restored.state;
  if (st.config.rules.presetId !== r.presetId || st.config.rules.presetVersion !== r.presetVersion) return null;
  if (st.phase === 'match-over') return null; // finished matches are not resumable
  if (g.aiRng.length !== st.config.seats.length) return null;
  return { matchId: g.matchId, savedAt: typeof g.savedAt === 'number' ? g.savedAt : 0, opponent: g.opponent, difficulty: g.difficulty as Difficulty, rules: { presetId: r.presetId, presetVersion: r.presetVersion }, state: st, aiRng: g.aiRng };
}

export const SAVE_SPEC: RecordSpec<SavedGame> = {
  key: SAVE_KEY,
  format: SAVE_FORMAT,
  version: SAVE_VERSION,
  validate,
  migrate(from, data) {
    if (from !== 0) return null;
    const v1 = data as { format?: unknown; opponent?: unknown; difficulty?: unknown; state?: { config?: { rules?: unknown } }; aiRng?: unknown };
    if (v1?.format !== LEGACY_V1_FORMAT) return null;
    return { matchId: newMatchId(), savedAt: 0, opponent: v1.opponent, difficulty: v1.difficulty, rules: v1.state?.config?.rules, state: v1.state, aiRng: v1.aiRng };
  },
};

export function writeSave(store: KeyValueStore | null, session: GameSession, matchId: string): boolean {
  if (!store || session.opponent === 'dev-both') return false;
  const state = session.debugState();
  if (state.phase === 'match-over') {
    removeRecord(store, SAVE_KEY);
    return true;
  }
  const game: SavedGame = {
    matchId,
    savedAt: Date.now(),
    opponent: session.opponent,
    difficulty: session.difficulty,
    rules: { presetId: state.config.rules.presetId, presetVersion: state.config.rules.presetVersion },
    state,
    aiRng: session.exportAiRng(),
  };
  return writeRecord(store, SAVE_SPEC, game);
}

export function clearSave(store: KeyValueStore | null): void {
  removeRecord(store, SAVE_KEY);
}

/** Read and fully re-validate a save. Anything damaged or incompatible is set aside, never thrown. */
export function readSave(store: KeyValueStore | null): ReadResult<SavedGame> {
  return readRecord(store, SAVE_SPEC);
}

/** Browser storage if usable (private modes can throw), otherwise null. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    const probe = `${SAVE_KEY}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
